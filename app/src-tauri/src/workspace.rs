use crate::errors::AppError;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
};

pub const MAX_FILES: usize = 20_000;
pub const SAMPLE_ID: &str = "sample";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    Folder,
    Document,
    Image,
}

#[derive(Debug, Serialize)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub kind: NodeKind,
    pub children: Vec<TreeNode>,
}

#[derive(Debug, Serialize)]
pub struct Tree {
    pub root: TreeNode,
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub root: PathBuf,
    #[serde(default)]
    pub available: bool,
}

impl Collection {
    pub fn new(root: PathBuf) -> Self {
        let name = root
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| root.to_string_lossy().into_owned());
        Collection { id: collection_id(&root), name, root, available: true }
    }
}

/// Stable 64-bit FNV-1a hash of the folder path, in hex.
pub fn collection_id(root: &Path) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in root.to_string_lossy().as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{hash:016x}")
}

pub fn collections_from_library(lib: &Value) -> Vec<Collection> {
    // A malformed entry is skipped so one bad record cannot erase the rest on the next save.
    // The reserved sample id and repeated ids are dropped (first wins) so ids stay unique.
    let mut out: Vec<Collection> = Vec::new();
    for v in lib.get("collections").and_then(Value::as_array).into_iter().flatten() {
        let Ok(c) = serde_json::from_value::<Collection>(v.clone()) else { continue };
        if c.id != SAMPLE_ID && !out.iter().any(|o| o.id == c.id) {
            out.push(c);
        }
    }
    out
}

/// A copy of the collections with `available` set from whether each folder is reachable right now.
pub fn with_availability(cols: &[Collection]) -> Vec<Collection> {
    cols.iter().cloned().map(|mut c| { c.available = c.root.is_dir(); c }).collect()
}

/// "C:\docs\wiki\README.md" -> ("C:\docs\wiki", "README.md")
pub fn split_file(file: &Path) -> Result<(PathBuf, String), AppError> {
    let name = file.file_name().ok_or(AppError::NotFound)?.to_string_lossy().into_owned();
    let parent = file.parent().ok_or(AppError::NotFound)?;
    Ok((parent.to_path_buf(), name))
}

pub fn collections_to_json(cols: &[Collection]) -> Value {
    json!(cols
        .iter()
        .filter(|c| c.id != SAMPLE_ID)
        .map(|c| json!({ "id": c.id, "name": c.name, "root": c.root.to_string_lossy() }))
        .collect::<Vec<_>>())
}

/// Document, image, or None for a file the tree doesn't show. Works on a name or a relative path.
pub fn kind_of(name: &str) -> Option<NodeKind> {
    let ext = name.rsplit_once('.')?.1.to_ascii_lowercase();
    match ext.as_str() {
        "md" | "markdown" | "txt" => Some(NodeKind::Document),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" => Some(NodeKind::Image),
        _ => None,
    }
}

pub fn build_tree(root: &Path) -> Result<Tree, AppError> {
    build_tree_with_cap(root, MAX_FILES)
}

pub fn build_tree_with_cap(root: &Path, cap: usize) -> Result<Tree, AppError> {
    if !root.is_dir() {
        return Err(AppError::CollectionUnavailable);
    }
    let mut count = 0;
    let mut truncated = false;
    // The folder can vanish between the is_dir check and read_dir; that is unavailable, not a generic error.
    let children = walk(root, "", cap, &mut count, &mut truncated).map_err(|e| match e {
        AppError::NotFound => AppError::CollectionUnavailable,
        other => other,
    })?;
    let name = root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    Ok(Tree { root: TreeNode { name, path: String::new(), kind: NodeKind::Folder, children }, truncated })
}

