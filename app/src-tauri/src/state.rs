use crate::{
    errors::AppError,
    indexer::Indexer,
    library::{self, LoadResult},
    recovery::Recovery,
    workspace::{collections_to_json, Collection},
};
use std::{
    path::PathBuf,
    sync::{atomic::{AtomicBool, Ordering}, Mutex},
};

/// A panic in one command must not break every later one (spec §5): a poisoned lock still opens.
/// The data behind it stays consistent because every critical section here either finishes or changes nothing.
pub trait LockExt<T> {
    fn locked(&self) -> std::sync::MutexGuard<'_, T>;
}

impl<T> LockExt<T> for std::sync::Mutex<T> {
    fn locked(&self) -> std::sync::MutexGuard<'_, T> {
        self.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

pub struct AppState {
    pub data_dir: PathBuf,
    pub collections: Mutex<Vec<Collection>>,
    /// The library as read at start-up, handed to the screens once so a reset (or a failed read) is reported exactly once.
    pub initial_load: Mutex<Option<Result<LoadResult, AppError>>>,
    /// False when the start-up read failed: saving then would overwrite remembered folders with an empty list.
    pub library_writable: AtomicBool,
    /// Serializes every library.json write (they share one temp file). Lock order: this first, then `collections`.
    pub library_lock: Mutex<()>,
    /// Search indexes and folder watchers, one per opened folder.
    pub indexer: Indexer,
    /// Crashes of the web view, so a repeat crash reloads without reopening tabs (A12).
    pub recovery: Recovery,
    /// Set by the screens from the Allow editing preference; false until they say otherwise (spec §6).
    pub editing: AtomicBool,
    /// While the window waits to close: told by the screens once every draft is written (`close_ready`).
    pub close_waiter: Mutex<Option<std::sync::mpsc::Sender<()>>>,
}

impl AppState {
    pub fn new(data_dir: PathBuf, collections: Vec<Collection>, loaded: Result<LoadResult, AppError>) -> Self {
        AppState {
            data_dir,
            collections: Mutex::new(collections),
            library_writable: AtomicBool::new(loaded.is_ok()),
            initial_load: Mutex::new(Some(loaded)),
            library_lock: Mutex::new(()),
            indexer: Indexer::default(),
            recovery: Recovery::default(),
            editing: AtomicBool::new(false),
            close_waiter: Mutex::new(None),
        }
    }

    pub fn check_writable(&self) -> Result<(), AppError> {
        if self.library_writable.load(Ordering::Relaxed) {
            Ok(())
        } else {
            Err(AppError::Internal("library could not be read at startup".into()))
        }
    }

    pub fn root_of(&self, id: &str) -> Result<PathBuf, AppError> {
        self.collections
            .locked()
            .iter()
            .find(|c| c.id == id)
            .map(|c| c.root.clone())
            .ok_or(AppError::CollectionUnavailable)
    }

    /// The root of a collection that may be edited now, or why not.
    pub fn editable_root(&self, id: &str) -> Result<PathBuf, AppError> {
        let root = self.root_of(id)?;
        if !self.editing.load(Ordering::Relaxed) || id == crate::workspace::SAMPLE_ID {
            return Err(AppError::NotEditable);
        }
        if !root.is_dir() {
            return Err(AppError::CollectionUnavailable);
        }
        Ok(root)
    }

    pub fn add_collection(&self, collection: Collection) -> Collection {
        let mut cols = self.collections.locked();
        if let Some(existing) = cols.iter().find(|c| c.id == collection.id) {
            return existing.clone();
        }
        cols.push(collection.clone());
        collection
    }

    /// Forgets a folder from the list; the sample library always stays. Returns true if it was listed.
    pub fn remove_collection(&self, id: &str) -> bool {
        if id == crate::workspace::SAMPLE_ID {
            return false;
        }
        let mut cols = self.collections.locked();
        let before = cols.len();
        cols.retain(|c| c.id != id);
        cols.len() != before
    }

