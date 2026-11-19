//! Builds each folder's search index in the background and keeps it in step with changes on disk.
use crate::{
    errors::AppError,
    state::LockExt,
    paths, reader,
    search::{self, DocEntry, Filters, Scope, SearchResponse},
    workspace::{self, NodeKind, TreeNode},
};
use notify_debouncer_mini::{
    new_debouncer,
    notify::{RecommendedWatcher, RecursiveMode},
    DebounceEventResult, Debouncer,
};
use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet, HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex, Weak,
    },
    time::Duration,
};

#[derive(Debug, Default)]
pub struct CollectionIndex {
    pub docs: BTreeMap<String, DocEntry>,
    pub done: bool,
    /// Which build owns this entry; a build from before a forget-and-restart must not touch it.
    pub generation: u64,
    /// Documents the watcher changed while the build was still running; the build must not overwrite them.
    touched: BTreeSet<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexProgress {
    pub collection_id: String,
    pub indexed: usize,
    pub total: usize,
    pub done: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeKind {
    Created,
    Modified,
    Removed,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Change {
    pub path: String,
    pub kind: ChangeKind,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionChanged {
    pub collection_id: String,
    pub changes: Vec<Change>,
}

/// What the indexer tells the screens. The commands turn each one into a window event.
#[derive(Debug, Clone, PartialEq)]
pub enum Notice {
    Progress(IndexProgress),
    Changed(CollectionChanged),
    Unavailable(String),
}

pub type Emit = Arc<dyn Fn(Notice) + Send + Sync>;

const PROGRESS_EVERY: usize = 50;

/// Every document in the folder tree, in tree order (same limits as the tree).
pub fn document_paths(root: &Path) -> Result<Vec<String>, AppError> {
    fn collect(node: &TreeNode, out: &mut Vec<String>) {
        for c in &node.children {
            match c.kind {
                NodeKind::Folder => collect(c, out),
                NodeKind::Document => out.push(c.path.clone()),
                NodeKind::Image => {}
            }
        }
    }
    let tree = workspace::build_tree(root)?;
    let mut out = Vec::new();
    collect(&tree.root, &mut out);
    Ok(out)
}

/// Reads one document through the path guard, keeping the reason when it can't be read.
fn read_entry(root: &Path, rel: &str) -> Result<DocEntry, AppError> {
    let doc = reader::read_text(&paths::resolve(root, rel)?)?;
    Ok(search::extract(&doc.text, rel))
}

/// Reads one document through the path guard. An unreadable, too large or binary file is left out.
pub fn index_document(root: &Path, rel: &str) -> Option<DocEntry> {
    read_entry(root, rel).ok()
}

/// Indexes every document of one folder, reporting progress. Runs on a background thread.
/// Each file is read outside the lock, so searches are never held up by the disk.
/// Stops quietly once the folder is forgotten or restarted (another `generation`).
pub fn build(indexes: &Mutex<HashMap<String, CollectionIndex>>, id: &str, root: &Path, generation: u64, emit: &dyn Fn(Notice)) {
    let Ok(paths) = document_paths(root) else {
        let mut map = indexes.locked();
        if map.get(id).is_some_and(|i| i.generation == generation) {
            map.remove(id);
            drop(map);
            emit(Notice::Unavailable(id.to_string()));
        }
        return;
    };
    let total = paths.len();
    let progress = |indexed: usize, done: bool| {
        emit(Notice::Progress(IndexProgress { collection_id: id.to_string(), indexed, total, done }))
    };
    for (i, rel) in paths.iter().enumerate() {
        let entry = index_document(root, rel);
        {
            let mut map = indexes.locked();
            let Some(index) = map.get_mut(id).filter(|i| i.generation == generation) else { return }; // forgotten or restarted meanwhile
            if let Some(entry) = entry {
                if !is_touched(&index.touched, rel) {
                    index.docs.insert(rel.clone(), entry);
                }
            }
        }
        if (i + 1) % PROGRESS_EVERY == 0 && i + 1 < total {
            progress(i + 1, false);
        }
    }
    match indexes.locked().get_mut(id).filter(|i| i.generation == generation) {
        Some(index) => {
            index.done = true;
            index.touched.clear();
        }
        None => return,
    }
    progress(total, true);
}

/// A watcher path as a folder-relative path, or None when the tree wouldn't show it.
fn relative(root: &Path, path: &Path) -> Option<String> {
    let parts: Vec<String> = path
        .strip_prefix(root)
        .ok()?
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect();
    let hidden = parts.iter().any(|p| p.starts_with('.') || p == "node_modules");
    (!parts.is_empty() && !hidden).then(|| parts.join("/"))
}

/// True when the watcher changed this path, or a folder above it, during the build.
fn is_touched(touched: &BTreeSet<String>, rel: &str) -> bool {
    touched.contains(rel) || rel.match_indices('/').any(|(i, _)| touched.contains(&rel[..i]))
}

/// While the build is running, remember what the watcher changed so the build doesn't undo it.
fn touch(index: &mut CollectionIndex, rel: &str) {
    if !index.done {
        index.touched.insert(rel.to_string());
    }
}

fn put(index: &mut CollectionIndex, rel: &str, read: Result<DocEntry, AppError>, changes: &mut Vec<Change>) {
    touch(index, rel);
    let existed = index.docs.contains_key(rel);
    match read {
        Ok(entry) => {
            index.docs.insert(rel.to_string(), entry);
        }
        // Not a document any more (too large, binary): it leaves the index.
        Err(AppError::TooLarge | AppError::NotText) => {
            index.docs.remove(rel);
        }
        // Any other failure may be passing (an editor holding the file while it saves): keep what we had.
        Err(_) => {}
    }
    let kind = if existed { ChangeKind::Modified } else { ChangeKind::Created };
    changes.push(Change { path: rel.to_string(), kind });
}

/// What the disk said about one changed path. Read without any lock, applied to the index under the lock.
enum Seen {
    /// A folder that appeared or was renamed into place, with its documents already read.
    Folder { rel: String, docs: Vec<(String, Result<DocEntry, AppError>)> },
    Missing(String),
    Document(String, Result<DocEntry, AppError>),
    Picture(String),
}

impl Seen {
    fn rel(&self) -> &str {
        match self {
            Seen::Folder { rel, .. } | Seen::Missing(rel) | Seen::Document(rel, _) | Seen::Picture(rel) => rel,
        }
    }
}

/// Read phase: looks at each changed path and reads documents from disk. Takes no lock.
fn read_changes(root: &Path, changed: &[PathBuf]) -> Vec<Seen> {
    let rels: BTreeSet<String> = changed.iter().filter_map(|p| relative(root, p)).collect();
    let mut taken: HashSet<String> = HashSet::new(); // documents already read as part of a folder
    let mut seen = Vec::new();
    for rel in rels {
        if taken.contains(&rel) {
            continue;
        }
        let full = root.join(&rel);
        if full.is_dir() {
            let docs: Vec<(String, Result<DocEntry, AppError>)> = document_paths(&full)
                .unwrap_or_default()
                .into_iter()
                .map(|inner| {
                    let path = format!("{rel}/{inner}");
                    let read = read_entry(root, &path);
                    (path, read)
                })
                .collect();
            taken.extend(docs.iter().map(|(p, _)| p.clone()));
            seen.push(Seen::Folder { rel, docs });
        } else if !full.exists() {
            seen.push(Seen::Missing(rel));
        } else {
            match workspace::kind_of(&rel) {
                Some(NodeKind::Document) => {
                    let read = read_entry(root, &rel);
                    seen.push(Seen::Document(rel, read));
                }
                Some(_) => seen.push(Seen::Picture(rel)), // a picture: the tree may change
                None => {} // not something Markvy shows (temporary files, spreadsheets ...)
            }
        }
    }
    seen
}

/// Commit phase: applies what was read to the index and says what changed, for the screens. Runs under the lock.
/// A rename arrives as the old path (now missing) and the new one.
fn commit_changes(index: &mut CollectionIndex, seen: Vec<Seen>) -> Vec<Change> {
    let mut changes = Vec::new();
    let mut covered: HashSet<String> = HashSet::new(); // each path is reported once, the first kind wins
    for item in seen {
        if covered.contains(item.rel()) {
            continue;
        }
        let start = changes.len();
        match item {
            Seen::Folder { rel, docs } => {
                for (path, read) in docs {
                    put(index, &path, read, &mut changes);
                }
                changes.push(Change { path: rel, kind: ChangeKind::Created });
            }
            Seen::Missing(rel) => {
                touch(index, &rel);
                let prefix = format!("{rel}/");
                let gone: Vec<String> = index.docs.keys().filter(|k| **k == rel || k.starts_with(&prefix)).cloned().collect();
                for path in &gone {
                    index.docs.remove(path);
                    touch(index, path);
                }
                // ponytail: a removed folder holding only pictures sends nothing; the tree catches up on the next change.
                // A missing unindexed document is a temporary file, unless the build hasn't reached it yet: then it may be real.
                let kind = workspace::kind_of(&rel);
                if gone.is_empty() && (kind == Some(NodeKind::Image) || (!index.done && kind == Some(NodeKind::Document))) {
                    changes.push(Change { path: rel, kind: ChangeKind::Removed });
                }
                changes.extend(gone.into_iter().map(|path| Change { path, kind: ChangeKind::Removed }));
            }
            Seen::Document(rel, read) => put(index, &rel, read, &mut changes),
            Seen::Picture(rel) => changes.push(Change { path: rel, kind: ChangeKind::Modified }),
        }
        covered.extend(changes[start..].iter().map(|c| c.path.clone()));
    }
    // Nested folders in one batch (A and A/B) can still repeat a path.
    let mut seen = HashSet::new();
    changes.retain(|c| seen.insert(c.path.clone()));
    changes
}

/// Brings the index up to date with one batch of changed paths: reads first, then commits.
pub fn apply_changes(index: &mut CollectionIndex, root: &Path, changed: &[PathBuf]) -> Vec<Change> {
    commit_changes(index, read_changes(root, changed))
}

/// A build that panicked still ends: search must not say "still indexing" forever. Documents indexed so far stay searchable.
pub(crate) fn finish_after_panic(indexes: &Mutex<HashMap<String, CollectionIndex>>, id: &str, generation: u64, emit: &dyn Fn(Notice)) {
    let count = {
        let mut map = indexes.locked();
        let Some(index) = map.get_mut(id).filter(|i| i.generation == generation) else { return };
        index.done = true;
        index.touched.clear();
        index.docs.len()
    };
    emit(Notice::Progress(IndexProgress { collection_id: id.to_string(), indexed: count, total: count, done: true }));
}

/// Handles one batch from the watcher. Disk reads happen before the index lock is taken.
fn on_events(indexes: &Mutex<HashMap<String, CollectionIndex>>, id: &str, root: &Path, res: DebounceEventResult, emit: &dyn Fn(Notice)) {
    if !root.is_dir() {
        // Unplugged, renamed or deleted. Report it once; opening it again starts afresh.
        if indexes.locked().remove(id).is_some() {
            emit(Notice::Unavailable(id.to_string()));
        }
        return;
    }
    let events = match res {
        Ok(events) => events,
        Err(e) => {
            // Changes were missed (for instance a buffer overflow), so the index can no longer be trusted.
            // An empty "changed" makes the screens reload the tree, which re-indexes and re-watches the folder.
            eprintln!("Markvy: file changes were missed in {}: {e}", root.display());
            if indexes.locked().remove(id).is_some() {
                emit(Notice::Changed(CollectionChanged { collection_id: id.to_string(), changes: vec![] }));
            }
            return;
        }
    };
    let paths: Vec<PathBuf> = events.into_iter().map(|e| e.path).collect();
    let seen = read_changes(root, &paths);
    // The commit runs with the lock held: that is what the build's `touched` bookkeeping relies on.
    let changes = match indexes.locked().get_mut(id) {
        Some(index) => commit_changes(index, seen),
        None => return,
    };
    if !changes.is_empty() {
        emit(Notice::Changed(CollectionChanged { collection_id: id.to_string(), changes }));
    }
}

/// A watched folder. `_live` is None when the watcher couldn't start; the folder is still checked for going away.
struct Watch {
    root: PathBuf,
    _live: Option<Debouncer<RecommendedWatcher>>,
}

type Indexes = Mutex<HashMap<String, CollectionIndex>>;
type Watchers = Mutex<HashMap<String, Watch>>;

const PROBE_EVERY: Duration = Duration::from_secs(2);

/// The folder's root is gone (renamed, deleted, unplugged): drop its index and watcher, and say so once.
/// On Windows the watcher says nothing when its own root disappears, so this is also called by `probe` and `search`.
fn vanished(indexes: &Indexes, watchers: &Watchers, id: &str, emit: &dyn Fn(Notice)) {
    let had_index = indexes.locked().remove(id).is_some();
    let watch = watchers.locked().remove(id);
    drop(watch); // stopping a watcher can wait for its thread: never while a lock is held
    if had_index {
        emit(Notice::Unavailable(id.to_string()));
    }
}

/// One tick of the probe: any watched folder whose root is no longer a directory is reported as vanished.
fn probe(indexes: &Indexes, watchers: &Watchers, emit: &dyn Fn(Notice)) {
    let roots: Vec<(String, PathBuf)> = watchers.locked().iter().map(|(id, w)| (id.clone(), w.root.clone())).collect();
    for (id, root) in roots {
        if !root.is_dir() {
            vanished(indexes, watchers, &id, emit);
        }
    }
}

/// One search index per folder, filled in the background.
#[derive(Default)]
pub struct Indexer {
    indexes: Arc<Indexes>,
    generations: AtomicU64,
    watchers: Arc<Watchers>,
    probing: AtomicBool,
}

impl Indexer {
    /// Starts indexing a folder on a background thread, once per folder. Returns false if it had already started.
    pub fn start(&self, id: &str, root: &Path, emit: Emit) -> bool {
        let generation = self.generations.fetch_add(1, Ordering::Relaxed) + 1;
        {
            let mut map = self.indexes.locked();
            if map.contains_key(id) {
                return false;
            }
            map.insert(id.to_string(), CollectionIndex { generation, ..CollectionIndex::default() });
        }
        let (indexes, id, root) = (Arc::clone(&self.indexes), id.to_string(), root.to_path_buf());
        std::thread::spawn(move || {
            let built = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| build(&indexes, &id, &root, generation, &*emit)));
            if let Err(payload) = built {
                eprintln!("Markvy: indexing {id} stopped: {}", crate::errors::panic_text(&*payload));
                finish_after_panic(&indexes, &id, generation, &*emit);
            }
        });
        true
    }

    /// Opening a folder: index it once and watch it for changes.
    pub fn ensure(&self, id: &str, root: &Path, emit: Emit) {
        if self.start(id, root, Arc::clone(&emit)) {
            self.watch(id, root, emit);
        }
    }

    fn watch(&self, id: &str, root: &Path, emit: Emit) {
        // Watchers report canonical paths (macOS gives /private/var for /var), so compare against the canonical root.
        let watched = dunce::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
        let (indexes, cid, base) = (Arc::clone(&self.indexes), id.to_string(), watched.clone());
        let emit_for_probe = Arc::clone(&emit);
        let handler = move |res: DebounceEventResult| {
            if let Err(payload) = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| on_events(&indexes, &cid, &base, res, &*emit))) {
                eprintln!("Markvy: change handling for {cid} failed: {}", crate::errors::panic_text(&*payload));
            }
        };
        let watcher = new_debouncer(Duration::from_millis(300), handler)
            .and_then(|mut d| d.watcher().watch(&watched, RecursiveMode::Recursive).map(|()| d));
        let live = match watcher {
            Ok(d) => Some(d),
            Err(e) => {
                eprintln!("Markvy: live reload is off for {}: {e}", watched.display());
                None
            }
        };
        // Replacing an earlier watcher (a folder that came back) drops it, outside the lock.
        let earlier = self.watchers.locked().insert(id.to_string(), Watch { root: watched, _live: live });
        drop(earlier);
        self.start_probe(emit_for_probe);
    }

