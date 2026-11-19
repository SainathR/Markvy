use crate::errors::AppError;
use serde::Serialize;
use std::{fs, path::Path, time::UNIX_EPOCH};

pub const MAX_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentText {
    pub text: String,
    pub size: u64,
    pub modified_ms: Option<u64>,
    /// True when some bytes couldn't be decoded and were replaced.
    pub lossy: bool,
}

/// Reads a document for display. Never writes: `fs::read` opens the file read-only.
pub fn read_text(path: &Path) -> Result<DocumentText, AppError> {
    let meta = fs::metadata(path)?;
    if meta.is_dir() {
        return Err(AppError::NotText);
    }
    if meta.len() > MAX_BYTES {
        return Err(AppError::TooLarge);
    }
    let bytes = fs::read(path)?;
    let (text, lossy) = decode(&bytes)?;
    let modified_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64);
    Ok(DocumentText { text, size: meta.len(), modified_ms, lossy })
}

pub(crate) fn decode(bytes: &[u8]) -> Result<(String, bool), AppError> {
    if let Some(rest) = bytes.strip_prefix(&[0xFF, 0xFE]) {
        return Ok(utf16(rest, u16::from_le_bytes));
    }
    if let Some(rest) = bytes.strip_prefix(&[0xFE, 0xFF]) {
        return Ok(utf16(rest, u16::from_be_bytes));
    }
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    if bytes.iter().take(8192).any(|&b| b == 0) {
        return Err(AppError::NotText);
    }
    Ok(match std::str::from_utf8(bytes) {
        Ok(s) => (s.to_owned(), false),
        Err(_) => (String::from_utf8_lossy(bytes).into_owned(), true),
    })
}

fn utf16(rest: &[u8], unit: fn([u8; 2]) -> u16) -> (String, bool) {
    let units: Vec<u16> = rest.chunks_exact(2).map(|c| unit([c[0], c[1]])).collect();
    let text = String::from_utf16_lossy(&units);
    let lossy = rest.len() % 2 != 0 || text.contains('\u{FFFD}');
    (text, lossy)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::errors::AppError;
    use std::fs;

    fn file_with(bytes: &[u8]) -> (tempfile::TempDir, std::path::PathBuf) {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("doc.md");
        fs::write(&p, bytes).unwrap();
        (d, p)
    }

    #[test]
    fn reads_utf8() {
        let (_d, p) = file_with(b"# Hello\n");
        let doc = read_text(&p).unwrap();
        assert_eq!(doc.text, "# Hello\n");
        assert_eq!(doc.size, 8);
        assert!(!doc.lossy);
        assert!(doc.modified_ms.is_some());
    }

    #[test]
    fn strips_utf8_bom() {
        let (_d, p) = file_with(b"\xEF\xBB\xBF# Hi");
        assert_eq!(read_text(&p).unwrap().text, "# Hi");
    }

    #[test]
    fn decodes_utf16le_with_bom() {
        let mut bytes = vec![0xFF, 0xFE];
        for unit in "# Hi".encode_utf16() {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        let (_d, p) = file_with(&bytes);
        let doc = read_text(&p).unwrap();
        assert_eq!(doc.text, "# Hi");
        assert!(!doc.lossy);
    }

    #[test]
    fn invalid_utf8_is_shown_lossy() {
        let (_d, p) = file_with(b"caf\xE9 au lait");
        let doc = read_text(&p).unwrap();
        assert!(doc.lossy);
        assert!(doc.text.starts_with("caf"));
    }

    #[test]
    fn nul_bytes_mean_not_text() {
        let (_d, p) = file_with(b"\x89PNG\r\n\x1a\n\0\0\0");
        assert_eq!(read_text(&p).unwrap_err(), AppError::NotText);
    }

    #[test]
    fn over_ten_megabytes_is_too_large() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("big.md");
        fs::File::create(&p).unwrap().set_len(MAX_BYTES + 1).unwrap();
        assert_eq!(read_text(&p).unwrap_err(), AppError::TooLarge);
    }

    #[test]
    fn directory_is_not_text() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(read_text(d.path()).unwrap_err(), AppError::NotText);
    }
}