fn walk(dir: &Path, rel: &str, cap: usize, count: &mut usize, truncated: &mut bool) -> Result<Vec<TreeNode>, AppError> {
    let mut files = Vec::new();
    let mut dirs = Vec::new();
    for entry in fs::read_dir(dir)?.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let Ok(file_type) = entry.file_type() else { continue };
        if name.starts_with('.') || name == "node_modules" || file_type.is_symlink() {
            continue;
        }
        let path = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
        if file_type.is_dir() {
            dirs.push((name, path));
        } else if let Some(kind) = kind_of(&name) {
            files.push(TreeNode { name, path, kind, children: Vec::new() });
        }
    }
    files.sort_by_key(|n| n.name.to_lowercase());
    dirs.sort_by_key(|(name, _)| name.to_lowercase());

    let mut out = Vec::new();
    for file in files {
        if *count >= cap {
            *truncated = true;
            return Ok(out);
        }
        *count += 1;
        out.push(file);
    }
    for (name, path) in dirs {
        if *count >= cap {
            *truncated = true;
            break;
        }
        // An unreadable subfolder is skipped, not fatal.
        let children = walk(&dir.join(&name), &path, cap, count, truncated).unwrap_or_default();
        if !children.is_empty() {
            out.push(TreeNode { name, path, kind: NodeKind::Folder, children });
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::errors::AppError;
    use serde_json::json;
    use std::fs;

    fn fixture() -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        let p = d.path();
        for dir in ["Guides", "Images", ".git", "node_modules/pkg", "Empty"] {
            fs::create_dir_all(p.join(dir)).unwrap();
        }
        for (file, body) in [
            ("README.md", "# R"), ("notes.txt", "n"), ("data.csv", "a,b"),
            ("Guides/Intro.md", "# I"), ("Images/a.svg", "<svg/>"),
            (".git/config", "x"), ("node_modules/pkg/readme.md", "x"),
        ] {
            fs::write(p.join(file), body).unwrap();
        }
        d
    }

    fn names(nodes: &[TreeNode]) -> Vec<&str> {
        nodes.iter().map(|n| n.name.as_str()).collect()
    }

    fn count_files(n: &TreeNode) -> usize {
        n.children.iter().map(|c| if c.kind == NodeKind::Folder { count_files(c) } else { 1 }).sum()
    }

    #[test]
    fn tree_lists_documents_and_images_only() {
        let d = fixture();
        let tree = build_tree(d.path()).unwrap();
        assert_eq!(names(&tree.root.children), ["notes.txt", "README.md", "Guides", "Images"]);
        assert!(!tree.truncated);
    }

    #[test]
    fn paths_are_relative_with_forward_slashes() {
        let d = fixture();
        let tree = build_tree(d.path()).unwrap();
        let guides = tree.root.children.iter().find(|n| n.name == "Guides").unwrap();
        assert_eq!(guides.children[0].path, "Guides/Intro.md");
        assert_eq!(guides.children[0].kind, NodeKind::Document);
    }

    #[test]
    fn stops_at_file_cap() {
        let d = fixture();
        let tree = build_tree_with_cap(d.path(), 3).unwrap();
        assert!(tree.truncated);
        assert_eq!(count_files(&tree.root), 3);
    }

    #[test]
    fn missing_root_is_unavailable() {
        let d = fixture();
        assert_eq!(build_tree(&d.path().join("unplugged")).unwrap_err(), AppError::CollectionUnavailable);
    }

    #[test]
    fn collection_ids_are_stable_and_distinct() {
        let a = collection_id(Path::new("/docs/a"));
        assert_eq!(a, collection_id(Path::new("/docs/a")));
        assert_ne!(a, collection_id(Path::new("/docs/b")));
        assert_eq!(a.len(), 16);
    }

    #[test]
    fn collections_round_trip_through_library_json_without_sample() {
        let cols = vec![
            Collection { id: SAMPLE_ID.into(), name: "Sample library".into(), root: "/res/sample-wiki".into(), available: true },
            Collection::new("/docs/My Wiki".into()),
        ];
        let lib = json!({ "version": 1, "collections": collections_to_json(&cols) });
        let back = collections_from_library(&lib);
        assert_eq!(back.len(), 1);
        assert_eq!(back[0].name, "My Wiki");
        assert_eq!(back[0].id, cols[1].id);
    }

    #[test]
    fn malformed_entry_is_skipped_not_fatal() {
        let lib = json!({ "version": 1, "collections": [
            { "id": "a1", "name": "Good", "root": "/docs/Good" },
            { "id": "x" }
        ]});
        let back = collections_from_library(&lib);
        assert_eq!(back.len(), 1);
        assert_eq!(back[0].name, "Good");
    }

    #[test]
    fn missing_collections_key_gives_empty_list() {
        assert!(collections_from_library(&json!({ "version": 1 })).is_empty());
    }

    #[test]
    fn sample_id_and_duplicates_are_dropped_on_load() {
        let lib = json!({ "version": 1, "collections": [
            { "id": "sample", "name": "Fake", "root": "/x" },
            { "id": "a1", "name": "First", "root": "/docs/First" },
            { "id": "a1", "name": "Second", "root": "/docs/Second" }
        ]});
        let back = collections_from_library(&lib);
        assert_eq!(back.len(), 1);
        assert_eq!(back[0].name, "First");
    }

    #[test]
    fn split_file_gives_folder_and_name() {
        let (root, name) = split_file(Path::new("/docs/wiki/README.md")).unwrap();
        assert_eq!(root, PathBuf::from("/docs/wiki"));
        assert_eq!(name, "README.md");
    }

    #[test]
    fn split_file_rejects_a_bare_root() {
        assert_eq!(split_file(Path::new("/")).unwrap_err(), AppError::NotFound);
    }

    #[test]
    fn availability_follows_the_folder() {
        let d = fixture();
        let cols = vec![
            Collection::new(d.path().to_path_buf()),
            Collection::new(d.path().join("unplugged")),
        ];
        let out = with_availability(&cols);
        assert!(out[0].available);
        assert!(!out[1].available);
    }

    #[test]
    #[ignore = "speed check: cargo test --release tree_speed -- --ignored"]
    fn tree_speed_1000_files() {
        let d = tempfile::tempdir().unwrap();
        for s in 0..20 {
            let dir = d.path().join(format!("Section {s:02}"));
            std::fs::create_dir(&dir).unwrap();
            for f in 0..50 {
                std::fs::write(dir.join(format!("Page {f:02}.md")), "# Page
").unwrap();
            }
        }
        let started = std::time::Instant::now();
        let tree = build_tree(d.path()).unwrap();
        println!("took {:?}", started.elapsed());
        assert_eq!(tree.root.children.len(), 20);
        assert!(started.elapsed().as_millis() < 2000, "took {:?}", started.elapsed());
    }
}
