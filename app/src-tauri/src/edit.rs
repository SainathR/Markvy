#![allow(clippy::disallowed_methods)] // the one module that changes documents (spec amendment A16)
//! Every change Markvy makes to a person's files goes through here: atomic, fingerprint-checked, inside a collection.
use crate::{errors::AppError, reader};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs, io::{self, Write},
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};

pub fn fingerprint(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Encoding { Utf8, Utf8Bom, Utf16Le, Utf16Be }

pub fn encoding_of(bytes: &[u8]) -> Encoding {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) { Encoding::Utf8Bom }
    else if bytes.starts_with(&[0xFF, 0xFE]) { Encoding::Utf16Le }
    else if bytes.starts_with(&[0xFE, 0xFF]) { Encoding::Utf16Be }
    else { Encoding::Utf8 }
}

pub fn encode(text: &str, enc: Encoding) -> Vec<u8> {
    match enc {
        Encoding::Utf8 => text.as_bytes().to_vec(),
        Encoding::Utf8Bom => [&[0xEF, 0xBB, 0xBF][..], text.as_bytes()].concat(),
        Encoding::Utf16Le => [0xFF, 0xFE].into_iter().chain(text.encode_utf16().flat_map(u16::to_le_bytes)).collect(),
        Encoding::Utf16Be => [0xFE, 0xFF].into_iter().chain(text.encode_utf16().flat_map(u16::to_be_bytes)).collect(),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditSource { pub text: String, pub hash: String }

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum Saved { Saved { hash: String }, Conflict { text: String, hash: String } }

/// What the tree calls this file (by its resolved name): writes are limited to these kinds (spec §3.2).
fn kind(path: &Path) -> Option<crate::workspace::NodeKind> {
    crate::workspace::kind_of(&path.file_name()?.to_string_lossy())
}

fn is_document(path: &Path) -> bool { kind(path) == Some(crate::workspace::NodeKind::Document) }

fn read_capped(path: &Path) -> Result<Vec<u8>, AppError> {
    let meta = fs::metadata(path)?;
    if meta.is_dir() { return Err(AppError::NotText); }
    if meta.len() > reader::MAX_BYTES { return Err(AppError::TooLarge); }
    Ok(fs::read(path)?)
}

/// The text to edit and the fingerprint the save must still match. Text Markvy can't write back exactly is refused.
pub fn open(path: &Path) -> Result<EditSource, AppError> {
    let bytes = read_capped(path)?;
    let (text, lossy) = reader::decode(&bytes)?;
    if lossy { return Err(AppError::NotEditable); }
    Ok(EditSource { text, hash: fingerprint(&bytes) })
}

/// Writes `text` if the file is still the one the editor started from; otherwise returns what is on disk now.
/// The file keeps its encoding and byte-order mark.
pub fn save(path: &Path, text: &str, base_hash: &str) -> Result<Saved, AppError> {
    if !is_document(path) { return Err(AppError::NotEditable); }
    let current = read_capped(path)?;
    let now = fingerprint(&current);
    if now != base_hash {
        let (text, _) = reader::decode(&current)?;
        return Ok(Saved::Conflict { text, hash: now });
    }
    let bytes = encode(text, encoding_of(&current));
    write_atomic(path, &bytes)?;
    Ok(Saved::Saved { hash: fingerprint(&bytes) })
}

pub(crate) fn write_err(e: io::Error) -> AppError {
    match e.raw_os_error() {
        Some(32 | 33) if cfg!(windows) => return AppError::FileInUse,   // sharing / lock violation
        Some(26) if !cfg!(windows) => return AppError::FileInUse,       // ETXTBSY
        Some(39 | 112) if cfg!(windows) => return AppError::DiskFull,
        Some(28) if !cfg!(windows) => return AppError::DiskFull,        // ENOSPC
        _ => {}
    }
    AppError::from_io(e)
}

const TEMP_PREFIX: &str = ".~markvy-";

fn temp_name() -> String {
    let nanos = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    format!("{TEMP_PREFIX}{}-{nanos}.tmp", std::process::id())
}

/// Temporary files left by a crash, older than ten minutes so a save in progress elsewhere is never touched.
fn clean_stale_temps(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        let old = e.metadata().and_then(|m| m.modified()).ok()
            .and_then(|t| t.elapsed().ok()).is_some_and(|age| age > Duration::from_secs(600));
        if name.starts_with(TEMP_PREFIX) && name.ends_with(".tmp") && old {
            let _ = fs::remove_file(e.path());
        }
    }
}

/// Write a hidden temporary file next to the target, flush it, then rename it over the target.
/// A program holding the file open is retried for up to 2 seconds.
pub fn write_atomic(target: &Path, bytes: &[u8]) -> Result<(), AppError> {
    if fs::metadata(target).is_ok_and(|m| m.permissions().readonly()) { return Err(AppError::AccessDenied); }
    let dir = target.parent().ok_or(AppError::NotFound)?;
    clean_stale_temps(dir);
    let temp = dir.join(temp_name());
    let written = (|| -> io::Result<()> {
        let mut f = fs::OpenOptions::new().write(true).create_new(true).open(&temp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        #[cfg(unix)]
        if let Ok(meta) = fs::metadata(target) { fs::set_permissions(&temp, meta.permissions())?; }
        Ok(())
    })();
    if let Err(e) = written {
        let _ = fs::remove_file(&temp);
        return Err(write_err(e));
    }
    let mut tries = 0;
    loop {
        match fs::rename(&temp, target) {
            Ok(()) => return Ok(()),
            Err(e) => {
                // Windows refuses to replace a file another program holds open (access denied or sharing violation).
                let busy = cfg!(windows) && matches!(e.raw_os_error(), Some(5 | 32 | 33));
                if busy && tries < 20 {
                    tries += 1;
                    std::thread::sleep(Duration::from_millis(100));
                    continue;
                }
                let _ = fs::remove_file(&temp);
                return Err(if busy { AppError::FileInUse } else { write_err(e) });
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Draft { pub collection_id: String, pub path: String, pub base_hash: String, pub text: String, pub saved_at: u64 }

fn draft_file(data_dir: &Path, cid: &str, path: &str) -> PathBuf {
    data_dir.join("drafts").join(cid).join(format!("{}.json", fingerprint(path.as_bytes())))
}

pub fn save_draft(data_dir: &Path, d: &Draft) -> Result<(), AppError> {
    let file = draft_file(data_dir, &d.collection_id, &d.path);
    fs::create_dir_all(file.parent().expect("draft file has a folder")).map_err(write_err)?;
    let bytes = serde_json::to_vec(d).map_err(|e| AppError::Internal(e.to_string()))?;
    write_atomic(&file, &bytes)
}

pub fn take_draft(data_dir: &Path, cid: &str, path: &str) -> Result<Option<Draft>, AppError> {
    match fs::read(draft_file(data_dir, cid, path)) {
        Ok(b) => Ok(serde_json::from_slice(&b).ok()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(AppError::from_io(e)),
    }
}

pub fn discard_draft(data_dir: &Path, cid: &str, path: &str) -> Result<(), AppError> {
    match fs::remove_file(draft_file(data_dir, cid, path)) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => Err(AppError::from_io(e)),
        _ => Ok(()),
    }
}

/// Every readable draft; a damaged one is skipped so it can't block the rest.
pub fn list_drafts(data_dir: &Path) -> Vec<Draft> {
    let Ok(cols) = fs::read_dir(data_dir.join("drafts")) else { return vec![] };
    cols.flatten()
        .filter_map(|c| fs::read_dir(c.path()).ok())
        .flat_map(|files| files.flatten())
        .filter_map(|f| fs::read(f.path()).ok())
        .filter_map(|b| serde_json::from_slice::<Draft>(&b).ok())
        .collect()
}

const RESERVED: [&str; 22] = ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"];

fn refused(why: &str) -> AppError { AppError::NameRefused(why.into()) }

pub fn validate_name(name: &str) -> Result<(), AppError> {
    if name.trim().is_empty() { return Err(refused("Empty")); }
    if name.len() > 255 { return Err(refused("TooLong")); }
    let bad_char = name.chars().any(|c| c.is_control() || "<>:\"/\\|?*".contains(c));
    if bad_char || name.ends_with('.') || name.ends_with(' ') || name.starts_with('.') { return Err(refused("Invalid")); }
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    if RESERVED.contains(&stem.as_str()) { return Err(refused("Reserved")); }
    Ok(())
}

pub fn resolve_folder(root: &Path, folder: &str) -> Result<PathBuf, AppError> {
    let dir = if folder.is_empty() { dunce::canonicalize(root).map_err(|_| AppError::CollectionUnavailable)? } else { crate::paths::resolve(root, folder)? };
    if !dir.is_dir() { return Err(AppError::NotFound); }
    Ok(dir)
}

/// Another entry in `dir` with this name, ignoring letter case (`except` is the entry being renamed).
fn taken(dir: &Path, name: &str, except: Option<&str>) -> Result<bool, AppError> {
    let lower = name.to_lowercase();
    Ok(fs::read_dir(dir)?.flatten().any(|e| {
        let n = e.file_name().to_string_lossy().into_owned();
        n.to_lowercase() == lower && Some(n.as_str()) != except
    }))
}

/// Like `paths::resolve`, but never the collection root itself ("." resolves to it).
fn resolve_entry(root: &Path, rel: &str) -> Result<PathBuf, AppError> {
    let p = crate::paths::resolve(root, rel)?;
    if p == dunce::canonicalize(root).map_err(|_| AppError::CollectionUnavailable)? { return Err(AppError::OutsideCollection); }
    Ok(p)
}

fn too_long(path: &Path) -> bool { cfg!(windows) && path.as_os_str().len() > 259 }

fn join_rel(folder: &str, name: &str) -> String { if folder.is_empty() { name.to_string() } else { format!("{folder}/{name}") } }

pub fn create_page(root: &Path, folder: &str, name: &str, title: &str) -> Result<String, AppError> {
    validate_name(name)?;
    if crate::workspace::kind_of(name) != Some(crate::workspace::NodeKind::Document) { return Err(refused("WrongType")); }
    let dir = resolve_folder(root, folder)?;
    if taken(&dir, name, None)? { return Err(refused("Taken")); }
    let file = dir.join(name);
    if too_long(&file) { return Err(refused("TooLong")); }
    let mut f = fs::OpenOptions::new().write(true).create_new(true).open(&file).map_err(write_err)?;
    f.write_all(format!("# {}\n", title.trim()).as_bytes()).map_err(write_err)?;
    f.sync_all().map_err(write_err)?;
    Ok(join_rel(folder, name))
}

pub fn create_folder(root: &Path, parent: &str, name: &str) -> Result<String, AppError> {
    validate_name(name)?;
    let dir = resolve_folder(root, parent)?;
    if taken(&dir, name, None)? { return Err(refused("Taken")); }
    if too_long(&dir.join(name)) { return Err(refused("TooLong")); }
    fs::create_dir(dir.join(name)).map_err(write_err)?;
    Ok(join_rel(parent, name))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEdit { pub path: String, pub text: String, pub base_hash: String }

pub fn rename_with_edits(root: &Path, from: &str, new_name: &str, edits: &[FileEdit]) -> Result<String, AppError> {
    rename_inner(root, from, new_name, edits, None)
}

/// Writes every link edit, then renames. Any failure undoes what was done, newest first.
/// `fail_at` makes step N fail, for tests: steps are the edits in order, then the rename.
fn rename_inner(root: &Path, from: &str, new_name: &str, edits: &[FileEdit], fail_at: Option<usize>) -> Result<String, AppError> {
    validate_name(new_name)?;
    let src = resolve_entry(root, from)?;
    if !src.is_dir() && !is_document(&src) { return Err(AppError::NotEditable); }
    if src.is_file() && crate::workspace::kind_of(new_name) != Some(crate::workspace::NodeKind::Document) { return Err(refused("WrongType")); }
    let dir = src.parent().ok_or(AppError::OutsideCollection)?;
    let old_name = src.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    if taken(dir, new_name, Some(&old_name))? { return Err(refused("Taken")); }
    let dest = dir.join(new_name);
    if too_long(&dest) { return Err(refused("TooLong")); }
    // Check every fingerprint before touching anything.
    let mut originals = Vec::new();
    for e in edits {
        let file = crate::paths::resolve(root, &e.path)?;
        if !is_document(&file) { return Err(AppError::NotEditable); }
        let bytes = read_capped(&file)?;
        if fingerprint(&bytes) != e.base_hash { return Err(AppError::Changed); }
        originals.push((file, bytes));
    }
    let undo = |done: usize, originals: &[(PathBuf, Vec<u8>)]| {
        for (file, bytes) in originals[..done].iter().rev() { let _ = write_atomic(file, bytes); }
    };
    for (i, (e, (file, bytes))) in edits.iter().zip(&originals).enumerate() {
        let result = if fail_at == Some(i) { Err(AppError::Internal("test failure".into())) } else { write_atomic(file, &encode(&e.text, encoding_of(bytes))) };
        if let Err(err) = result { undo(i, &originals); return Err(err); }
    }
    let renamed = if fail_at == Some(edits.len()) { Err(io::Error::other("test failure")) } else { fs::rename(&src, &dest) };
    if let Err(err) = renamed { undo(edits.len(), &originals); return Err(write_err(err)); }
    let parent = Path::new(from).parent().map(|p| p.to_string_lossy().replace('\\', "/")).unwrap_or_default();
    Ok(join_rel(&parent, new_name))
}

/// Only fixed local drives have a Recycle Bin on Windows; elsewhere the trash crate reports its absence.
#[cfg(windows)]
fn has_recycle_bin(path: &Path) -> bool {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::GetDriveTypeW;
    let full = path.to_string_lossy();
    if full.starts_with("\\\\?\\UNC\\") { return false; } // network share, long form
    let s = full.strip_prefix("\\\\?\\").unwrap_or(&full);
    if s.starts_with("\\\\") { return false; } // network share
    let Some(drive) = s.get(..3) else { return false };
    let wide: Vec<u16> = std::ffi::OsStr::new(drive).encode_wide().chain(Some(0)).collect();
    unsafe { GetDriveTypeW(wide.as_ptr()) == 3 } // DRIVE_FIXED
}
#[cfg(not(windows))]
fn has_recycle_bin(_: &Path) -> bool { true }

pub fn delete(root: &Path, rel: &str) -> Result<(), AppError> {
    let target = resolve_entry(root, rel)?;
    if !target.is_dir() && kind(&target).is_none() { return Err(AppError::NotEditable); } // folders, pages and pictures only
    if !has_recycle_bin(&target) { return Err(AppError::NoRecycleBin); }
    trash::delete(&target).map_err(|e| {
        let text = e.to_string();
        let lower = text.to_lowercase();
        if lower.contains("trash") || lower.contains("recycle") || lower.contains("mount") { AppError::NoRecycleBin } else { AppError::Internal(text) }
    })
}

pub const MAX_PICTURE: usize = 20 * 1024 * 1024;

fn picture_ext(b: &[u8]) -> Option<&'static str> {
    if b.starts_with(&[0x89, b'P', b'N', b'G']) { Some("png") }
    else if b.starts_with(&[0xFF, 0xD8, 0xFF]) { Some("jpg") }
    else if b.starts_with(b"GIF8") { Some("gif") }
    else if b.len() > 12 && &b[..4] == b"RIFF" && &b[8..12] == b"WEBP" { Some("webp") }
    else { None }
}

/// Saves a pasted picture as images/<page>-<n>.<ext> next to the page. Returns the link from the page.
pub fn save_picture(root: &Path, page: &str, bytes: &[u8]) -> Result<String, AppError> {
    let ext = picture_ext(bytes).filter(|_| bytes.len() <= MAX_PICTURE).ok_or(AppError::ImageRejected)?;
    let page_file = resolve_entry(root, page)?;
    if !page_file.is_file() { return Err(AppError::NotFound); }
    let dir = page_file.parent().ok_or(AppError::OutsideCollection)?.join("images");
    fs::create_dir_all(&dir).map_err(write_err)?;
    // An existing images/ junction or symbolic link must not lead out of the collection.
    // std forms on both sides: dunce keeps \\?\ only on long paths, so mixed forms would never match.
    let dir = fs::canonicalize(&dir)?;
    if !dir.starts_with(fs::canonicalize(root).map_err(|_| AppError::CollectionUnavailable)?) { return Err(AppError::OutsideCollection); }
    let stem = page_file.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "picture".into());
    for n in 1.. {
        let name = format!("{stem}-{n}.{ext}");
        match fs::OpenOptions::new().write(true).create_new(true).open(dir.join(&name)) {
            Ok(mut f) => {
                f.write_all(bytes).and_then(|_| f.sync_all()).map_err(write_err)?;
                return Ok(format!("images/{name}"));
            }
            // Only a name something really holds moves on; a false "exists" stops instead of looping.
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists && fs::symlink_metadata(dir.join(&name)).is_ok() => continue,
            Err(e) => return Err(write_err(e)),
        }
    }
    unreachable!("unbounded range")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn drafts_save_list_take_and_discard() {
        let d = tempfile::tempdir().unwrap();
        let draft = Draft { collection_id: "c1".into(), path: "Guides/A.md".into(), base_hash: "h".into(), text: "t".into(), saved_at: 5 };
        save_draft(d.path(), &draft).unwrap();
        assert_eq!(list_drafts(d.path()).len(), 1);
        assert_eq!(take_draft(d.path(), "c1", "Guides/A.md").unwrap().unwrap().text, "t");
        assert!(take_draft(d.path(), "c1", "Other.md").unwrap().is_none());
        discard_draft(d.path(), "c1", "Guides/A.md").unwrap();
        discard_draft(d.path(), "c1", "Guides/A.md").unwrap(); // a second discard is fine
        assert!(list_drafts(d.path()).is_empty());
    }

    #[test]
    fn a_damaged_draft_is_skipped_not_fatal() {
        let d = tempfile::tempdir().unwrap();
        fs::create_dir_all(d.path().join("drafts/c1")).unwrap();
        fs::write(d.path().join("drafts/c1/x.json"), "{broken").unwrap();
        assert!(list_drafts(d.path()).is_empty());
    }

    #[test]
    fn fingerprint_is_sha256_hex() {
        assert_eq!(fingerprint(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    #[test]
    fn encodings_round_trip() {
        for enc in [Encoding::Utf8, Encoding::Utf8Bom, Encoding::Utf16Le, Encoding::Utf16Be] {
            let bytes = encode("héllo\r\n", enc);
            assert_eq!(encoding_of(&bytes), enc);
            assert_eq!(crate::reader::decode(&bytes).unwrap().0, "héllo\r\n");
        }
    }

    #[test]
    fn open_returns_text_and_fingerprint_and_refuses_lossy_text() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("a.md");
        fs::write(&p, "# A\n").unwrap();
        let s = open(&p).unwrap();
        assert_eq!((s.text.as_str(), s.hash), ("# A\n", fingerprint(b"# A\n")));
        fs::write(&p, b"bad \xFF byte").unwrap();
        assert!(matches!(open(&p), Err(AppError::NotEditable)));
    }

    #[test]
    fn save_writes_when_unchanged_and_reports_a_conflict_otherwise() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("a.md");
        fs::write(&p, "one\n").unwrap();
        let base = fingerprint(b"one\n");
        let Saved::Saved { hash } = save(&p, "two\n", &base).unwrap() else { panic!("expected saved") };
        assert_eq!(fs::read_to_string(&p).unwrap(), "two\n");
        assert_eq!(hash, fingerprint(b"two\n"));
        match save(&p, "three\n", &base).unwrap() {
            Saved::Conflict { text, hash } => assert_eq!((text.as_str(), hash), ("two\n", fingerprint(b"two\n"))),
            Saved::Saved { .. } => panic!("expected a conflict"),
        }
        assert_eq!(fs::read_to_string(&p).unwrap(), "two\n");
    }

    #[test]
    fn save_keeps_utf16_and_bom() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("a.md");
        for enc in [Encoding::Utf8Bom, Encoding::Utf16Le, Encoding::Utf16Be] {
            let before = encode("old\r\n", enc);
            fs::write(&p, &before).unwrap();
            save(&p, "new\r\n", &fingerprint(&before)).unwrap();
            assert_eq!(fs::read(&p).unwrap(), encode("new\r\n", enc));
        }
    }

    #[test]
    fn atomic_write_leaves_no_temporary_file_and_cleans_old_ones() {
        let d = tempfile::tempdir().unwrap();
        let old = d.path().join(".~markvy-stale.tmp");
        fs::write(&old, "x").unwrap();
        let t = std::time::SystemTime::now() - std::time::Duration::from_secs(3600);
        fs::File::options().write(true).open(&old).unwrap().set_modified(t).unwrap();
        write_atomic(&d.path().join("a.md"), b"hi").unwrap();
        let names: Vec<String> = fs::read_dir(d.path()).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
        assert_eq!(names, vec!["a.md".to_string()]);
    }

    #[test]
    fn write_errors_map_to_codes() {
        assert_eq!(write_err(io::Error::from_raw_os_error(if cfg!(windows) { 32 } else { 26 })), AppError::FileInUse);
        assert_eq!(write_err(io::Error::from_raw_os_error(if cfg!(windows) { 112 } else { 28 })), AppError::DiskFull);
        assert_eq!(write_err(io::Error::from(io::ErrorKind::PermissionDenied)), AppError::AccessDenied);
    }

    fn reason(r: Result<impl std::fmt::Debug, AppError>) -> String {
        match r { Err(AppError::NameRefused(why)) => why, other => format!("{other:?}") }
    }

    #[test]
    fn names_follow_every_platforms_rules() {
        assert!(validate_name("Payment-Rules.md").is_ok());
        assert_eq!(reason(validate_name("  ")), "Empty");
        for bad in ["a:b.md", "a/b", "a\\b", "a?.md", "tab\there", "ends.", "ends ", ".hidden"] { assert_eq!(reason(validate_name(bad)), "Invalid", "{bad}"); }
        for bad in ["CON", "con.md", "Lpt9.txt", "AUX.markdown"] { assert_eq!(reason(validate_name(bad)), "Reserved", "{bad}"); }
        assert_eq!(reason(validate_name(&"a".repeat(256))), "TooLong");
    }

    #[test]
    fn creates_pages_and_folders_but_not_over_existing_names() {
        let d = tempfile::tempdir().unwrap();
        fs::create_dir(d.path().join("Guides")).unwrap();
        assert_eq!(create_page(d.path(), "Guides", "Payment-Rules.md", "Payment Rules").unwrap(), "Guides/Payment-Rules.md");
        assert_eq!(fs::read_to_string(d.path().join("Guides/Payment-Rules.md")).unwrap(), "# Payment Rules\n");
        assert_eq!(reason(create_page(d.path(), "Guides", "payment-rules.MD", "x")), "Taken");
        assert_eq!(reason(create_page(d.path(), "", "notes.pdf", "x")), "WrongType");
        assert_eq!(create_folder(d.path(), "Guides", "Archive").unwrap(), "Guides/Archive");
        assert!(matches!(create_page(d.path(), "../x", "a.md", "x"), Err(AppError::OutsideCollection)));
    }

    #[test]
    fn rename_applies_link_edits_and_the_rename_together() {
        let d = tempfile::tempdir().unwrap();
        fs::write(d.path().join("Old.md"), "# Old\n").unwrap();
        fs::write(d.path().join("Links.md"), "See [[Old]].\n").unwrap();
        let edits = [FileEdit { path: "Links.md".into(), text: "See [[New]].\n".into(), base_hash: fingerprint(b"See [[Old]].\n") }];
        assert_eq!(rename_with_edits(d.path(), "Old.md", "New.md", &edits).unwrap(), "New.md");
        assert!(d.path().join("New.md").is_file() && !d.path().join("Old.md").exists());
        assert_eq!(fs::read_to_string(d.path().join("Links.md")).unwrap(), "See [[New]].\n");
    }

    #[test]
    fn rename_refuses_stale_edits_and_undoes_everything_on_failure() {
        let d = tempfile::tempdir().unwrap();
        fs::write(d.path().join("Old.md"), "# Old\n").unwrap();
        fs::write(d.path().join("A.md"), "[[Old]]\n").unwrap();
        fs::write(d.path().join("B.md"), "[[Old]]\n").unwrap();
        let h = fingerprint(b"[[Old]]\n");
        let edits = [FileEdit { path: "A.md".into(), text: "[[New]]\n".into(), base_hash: h.clone() }, FileEdit { path: "B.md".into(), text: "[[New]]\n".into(), base_hash: h.clone() }];
        let stale = [FileEdit { path: "A.md".into(), text: "x".into(), base_hash: "other".into() }];
        assert_eq!(rename_with_edits(d.path(), "Old.md", "New.md", &stale), Err(AppError::Changed));
        for fail_at in 0..3 {
            assert!(rename_inner(d.path(), "Old.md", "New.md", &edits, Some(fail_at)).is_err(), "step {fail_at}");
            assert_eq!(fs::read_to_string(d.path().join("A.md")).unwrap(), "[[Old]]\n", "step {fail_at}");
            assert_eq!(fs::read_to_string(d.path().join("B.md")).unwrap(), "[[Old]]\n", "step {fail_at}");
            assert!(d.path().join("Old.md").is_file(), "step {fail_at}");
        }
    }

    #[test]
    fn a_case_only_rename_is_allowed() {
        let d = tempfile::tempdir().unwrap();
        fs::write(d.path().join("readme.md"), "x").unwrap();
        assert_eq!(rename_with_edits(d.path(), "readme.md", "README.md", &[]).unwrap(), "README.md");
        assert!(fs::read_dir(d.path()).unwrap().any(|e| e.unwrap().file_name() == "README.md"));
    }

    #[test]
    fn pictures_are_checked_and_numbered_next_to_the_page() {
        let d = tempfile::tempdir().unwrap();
        fs::create_dir(d.path().join("Guides")).unwrap();
        fs::write(d.path().join("Guides/Pay Rules.md"), "x").unwrap();
        let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0];
        assert_eq!(save_picture(d.path(), "Guides/Pay Rules.md", &png).unwrap(), "images/Pay Rules-1.png");
        assert_eq!(save_picture(d.path(), "Guides/Pay Rules.md", &png).unwrap(), "images/Pay Rules-2.png");
        assert_eq!(save_picture(d.path(), "Guides/Pay Rules.md", b"not a picture"), Err(AppError::ImageRejected));
        assert_eq!(save_picture(d.path(), "Guides/Pay Rules.md", &vec![0u8; 20 * 1024 * 1024 + 1]), Err(AppError::ImageRejected));
    }

    #[test]
    fn pictures_skip_any_entry_that_holds_the_next_name() {
        let d = tempfile::tempdir().unwrap();
        fs::write(d.path().join("A.md"), "x").unwrap();
        fs::create_dir_all(d.path().join("images/A-1.png")).unwrap();
        let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0];
        assert_eq!(save_picture(d.path(), "A.md", &png).unwrap(), "images/A-2.png");
    }

    #[test]
    fn pictures_save_next_to_a_page_whose_images_path_is_longer_than_260_characters() {
        let d = tempfile::tempdir().unwrap();
        let mut folder = d.path().to_path_buf();
        let mut rel = String::new();
        while folder.join("images").as_os_str().len() <= 270 {
            folder.push("abcdefghijklmnopqrst");
            rel.push_str("abcdefghijklmnopqrst/");
        }
        fs::create_dir_all(&folder).unwrap();
        fs::write(folder.join("A.md"), "x").unwrap();
        let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0];
        assert_eq!(save_picture(d.path(), &format!("{rel}A.md"), &png).unwrap(), "images/A-1.png");
        assert!(folder.join("images/A-1.png").is_file());
    }

    #[test]
    fn delete_refuses_the_collection_itself() {
        let d = tempfile::tempdir().unwrap();
        for p in ["", ".", "./"] { assert!(delete(d.path(), p).is_err(), "{p}"); }
        assert!(d.path().is_dir());
    }

    #[test]
    fn writes_refuse_files_that_are_not_documents() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path();
        fs::write(root.join("a.ps1"), "old").unwrap();
        fs::write(root.join("x.exe"), "bin").unwrap();
        fs::write(root.join("Page.md"), "[x](a.ps1)").unwrap();
        // Saving over a script, even with its correct fingerprint.
        assert_eq!(save(&root.join("a.ps1"), "new", &fingerprint(b"old")).unwrap_err(), AppError::NotEditable);
        // A rename's link edits may only change pages.
        let edit = FileEdit { path: "a.ps1".into(), text: "new".into(), base_hash: fingerprint(b"old") };
        assert_eq!(rename_with_edits(root, "Page.md", "Other.md", &[edit]).unwrap_err(), AppError::NotEditable);
        // Only pages and folders are renamed.
        assert_eq!(rename_with_edits(root, "x.exe", "x.md", &[]).unwrap_err(), AppError::NotEditable);
        // Delete takes folders, pages and pictures, nothing else.
        assert_eq!(delete(root, "a.ps1").unwrap_err(), AppError::NotEditable);
        assert_eq!(fs::read_to_string(root.join("a.ps1")).unwrap(), "old");
        assert!(root.join("x.exe").is_file() && root.join("Page.md").is_file() && !root.join("Other.md").exists());
    }

    #[cfg(windows)]
    #[test]
    fn pictures_never_follow_an_images_junction_out_of_the_collection() {
        let d = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(d.path().join("A.md"), "x").unwrap();
        // A directory junction needs no special privilege, unlike a symbolic link.
        let status = std::process::Command::new("cmd").args(["/C", "mklink", "/J"]).arg(d.path().join("images")).arg(outside.path()).status().unwrap();
        assert!(status.success());
        let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0];
        assert_eq!(save_picture(d.path(), "A.md", &png), Err(AppError::OutsideCollection));
        assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
    }

    #[cfg(unix)]
    #[test]
    fn pictures_never_follow_an_images_symlink_out_of_the_collection() {
        let d = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(d.path().join("A.md"), "x").unwrap();
        std::os::unix::fs::symlink(outside.path(), d.path().join("images")).unwrap();
        let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0];
        assert_eq!(save_picture(d.path(), "A.md", &png), Err(AppError::OutsideCollection));
        assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
    }

    #[test]
    fn dot_paths_never_reach_the_collection_itself() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("Coll");
        fs::create_dir_all(root.join("Sub")).unwrap();
        for dot in [".", "./", "./."] { assert!(delete(&root, dot).is_err(), "{dot}"); }
        assert!(rename_with_edits(&root, ".", "X", &[]).is_err());
        let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0];
        assert!(save_picture(&root, ".", &png).is_err());
        assert!(save_picture(&root, "Sub", &png).is_err());
        assert!(root.is_dir() && !d.path().join("images").exists() && !root.join("images").exists() && !root.join("Sub/images").exists());
        assert!(!d.path().join("X").exists());
    }
}
