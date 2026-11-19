#![allow(clippy::disallowed_methods)] // the only two files allowed to write (spec §6, amendment A8)
//! Technical details of failures (spec §5), kept in Markvy's own data folder for support and "Copy details".
//! Besides library.json this is the only file Markvy writes (amendment A8). It never holds document text.
use std::{
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const FILE: &str = "markvy.log";
const OLD: &str = "markvy.log.1";
pub const MAX_BYTES: u64 = 1024 * 1024;

pub fn dir(data_dir: &Path) -> PathBuf {
    data_dir.join("logs")
}

pub fn ensure_dir(data_dir: &Path) -> io::Result<PathBuf> {
    let logs = dir(data_dir);
    fs::create_dir_all(&logs)?;
    Ok(logs)
}

/// One line per entry: milliseconds since 1970, then the entry with any line breaks flattened.
pub fn append(data_dir: &Path, entry: &str) -> io::Result<()> {
    let logs = ensure_dir(data_dir)?;
    let path = logs.join(FILE);
    if fs::metadata(&path).is_ok_and(|m| m.len() >= MAX_BYTES) {
        // A failed rotation (another thread got there first, or the old file is locked) must not lose this entry.
        // ponytail: the log then just keeps growing until a rotation works.
        let _ = fs::rename(&path, logs.join(OLD));
    }
    let ms = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    // One write call for the whole line, so lines from parallel commands never interleave.
    let line = format!("{ms} {}\n", entry.replace(['\r', '\n'], " "));
    OpenOptions::new().create(true).append(true).open(&path)?.write_all(line.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn appends_one_line_per_entry_in_the_logs_folder() {
        let d = tempfile::tempdir().unwrap();
        append(d.path(), "read_document: {\"code\":\"NotFound\"}").unwrap();
        append(d.path(), "two\nlines").unwrap();
        let text = fs::read_to_string(dir(d.path()).join("markvy.log")).unwrap();
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].ends_with("read_document: {\"code\":\"NotFound\"}"));
        assert!(lines[1].ends_with("two lines"));
    }

    #[test]
    fn an_entry_is_kept_when_the_old_log_cannot_be_replaced() {
        let d = tempfile::tempdir().unwrap();
        let logs = ensure_dir(d.path()).unwrap();
        fs::write(logs.join("markvy.log"), vec![b'x'; MAX_BYTES as usize]).unwrap();
        // A non-empty folder named markvy.log.1 makes the rename fail on Windows and Unix alike.
        fs::create_dir_all(logs.join("markvy.log.1").join("keep")).unwrap();
        append(d.path(), "after").unwrap();
        assert!(fs::read_to_string(logs.join("markvy.log")).unwrap().ends_with("after\n"));
    }

    #[test]
    fn starts_a_new_file_at_the_size_limit() {
        let d = tempfile::tempdir().unwrap();
        let logs = ensure_dir(d.path()).unwrap();
        fs::write(logs.join("markvy.log"), vec![b'x'; MAX_BYTES as usize]).unwrap();
        append(d.path(), "after").unwrap();
        assert_eq!(fs::metadata(logs.join("markvy.log.1")).unwrap().len(), MAX_BYTES);
        assert!(fs::read_to_string(logs.join("markvy.log")).unwrap().ends_with("after\n"));
    }
}