    /// One background thread for all folders, started with the first watch.
    fn start_probe(&self, emit: Emit) {
        if self.probing.swap(true, Ordering::Relaxed) {
            return;
        }
        let (indexes, watchers): (Arc<Indexes>, Weak<Watchers>) = (Arc::clone(&self.indexes), Arc::downgrade(&self.watchers));
        let spawned = std::thread::Builder::new().name("markvy-probe".into()).spawn(move || loop {
            std::thread::sleep(PROBE_EVERY);
            let Some(watchers) = watchers.upgrade() else { return }; // the indexer is gone
            probe(&indexes, &watchers, &*emit);
        });
        if let Err(e) = spawned {
            eprintln!("Markvy: could not start the folder check: {e}");
            self.probing.store(false, Ordering::Relaxed);
        }
    }

    /// The folder's root is no longer there: forget it and report it (once).
    pub fn vanished(&self, id: &str, emit: &dyn Fn(Notice)) {
        vanished(&self.indexes, &self.watchers, id, emit);
    }

    /// Drops a folder's index and watcher, so opening it again indexes it afresh.
    pub fn forget(&self, id: &str) {
        self.indexes.locked().remove(id);
        let watch = self.watchers.locked().remove(id);
        drop(watch);
    }

    pub fn search(&self, scope: &Scope, query: &str, filters: &Filters) -> SearchResponse {
        let map = self.indexes.locked();
        let mut indexing = false;
        let mut docs: Vec<(&str, &str, &DocEntry)> = Vec::new();
        for (id, index) in map.iter() {
            let wanted = match scope {
                Scope::All => true,
                Scope::Collection { collection_id } | Scope::Document { collection_id, .. } => collection_id == id,
            };
            if !wanted {
                continue;
            }
            indexing |= !index.done;
            match scope {
                Scope::Document { path, .. } => {
                    docs.extend(index.docs.get_key_value(path.as_str()).map(|(p, d)| (id.as_str(), p.as_str(), d)))
                }
                _ => docs.extend(index.docs.iter().map(|(p, d)| (id.as_str(), p.as_str(), d))),
            }
        }
        SearchResponse { results: search::search_docs(docs, query, filters), indexing }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, thread, time::Duration};

