use crate::{paths, reader::MAX_BYTES, state::AppState};
use percent_encoding::percent_decode_str;
use std::borrow::Cow;
use tauri::{
    http::{header::CONTENT_TYPE, Request, Response, StatusCode},
    AppHandle, Manager, Runtime,
};

/// "/<collection-id>/<percent-encoded relative path>" -> (id, decoded path)
pub fn parse_asset_path(path: &str) -> Option<(String, String)> {
    let decoded = percent_decode_str(path.trim_start_matches('/')).decode_utf8().ok()?;
    let (id, rel) = decoded.split_once('/')?;
    if id.is_empty() || rel.is_empty() {
        return None;
    }
    Some((id.to_string(), rel.to_string()))
}

pub fn mime_for(path: &str) -> Option<&'static str> {
    let ext = path.rsplit_once('.')?.1.to_ascii_lowercase();
    match ext.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"),
        _ => None,
    }
}

/// The image behind a `markvy://` path, or None. Goes through the same path guard as documents.
pub fn serve_asset(state: &AppState, uri_path: &str) -> Option<(&'static str, Vec<u8>)> {
    let (id, rel) = parse_asset_path(uri_path)?;
    let mime = mime_for(&rel)?;
    let full = paths::resolve(&state.root_of(&id).ok()?, &rel).ok()?;
    if std::fs::metadata(&full).ok()?.len() > MAX_BYTES {
        return None;
    }
    Some((mime, std::fs::read(full).ok()?))
}

pub fn respond<R: Runtime>(app: &AppHandle<R>, request: &Request<Vec<u8>>) -> Response<Cow<'static, [u8]>> {
    match serve_asset(&app.state::<AppState>(), request.uri().path()) {
        Some((mime, b)) => Response::builder().header(CONTENT_TYPE, mime).body(Cow::Owned(b)).unwrap(),
        None => Response::builder().status(StatusCode::NOT_FOUND).body(Cow::Borrowed(&[][..])).unwrap(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{library::LoadResult, workspace::Collection};

    fn fixture() -> (tempfile::TempDir, AppState, String) {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("wiki");
        std::fs::create_dir_all(root.join("Images")).unwrap();
        std::fs::write(root.join("Images/a.svg"), b"<svg/>").unwrap();
        std::fs::write(root.join("Images/My Pic.png"), b"png").unwrap();
        std::fs::write(root.join("notes.md"), b"# hi").unwrap();
        std::fs::write(d.path().join("secret.png"), b"secret").unwrap();
        let root = dunce::canonicalize(root).unwrap();
        let c = Collection::new(root);
        let id = c.id.clone();
        (d, AppState::new(std::env::temp_dir(), vec![c], Ok(LoadResult::fresh())), id)
    }

    #[test]
    fn serves_a_good_image() {
        let (_d, s, id) = fixture();
        assert_eq!(serve_asset(&s, &format!("/{id}/Images/a.svg")), Some(("image/svg+xml", b"<svg/>".to_vec())));
    }

    #[test]
    fn serves_names_with_encoded_spaces() {
        let (_d, s, id) = fixture();
        assert_eq!(serve_asset(&s, &format!("/{id}/Images/My%20Pic.png")), Some(("image/png", b"png".to_vec())));
    }

    #[test]
    fn refuses_encoded_traversal() {
        let (_d, s, id) = fixture();
        assert_eq!(serve_asset(&s, &format!("/{id}/..%2F..%2Fsecret.png")), None);
    }

    #[test]
    fn refuses_non_images_and_unknown_collections() {
        let (_d, s, id) = fixture();
        assert_eq!(serve_asset(&s, &format!("/{id}/notes.md")), None);
        assert_eq!(serve_asset(&s, "/nope/Images/a.svg"), None);
    }

    #[test]
    fn parse_splits_collection_and_path() {
        assert_eq!(
            parse_asset_path("/abc123/Images/a.svg"),
            Some(("abc123".to_string(), "Images/a.svg".to_string()))
        );
    }

    #[test]
    fn parse_decodes_percent_encoding() {
        assert_eq!(
            parse_asset_path("/abc/My%20Notes/Caf%C3%A9%20%231.png"),
            Some(("abc".to_string(), "My Notes/Café #1.png".to_string()))
        );
    }

    #[test]
    fn parse_rejects_missing_parts() {
        assert_eq!(parse_asset_path("/abc"), None);
        assert_eq!(parse_asset_path("/abc/"), None);
    }

    #[test]
    fn only_images_have_a_mime_type() {
        assert_eq!(mime_for("a/B.SVG"), Some("image/svg+xml"));
        assert_eq!(mime_for("a/b.jpeg"), Some("image/jpeg"));
        assert_eq!(mime_for("notes.md"), None);
    }
}
