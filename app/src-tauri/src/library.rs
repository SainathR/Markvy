#![allow(clippy::disallowed_methods)] // the only two files allowed to write (spec §6, amendment A8)
use crate::errors::AppError;
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

const FILE: &str = "library.json";
const BACKUP: &str = "library.json.bak";
const TEMP: &str = "library.json.tmp";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadResult {
    pub library: Value,
    /// True when a damaged library was set aside and a fresh one started.
    pub reset: bool,
}

impl LoadResult {
    pub fn fresh() -> Self {
        LoadResult { library: json!({ "version": 1, "collections": [] }), reset: false }
    }
}

pub fn load(dir: &Path) -> Result<LoadResult, AppError> {
    let path = dir.join(FILE);
    let raw = match fs::read(&path) {
        Ok(b) => b,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(LoadResult::fresh()),
        Err(e) => return Err(AppError::from_io(e)),
    };
    match serde_json::from_slice::<Value>(&raw) {
        Ok(v) if v.get("version") == Some(&json!(1)) => Ok(LoadResult { library: v, reset: false }),
        _ => {
            fs::rename(&path, free_backup_path(dir))?;
            Ok(LoadResult { reset: true, ..LoadResult::fresh() })
        }
    }
}

/// library.json.bak, then .bak.1, .bak.2 … so a later damaged file never overwrites an earlier copy.
fn free_backup_path(dir: &Path) -> PathBuf {
    let first = dir.join(BACKUP);
    if !first.exists() {
        return first;
    }
    (1..).map(|n| dir.join(format!("{BACKUP}.{n}"))).find(|p| !p.exists()).expect("unbounded range")
}

/// Atomic, durable save: write a temporary file, flush it to disk, then rename it over the old one.
/// A reader never sees a partial file, and a power loss cannot leave a truncated library.json.
/// This is the only file the app ever writes.
pub fn save(dir: &Path, library: &Value) -> Result<(), AppError> {
    fs::create_dir_all(dir)?;
    let bytes = serde_json::to_vec_pretty(library).map_err(|e| AppError::Internal(e.to_string()))?;
    let temp = dir.join(TEMP);
    let mut file = fs::File::create(&temp)?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    drop(file);
    fs::rename(&temp, dir.join(FILE))?;
    Ok(())
}

/// Markvy was called Folio before its first release. On first start, copy the old library.json across
/// so collections, progress and preferences survive the rename. The old folder is left untouched.
/// Returns true when a library was imported.
pub fn import_from(old_dir: &Path, dir: &Path) -> io::Result<bool> {
    let source = old_dir.join(FILE);
    if dir.join(FILE).exists() || !source.is_file() {
        return Ok(false);
    }
    fs::create_dir_all(dir)?;
    let temp = dir.join(TEMP);
    fs::copy(&source, &temp)?;
    fs::rename(&temp, dir.join(FILE))?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;

    #[test]
    fn missing_file_gives_fresh_library() {
        let d = tempfile::tempdir().unwrap();
        let r = load(d.path()).unwrap();
        assert_eq!(r.library["version"], json!(1));
        assert!(!r.reset);
    }

    #[test]
    fn save_then_load_round_trips() {
        let d = tempfile::tempdir().unwrap();
        let lib = json!({ "version": 1, "favorites": ["sample/README.md"] });
        save(d.path(), &lib).unwrap();
        assert_eq!(load(d.path()).unwrap().library, lib);
    }

    #[test]
    fn save_creates_missing_folder() {
        let d = tempfile::tempdir().unwrap();
        let nested = d.path().join("Markvy");
        save(&nested, &json!({ "version": 1 })).unwrap();
        assert!(nested.join("library.json").is_file());
    }

    #[test]
    fn damaged_file_is_backed_up_and_reset() {
        let d = tempfile::tempdir().unwrap();
        fs::write(d.path().join("library.json"), "{not json").unwrap();
        let r = load(d.path()).unwrap();
        assert!(r.reset);
        assert_eq!(r.library["version"], json!(1));
        assert_eq!(fs::read_to_string(d.path().join("library.json.bak")).unwrap(), "{not json");
    }

    #[test]
    fn non_utf8_file_is_backed_up_and_reset() {
        let d = tempfile::tempdir().unwrap();
        fs::write(d.path().join("library.json"), b"\xFF\xFE{bad").unwrap();
        let r = load(d.path()).unwrap();
        assert!(r.reset);
        assert_eq!(r.library["version"], json!(1));
        assert_eq!(fs::read(d.path().join("library.json.bak")).unwrap(), b"\xFF\xFE{bad");
    }

    #[test]
    fn unknown_version_is_reset() {
        let d = tempfile::tempdir().unwrap();
        fs::write(d.path().join("library.json"), r#"{"version":99}"#).unwrap();
        assert!(load(d.path()).unwrap().reset);
    }

    #[test]
    fn old_library_is_imported_once_and_never_overwrites() {
        let d = tempfile::tempdir().unwrap();
        let (old, new) = (d.path().join("old-app-id"), d.path().join("new-app-id"));
        assert!(!import_from(&old, &new).unwrap()); // nothing to import
        save(&old, &json!({ "version": 1, "favorites": ["a.md"] })).unwrap();
        assert!(import_from(&old, &new).unwrap());
        assert_eq!(load(&new).unwrap().library["favorites"], json!(["a.md"]));
        assert!(old.join("library.json").is_file()); // old folder left as it was
        save(&new, &json!({ "version": 1, "favorites": ["b.md"] })).unwrap();
        assert!(!import_from(&old, &new).unwrap()); // an existing new library always wins
        assert_eq!(load(&new).unwrap().library["favorites"], json!(["b.md"]));
    }

    #[test]
    fn second_damage_keeps_first_backup() {
        let d = tempfile::tempdir().unwrap();
        fs::write(d.path().join("library.json"), "first").unwrap();
        assert!(load(d.path()).unwrap().reset);
        fs::write(d.path().join("library.json"), "second").unwrap();
        assert!(load(d.path()).unwrap().reset);
        assert_eq!(fs::read_to_string(d.path().join("library.json.bak")).unwrap(), "first");
        assert_eq!(fs::read_to_string(d.path().join("library.json.bak.1")).unwrap(), "second");
    }
}
