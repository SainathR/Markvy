use serde::Serialize;
use std::io;

/// Every failure the screens can receive. The screens map each code to a plain-language message.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "code", content = "details")]
pub enum AppError {
    NotFound,
    CollectionUnavailable,
    AccessDenied,
    OutsideCollection,
    TooLarge,
    NotText,
    /// A picture from the internet couldn't be fetched (network failure, timeout, server error).
    ImageFailed,
    /// A picture link that isn't http(s), isn't a picture, or is over 5 MB.
    ImageRejected,
    /// A link Markvy won't open: only http, https and mailto leave the app.
    LinkRefused,
    /// Another program has the file open, so it can't be replaced right now.
    FileInUse,
    DiskFull,
    /// This document can't be edited: the Sample library, editing switched off, or text Markvy can't save back exactly.
    NotEditable,
    /// A file or folder name Markvy won't use. Details: Empty, Invalid, Reserved, Taken, TooLong, WrongType.
    NameRefused(String),
    /// The location has no Recycle Bin, so Markvy won't delete there.
    NoRecycleBin,
    /// A file changed after Markvy planned an action on it.
    Changed,
    /// Unexpected failure. The details go to the log and the Copy details button, never into the message.
    Internal(String),
}

/// The message of a caught panic, for the log and Copy details.
pub fn panic_text(payload: &(dyn std::any::Any + Send)) -> String {
    payload
        .downcast_ref::<&str>()
        .map(|s| s.to_string())
        .or_else(|| payload.downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "unknown".to_string())
}

impl AppError {
    pub fn from_io(e: io::Error) -> Self {
        match e.kind() {
            io::ErrorKind::NotFound => AppError::NotFound,
            io::ErrorKind::PermissionDenied => AppError::AccessDenied,
            _ => AppError::Internal(e.to_string()),
        }
    }
}

impl From<io::Error> for AppError {
    fn from(e: io::Error) -> Self {
        AppError::from_io(e)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io;

    #[test]
    fn unit_variant_serializes_as_code_only() {
        assert_eq!(serde_json::to_value(AppError::TooLarge).unwrap(), json!({ "code": "TooLarge" }));
    }

    #[test]
    fn internal_carries_details() {
        assert_eq!(
            serde_json::to_value(AppError::Internal("disk unreadable".into())).unwrap(),
            json!({ "code": "Internal", "details": "disk unreadable" })
        );
    }

    #[test]
    fn io_errors_map_to_codes() {
        assert_eq!(AppError::from_io(io::Error::from(io::ErrorKind::NotFound)), AppError::NotFound);
        assert_eq!(AppError::from_io(io::Error::from(io::ErrorKind::PermissionDenied)), AppError::AccessDenied);
        assert!(matches!(AppError::from_io(io::Error::from(io::ErrorKind::Other)), AppError::Internal(_)));
    }

    #[test]
    fn edit_codes_serialize_as_codes() {
        for (e, code) in [(AppError::FileInUse, "FileInUse"), (AppError::DiskFull, "DiskFull"), (AppError::NotEditable, "NotEditable"), (AppError::NoRecycleBin, "NoRecycleBin"), (AppError::Changed, "Changed")] {
            assert_eq!(serde_json::to_value(e).unwrap(), json!({ "code": code }));
        }
        assert_eq!(serde_json::to_value(AppError::NameRefused("Taken".into())).unwrap(), json!({ "code": "NameRefused", "details": "Taken" }));
    }

    #[test]
    fn picture_and_link_codes_serialize_as_codes() {
        for (e, code) in [(AppError::ImageFailed, "ImageFailed"), (AppError::ImageRejected, "ImageRejected"), (AppError::LinkRefused, "LinkRefused")] {
            assert_eq!(serde_json::to_value(e).unwrap(), json!({ "code": code }));
        }
    }

    #[test]
    fn panic_text_reads_both_payload_kinds() {
        let a = std::panic::catch_unwind(|| panic!("static text")).unwrap_err();
        let b = std::panic::catch_unwind(|| panic!("{}", String::from("owned"))).unwrap_err();
        assert_eq!(panic_text(&*a), "static text");
        assert_eq!(panic_text(&*b), "owned");
    }
}