    pub fn persist_collections(&self) -> Result<(), AppError> {
        self.check_writable()?;
        let _guard = self.library_lock.locked();
        let mut lib = library::load(&self.data_dir)?.library;
        lib["collections"] = collections_to_json(&self.collections.locked());
        library::save(&self.data_dir, &lib)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::errors::AppError;

    fn state(dir: &std::path::Path) -> AppState {
        AppState::new(dir.to_path_buf(), vec![], Ok(LoadResult::fresh()))
    }

    #[test]
    fn editing_needs_permission_a_real_folder_and_not_the_sample() {
        let d = tempfile::tempdir().unwrap();
        let col = crate::workspace::Collection::new(d.path().to_path_buf());
        let sample = crate::workspace::Collection { id: crate::workspace::SAMPLE_ID.into(), name: "S".into(), root: d.path().into(), available: true };
        let s = AppState::new(d.path().to_path_buf(), vec![col.clone(), sample], Ok(LoadResult::fresh()));
        assert_eq!(s.editable_root(&col.id), Err(AppError::NotEditable));
        s.editing.store(true, Ordering::Relaxed);
        assert!(s.editable_root(&col.id).is_ok());
        assert_eq!(s.editable_root(crate::workspace::SAMPLE_ID), Err(AppError::NotEditable));
        assert_eq!(s.editable_root("nope"), Err(AppError::CollectionUnavailable));
    }

    #[test]
    fn a_poisoned_lock_still_opens() {
        let m = std::sync::Arc::new(std::sync::Mutex::new(5));
        let m2 = std::sync::Arc::clone(&m);
        let _ = std::thread::spawn(move || {
            let _g = m2.lock().unwrap();
            panic!("poison it");
        })
        .join();
        assert!(m.is_poisoned());
        assert_eq!(*m.locked(), 5);
    }

    #[test]
    fn root_of_unknown_id_is_unavailable() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(state(d.path()).root_of("nope").unwrap_err(), AppError::CollectionUnavailable);
    }

    #[test]
    fn adding_the_same_folder_twice_keeps_one() {
        let d = tempfile::tempdir().unwrap();
        let s = state(d.path());
        let a = s.add_collection(Collection::new(d.path().join("wiki")));
        let b = s.add_collection(Collection::new(d.path().join("wiki")));
        assert_eq!(a.id, b.id);
        assert_eq!(s.collections.lock().unwrap().len(), 1);
    }

    #[test]
    fn persist_and_save_do_not_lose_collections() {
        let d = tempfile::tempdir().unwrap();
        let s = state(d.path());
        s.add_collection(Collection::new(d.path().join("wiki")));
        std::thread::scope(|scope| {
            for _ in 0..8 {
                scope.spawn(|| {
                    for _ in 0..10 {
                        s.persist_collections().unwrap();
                    }
                });
            }
        });
        let loaded = crate::library::load(d.path()).unwrap();
        assert!(!loaded.reset);
        assert_eq!(crate::workspace::collections_from_library(&loaded.library).len(), 1);
    }

    #[test]
    fn persisted_collections_survive_a_reload() {
        let d = tempfile::tempdir().unwrap();
        let s = state(d.path());
        s.add_collection(Collection::new(d.path().join("wiki")));
        s.persist_collections().unwrap();
        let lib = crate::library::load(d.path()).unwrap().library;
        assert_eq!(crate::workspace::collections_from_library(&lib).len(), 1);
    }

    #[test]
    fn removing_a_folder_forgets_it_but_never_the_sample() {
        let d = tempfile::tempdir().unwrap();
        let s = state(d.path());
        s.add_collection(Collection { id: crate::workspace::SAMPLE_ID.into(), name: "Sample library".into(), root: d.path().into(), available: true });
        let wiki = s.add_collection(Collection::new(d.path().join("wiki")));
        assert!(s.remove_collection(&wiki.id));
        assert!(!s.remove_collection(&wiki.id));
        assert!(!s.remove_collection(crate::workspace::SAMPLE_ID));
        s.persist_collections().unwrap();
        let lib = crate::library::load(d.path()).unwrap().library;
        assert!(crate::workspace::collections_from_library(&lib).is_empty());
    }

    #[test]
    fn unwritable_library_is_never_overwritten() {
        let d = tempfile::tempdir().unwrap();
        let s = AppState::new(d.path().to_path_buf(), vec![], Err(AppError::AccessDenied));
        s.add_collection(Collection::new(d.path().join("wiki")));
        assert!(matches!(s.persist_collections(), Err(AppError::Internal(_))));
        assert!(!d.path().join("library.json").exists());
    }
}
