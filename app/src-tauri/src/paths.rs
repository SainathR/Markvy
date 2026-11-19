use crate::errors::AppError;
use std::path::{Component, Path, PathBuf};

/// The only way the core turns a collection-relative path into a real one.
/// Rejects anything that is, or would resolve to, a location outside `root`.
pub fn resolve(root: &Path, rel: &str) -> Result<PathBuf, AppError> {
    let rel_path = Path::new(rel);
    let bad_component = rel_path
        .components()
        .any(|c| matches!(c, Component::ParentDir | Component::RootDir | Component::Prefix(_)));
    if rel.is_empty() || rel_path.is_absolute() || bad_component {
        return Err(AppError::OutsideCollection);
    }
    // Containment uses std canonical forms: dunce drops the \\?\ prefix only for short paths, so a
    // short root and a long nested file could compare with mismatched prefixes. Return the dunce form.
    let std_root = std::fs::canonicalize(root).map_err(|_| AppError::CollectionUnavailable)?;
    let target = root.join(rel_path);
    let std_full = std::fs::canonicalize(&target).map_err(AppError::from_io)?;
    if !std_full.starts_with(&std_root) {
        return Err(AppError::OutsideCollection);
    }
    dunce::canonicalize(&target).map_err(AppError::from_io)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::errors::AppError::*;
    use std::fs;
    use tempfile::TempDir;

    fn setup() -> TempDir {
        let d = tempfile::tempdir().unwrap();
        fs::create_dir_all(d.path().join("Guides")).unwrap();
        fs::write(d.path().join("Guides/Security.md"), "# S").unwrap();
        fs::write(d.path().join("Café notes #1.md"), "# C").unwrap();
        d
    }

    #[test]
    fn resolves_file_inside_root() {
        let d = setup();
        assert!(resolve(d.path(), "Guides/Security.md").unwrap().ends_with("Security.md"));
    }

    #[test]
    fn resolves_names_with_spaces_and_accents() {
        let d = setup();
        assert!(resolve(d.path(), "Café notes #1.md").unwrap().ends_with("Café notes #1.md"));
    }

    #[test]
    fn rejects_parent_dir_segments() {
        let d = setup();
        assert_eq!(resolve(d.path(), "../secret.md"), Err(OutsideCollection));
        assert_eq!(resolve(d.path(), "Guides/../../secret.md"), Err(OutsideCollection));
    }

    #[test]
    fn rejects_absolute_and_empty_paths() {
        let d = setup();
        let abs = d.path().join("Guides/Security.md");
        assert_eq!(resolve(d.path(), abs.to_str().unwrap()), Err(OutsideCollection));
        assert_eq!(resolve(d.path(), ""), Err(OutsideCollection));
    }

    #[test]
    fn missing_file_is_not_found() {
        let d = setup();
        assert_eq!(resolve(d.path(), "Guides/Nope.md"), Err(NotFound));
    }

    #[test]
    fn missing_root_is_unavailable() {
        let d = setup();
        assert_eq!(resolve(&d.path().join("unplugged"), "a.md"), Err(CollectionUnavailable));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escaping_root() {
        let d = setup();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("x.md"), "x").unwrap();
        std::os::unix::fs::symlink(outside.path().join("x.md"), d.path().join("link.md")).unwrap();
        assert_eq!(resolve(d.path(), "link.md"), Err(OutsideCollection));
    }

    #[cfg(windows)]
    #[test]
    fn rejects_junction_escaping_root() {
        let d = setup();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("x.md"), "x").unwrap();
        let status = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(d.path().join("link"))
            .arg(outside.path())
            .status()
            .unwrap();
        assert!(status.success());
        assert_eq!(resolve(d.path(), "link/x.md"), Err(OutsideCollection));
    }
}