    fn folder() -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        fs::create_dir_all(d.path().join("Guides")).unwrap();
        fs::create_dir_all(d.path().join(".git")).unwrap();
        fs::write(d.path().join("README.md"), "# Welcome\nStart here.").unwrap();
        fs::write(d.path().join("Guides/Wifi.md"), "# Wi-Fi\nThe guest network.").unwrap();
        fs::write(d.path().join("Guides/map.png"), "png").unwrap();
        fs::write(d.path().join(".git/x.md"), "# hidden").unwrap();
        d
    }

    fn built(root: &Path) -> CollectionIndex {
        let map = Mutex::new(HashMap::from([("c".to_string(), CollectionIndex::default())]));
        build(&map, "c", root, 0, &|_| {});
        map.into_inner().unwrap().remove("c").unwrap()
    }

    fn kinds(changes: &[Change]) -> Vec<(&str, ChangeKind)> {
        changes.iter().map(|c| (c.path.as_str(), c.kind)).collect()
    }

    pub(super) fn wait_until(mut ready: impl FnMut() -> bool) {
        for _ in 0..1000 {
            if ready() {
                return;
            }
            thread::sleep(Duration::from_millis(10));
        }
        panic!("timed out");
    }

    #[test]
    fn a_panicking_index_build_still_finishes() {
        let indexes = Mutex::new(HashMap::new());
        indexes.lock().unwrap().insert("c".to_string(), CollectionIndex { generation: 7, ..CollectionIndex::default() });
        let seen = Mutex::new(Vec::new());
        finish_after_panic(&indexes, "c", 7, &|n| seen.lock().unwrap().push(n));
        assert!(indexes.lock().unwrap()["c"].done);
        assert!(matches!(seen.lock().unwrap().as_slice(), [Notice::Progress(p)] if p.done));
    }

    #[test]
    fn a_stale_build_panic_leaves_the_new_build_alone() {
        let indexes = Mutex::new(HashMap::new());
        indexes.lock().unwrap().insert("c".to_string(), CollectionIndex { generation: 8, ..CollectionIndex::default() });
        finish_after_panic(&indexes, "c", 7, &|_| panic!("must not report"));
        assert!(!indexes.lock().unwrap()["c"].done);
    }

    #[test]
    fn lists_documents_only() {
        let d = folder();
        assert_eq!(document_paths(d.path()).unwrap(), ["README.md", "Guides/Wifi.md"]);
    }

    #[test]
    fn reads_documents_only_through_the_path_guard() {
        let d = folder();
        assert_eq!(index_document(d.path(), "Guides/Wifi.md").unwrap().title, "Wi-Fi");
        assert!(index_document(d.path(), "../outside.md").is_none());
    }

    #[test]
    fn builds_the_index_and_reports_when_done() {
        let d = folder();
        let map = Mutex::new(HashMap::from([("c".to_string(), CollectionIndex::default())]));
        let seen = Mutex::new(Vec::new());
        build(&map, "c", d.path(), 0, &|n| seen.lock().unwrap().push(n));
        let guard = map.lock().unwrap();
        assert!(guard["c"].done);
        assert_eq!(guard["c"].docs.keys().collect::<Vec<_>>(), ["Guides/Wifi.md", "README.md"]);
        let done = IndexProgress { collection_id: "c".into(), indexed: 2, total: 2, done: true };
        assert_eq!(seen.lock().unwrap().last(), Some(&Notice::Progress(done)));
    }

    #[test]
    fn a_forgotten_folder_stops_quietly() {
        let d = folder();
        let map = Mutex::new(HashMap::new());
        build(&map, "c", d.path(), 0, &|_| {});
        assert!(map.lock().unwrap().is_empty());
    }

    #[test]
    fn starts_each_folder_once_and_searches_in_scope() {
        let d = folder();
        let ix = Indexer::default();
        assert!(ix.start("c", d.path(), Arc::new(|_| {})));
        assert!(!ix.start("c", d.path(), Arc::new(|_| {})));
        wait_until(|| ix.indexes.lock().unwrap()["c"].done);
        let f = Filters::default();
        assert_eq!(ix.search(&Scope::All, "guest", &f).results.len(), 1);
        assert!(!ix.search(&Scope::All, "guest", &f).indexing);
        assert!(ix.search(&Scope::Collection { collection_id: "other".into() }, "guest", &f).results.is_empty());
        let readme = Scope::Document { collection_id: "c".into(), path: "README.md".into() };
        assert!(ix.search(&readme, "guest", &f).results.is_empty());
        ix.forget("c");
        assert!(ix.search(&Scope::All, "guest", &f).results.is_empty());
    }

    #[test]
    fn reports_still_indexing() {
        let ix = Indexer::default();
        ix.indexes.lock().unwrap().insert("c".into(), CollectionIndex::default());
        assert!(ix.search(&Scope::All, "x", &Filters::default()).indexing);
    }

    #[test]
    fn changes_update_the_index() {
        let d = folder();
        let root = d.path();
        let mut ix = built(root);
        fs::write(root.join("README.md"), "# Welcome\nNew opening hours.").unwrap();
        fs::write(root.join("Guides/Print.md"), "# Printing").unwrap();
        fs::remove_file(root.join("Guides/Wifi.md")).unwrap();
        let changed = [root.join("README.md"), root.join("Guides/Print.md"), root.join("Guides/Wifi.md")];
        let changes = apply_changes(&mut ix, root, &changed);
        assert_eq!(
            kinds(&changes),
            [("Guides/Print.md", ChangeKind::Created), ("Guides/Wifi.md", ChangeKind::Removed), ("README.md", ChangeKind::Modified)]
        );
        assert!(ix.docs["README.md"].sections[0].text.contains("opening hours"));
    }

    #[test]
    fn a_removed_folder_removes_its_documents() {
        let d = folder();
        let mut ix = built(d.path());
        fs::remove_dir_all(d.path().join("Guides")).unwrap();
        let changes = apply_changes(&mut ix, d.path(), &[d.path().join("Guides")]);
        assert_eq!(kinds(&changes), [("Guides/Wifi.md", ChangeKind::Removed)]);
        assert!(!ix.docs.contains_key("Guides/Wifi.md"));
    }

    #[test]
    fn a_new_folder_brings_its_documents() {
        let d = folder();
        let mut ix = built(d.path());
        fs::create_dir_all(d.path().join("New")).unwrap();
        fs::write(d.path().join("New/a.md"), "# A").unwrap();
        let changes = apply_changes(&mut ix, d.path(), &[d.path().join("New")]);
        assert_eq!(kinds(&changes), [("New/a.md", ChangeKind::Created), ("New", ChangeKind::Created)]);
    }

    #[test]
    fn editor_save_through_a_temporary_file_is_one_change() {
        let d = folder();
        let mut ix = built(d.path());
        // Editors write "README.md.tmp" (or a hidden swap file), then rename it over the original.
        fs::write(d.path().join("README.md"), "# Welcome\nSaved.").unwrap();
        let changed = [d.path().join("README.md.tmp"), d.path().join(".README.md.swp"), d.path().join("README.md")];
        assert_eq!(kinds(&apply_changes(&mut ix, d.path(), &changed)), [("README.md", ChangeKind::Modified)]);
    }

    #[test]
    fn ignores_hidden_unknown_and_outside_paths() {
        let d = folder();
        let mut ix = built(d.path());
        fs::write(d.path().join("notes.csv"), "a,b").unwrap();
        let outside = tempfile::tempdir().unwrap();
        let changed = [d.path().join(".git/x.md"), d.path().join("notes.csv"), outside.path().join("a.md")];
        assert!(apply_changes(&mut ix, d.path(), &changed).is_empty());
    }

    #[test]
    fn a_changed_picture_is_reported_for_the_tree() {
        let d = folder();
        let mut ix = built(d.path());
        let changes = apply_changes(&mut ix, d.path(), &[d.path().join("Guides/map.png")]);
        assert_eq!(kinds(&changes), [("Guides/map.png", ChangeKind::Modified)]);
    }

    #[test]
    fn event_payloads_use_the_screens_names() {
        let p = IndexProgress { collection_id: "c".into(), indexed: 1, total: 2, done: false };
        assert_eq!(serde_json::to_value(p).unwrap(), serde_json::json!({ "collectionId": "c", "indexed": 1, "total": 2, "done": false }));
        let c = CollectionChanged { collection_id: "c".into(), changes: vec![Change { path: "a.md".into(), kind: ChangeKind::Removed }] };
        assert_eq!(
            serde_json::to_value(c).unwrap(),
            serde_json::json!({ "collectionId": "c", "changes": [{ "path": "a.md", "kind": "removed" }] })
        );
    }

    #[test]
    fn a_stale_build_leaves_a_restarted_entry_alone() {
        let d = folder();
        let entry = CollectionIndex { generation: 2, ..CollectionIndex::default() };
        let map = Mutex::new(HashMap::from([("c".to_string(), entry)]));
        let seen = Mutex::new(Vec::new());
        build(&map, "c", d.path(), 1, &|n| seen.lock().unwrap().push(n));
        let guard = map.lock().unwrap();
        assert!(!guard["c"].done);
        assert!(guard["c"].docs.is_empty());
        assert!(seen.lock().unwrap().is_empty());
    }

    #[test]
    fn a_change_during_the_build_is_not_overwritten() {
        let d = folder();
        let root = d.path();
        let mut ix = CollectionIndex::default();
        fs::remove_file(root.join("Guides/Wifi.md")).unwrap();
        // The build hasn't reached the document yet, so the deletion is still reported.
        assert_eq!(kinds(&apply_changes(&mut ix, root, &[root.join("Guides/Wifi.md")])), [("Guides/Wifi.md", ChangeKind::Removed)]);
        // The build had already read the old file before the deletion; it comes back on disk for the build's read.
        fs::write(root.join("Guides/Wifi.md"), "# Wi-Fi").unwrap();
        let map = Mutex::new(HashMap::from([("c".to_string(), ix)]));
        build(&map, "c", root, 0, &|_| {});
        let guard = map.lock().unwrap();
        assert!(guard["c"].done);
        assert!(!guard["c"].docs.contains_key("Guides/Wifi.md"));
        assert!(guard["c"].docs.contains_key("README.md"));
        assert!(guard["c"].touched.is_empty());
    }

    #[test]
    fn a_folder_and_its_documents_in_one_batch_report_each_path_once() {
        let d = folder();
        let mut ix = built(d.path());
        fs::remove_dir_all(d.path().join("Guides")).unwrap();
        let changed = [d.path().join("Guides"), d.path().join("Guides/Wifi.md")];
        assert_eq!(kinds(&apply_changes(&mut ix, d.path(), &changed)), [("Guides/Wifi.md", ChangeKind::Removed)]);

        fs::create_dir_all(d.path().join("New")).unwrap();
        fs::write(d.path().join("New/a.md"), "# A").unwrap();
        let changed = [d.path().join("New"), d.path().join("New/a.md")];
        assert_eq!(
            kinds(&apply_changes(&mut ix, d.path(), &changed)),
            [("New/a.md", ChangeKind::Created), ("New", ChangeKind::Created)]
        );
    }

    #[test]
    fn missing_temporary_documents_are_not_reported() {
        let d = folder();
        let mut ix = built(d.path());
        fs::write(d.path().join("README.md"), "# Welcome\nSaved.").unwrap();
        let changed = [d.path().join("README.tmp.md"), d.path().join("tmp123.md"), d.path().join("README.md")];
        assert_eq!(kinds(&apply_changes(&mut ix, d.path(), &changed)), [("README.md", ChangeKind::Modified)]);
    }

    #[test]
    fn a_missing_folder_is_unavailable() {
        let d = folder();
        let map = Mutex::new(HashMap::from([("c".to_string(), CollectionIndex::default())]));
        let seen = Mutex::new(Vec::new());
        build(&map, "c", &d.path().join("gone"), 0, &|n| seen.lock().unwrap().push(n));
        assert!(map.lock().unwrap().is_empty());
        assert_eq!(*seen.lock().unwrap(), [Notice::Unavailable("c".into())]);
    }

    #[test]
    fn a_folder_removed_during_the_build_stays_removed() {
        let d = folder();
        let root = d.path();
        let mut ix = CollectionIndex::default();
        fs::remove_dir_all(root.join("Guides")).unwrap();
        assert!(apply_changes(&mut ix, root, &[root.join("Guides")]).is_empty());
        // Stands in for a read the build made before the folder went away.
        fs::create_dir_all(root.join("Guides")).unwrap();
        fs::write(root.join("Guides/Wifi.md"), "# Wi-Fi").unwrap();
        let map = Mutex::new(HashMap::from([("c".to_string(), ix)]));
        build(&map, "c", root, 0, &|_| {});
        let guard = map.lock().unwrap();
        assert!(guard["c"].done);
        assert!(!guard["c"].docs.contains_key("Guides/Wifi.md"));
        assert!(guard["c"].docs.contains_key("README.md"));
    }

    #[test]
    fn watching_reports_a_saved_document() {
        let d = folder();
        let root = dunce::canonicalize(d.path()).unwrap();
        let seen: Arc<Mutex<Vec<Notice>>> = Arc::default();
        let sink = Arc::clone(&seen);
        let ix = Indexer::default();
        ix.ensure("c", &root, Arc::new(move |n| sink.lock().unwrap().push(n)));
        wait_until(|| ix.indexes.lock().unwrap().get("c").is_some_and(|i| i.done));
        fs::write(root.join("Guides/Wifi.md"), "# Wi-Fi
New password.").unwrap();
        wait_until(|| {
            seen.lock().unwrap().iter().any(|n| matches!(n, Notice::Changed(c) if c.changes.iter().any(|ch| ch.path == "Guides/Wifi.md")))
        });
        assert_eq!(ix.search(&Scope::All, "new password", &Filters::default()).results.len(), 1);
    }

    #[test]
    fn missed_changes_drop_the_index_and_ask_for_a_reload() {
        let d = folder();
        let map = Mutex::new(HashMap::from([("c".to_string(), CollectionIndex::default())]));
        let seen = Mutex::new(Vec::new());
        let err = Err(notify_debouncer_mini::notify::Error::generic("buffer overflow"));
        on_events(&map, "c", d.path(), err, &|n| seen.lock().unwrap().push(n));
        assert!(map.lock().unwrap().is_empty());
        let empty = CollectionChanged { collection_id: "c".into(), changes: vec![] };
        assert_eq!(*seen.lock().unwrap(), [Notice::Changed(empty)]);
    }

    #[test]
    fn a_vanished_root_is_reported_once() {
        let d = folder();
        let gone = d.path().join("gone");
        let map = Mutex::new(HashMap::from([("c".to_string(), CollectionIndex::default())]));
        let seen = Mutex::new(Vec::new());
        for _ in 0..2 {
            on_events(&map, "c", &gone, Ok(vec![]), &|n| seen.lock().unwrap().push(n));
        }
        assert!(map.lock().unwrap().is_empty());
        assert_eq!(*seen.lock().unwrap(), [Notice::Unavailable("c".into())]);
    }

    #[test]
    fn a_delete_before_the_first_index_reaches_the_document_is_reported() {
        let d = folder();
        let root = d.path();
        let mut ix = CollectionIndex::default(); // still building: nothing indexed yet
        fs::remove_file(root.join("README.md")).unwrap();
        assert_eq!(kinds(&apply_changes(&mut ix, root, &[root.join("README.md")])), [("README.md", ChangeKind::Removed)]);
        assert!(is_touched(&ix.touched, "README.md"));
        // Once the index is complete, a missing unindexed document is a temporary file again.
        ix.done = true;
        assert!(apply_changes(&mut ix, root, &[root.join("tmp123.md")]).is_empty());
    }

    #[test]
    fn a_document_that_cannot_be_read_for_now_stays_indexed() {
        let d = folder();
        let mut ix = built(d.path());
        let before = ix.docs["README.md"].title.clone();
        // A sharing violation can't be made portably; the read phase's result stands in for it.
        let seen = vec![Seen::Document("README.md".into(), Err(AppError::Internal("sharing violation".into())))];
        assert_eq!(kinds(&commit_changes(&mut ix, seen)), [("README.md", ChangeKind::Modified)]);
        assert_eq!(ix.docs["README.md"].title, before);
        // A document that became binary or too large does leave the index.
        let seen = vec![Seen::Document("README.md".into(), Err(AppError::NotText))];
        assert_eq!(kinds(&commit_changes(&mut ix, seen)), [("README.md", ChangeKind::Modified)]);
        assert!(!ix.docs.contains_key("README.md"));
    }

    #[test]
    fn a_document_that_turns_binary_leaves_the_index() {
        let d = folder();
        let mut ix = built(d.path());
        fs::write(d.path().join("README.md"), b"\0\0\0 binary").unwrap();
        let changes = apply_changes(&mut ix, d.path(), &[d.path().join("README.md")]);
        assert!(!changes.is_empty());
        assert!(!ix.docs.contains_key("README.md"));
    }

    #[test]
    fn a_vanished_folder_is_reported_once_and_searches_empty() {
        let d = folder();
        let ix = Indexer::default();
        ix.indexes.lock().unwrap().insert("c".into(), built(d.path()));
        let seen = Mutex::new(Vec::new());
        for _ in 0..2 {
            ix.vanished("c", &|n| seen.lock().unwrap().push(n));
        }
        assert_eq!(*seen.lock().unwrap(), [Notice::Unavailable("c".into())]);
        assert!(ix.search(&Scope::All, "guest", &Filters::default()).results.is_empty());
    }

    #[test]
    fn the_probe_reports_a_deleted_root_once_and_leaves_present_ones_alone() {
        let present = folder();
        let doomed = folder();
        let ix = Indexer::default();
        for (id, d) in [("present", &present), ("doomed", &doomed)] {
            ix.indexes.lock().unwrap().insert(id.into(), built(d.path()));
            ix.watchers.lock().unwrap().insert(id.into(), Watch { root: d.path().to_path_buf(), _live: None });
        }
        let seen = Mutex::new(Vec::new());
        probe(&ix.indexes, &ix.watchers, &|n| seen.lock().unwrap().push(n));
        assert!(seen.lock().unwrap().is_empty());
        let root = doomed.path().to_path_buf();
        drop(doomed);
        assert!(!root.exists());
        for _ in 0..2 {
            probe(&ix.indexes, &ix.watchers, &|n| seen.lock().unwrap().push(n));
        }
        assert_eq!(*seen.lock().unwrap(), [Notice::Unavailable("doomed".into())]);
        assert!(ix.watchers.lock().unwrap().contains_key("present"));
        assert!(!ix.watchers.lock().unwrap().contains_key("doomed"));
        assert!(ix.indexes.lock().unwrap().contains_key("present"));
    }

    #[test]
    fn reading_a_batch_needs_no_lock() {
        let d = folder();
        let root = d.path();
        fs::create_dir_all(root.join("New")).unwrap();
        fs::write(root.join("New/a.md"), "# A").unwrap();
        let map = Mutex::new(HashMap::from([("c".to_string(), CollectionIndex::default())]));
        let held = map.lock().unwrap();
        let reads = read_changes(root, &[root.join("New"), root.join("New/a.md")]);
        drop(held);
        assert_eq!(reads.len(), 1); // the folder carries its documents; the document is not read twice
        let changes = commit_changes(map.lock().unwrap().get_mut("c").unwrap(), reads);
        assert_eq!(kinds(&changes), [("New/a.md", ChangeKind::Created), ("New", ChangeKind::Created)]);
    }
}
