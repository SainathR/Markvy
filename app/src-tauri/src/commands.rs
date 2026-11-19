use crate::{
    edit,
    errors::AppError,
    external,
    indexer::{Emit, Notice},
    library::{self, LoadResult},
    log, net, paths,
    reader::{self, DocumentText},
    search::{Filters, Scope, SearchResponse},
    state::{AppState, LockExt},
    workspace::{self, collections_to_json, Collection, Tree},
};
use serde::Serialize;
use serde_json::{json, Value};
use std::sync::{atomic::Ordering, Arc};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;

/// Every failure goes to the log with its details (spec §5); the screens get the code, and details only for Internal.
pub fn logged<T>(state: &AppState, command: &str, result: Result<T, AppError>) -> Result<T, AppError> {
    if let Err(e) = &result {
        let entry = format!("{command}: {}", serde_json::to_string(e).unwrap_or_default());
        if let Err(io) = log::append(&state.data_dir, &entry) {
            eprintln!("Markvy: log not written: {io}");
        }
    }
    result
}

/// Runs a command body so a panic comes back as an error (spec §5) instead of a promise that never settles.
pub fn guarded<T>(state: &AppState, command: &str, body: impl FnOnce() -> Result<T, AppError>) -> Result<T, AppError> {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(body))
        .unwrap_or_else(|payload| Err(AppError::Internal(format!("panic: {}", crate::errors::panic_text(&*payload)))));
    logged(state, command, result)
}

/// The file commands are `async` so Tauri runs them off the main thread: a slow or unplugged drive never freezes the window.
#[tauri::command(async)]
pub fn list_collections(state: State<'_, AppState>) -> Result<Vec<Collection>, AppError> {
    guarded(&state, "list_collections", || {
        // Copy first so the lock is not held while probing folders (a dead network drive can take seconds).
        let cols = state.collections.locked().clone();
        Ok(workspace::with_availability(&cols))
    })
}

/// Whole-app tests answer the picker in advance (A13). Always None in normal builds.
fn test_pick() -> Option<std::path::PathBuf> {
    #[cfg(feature = "e2e")]
    return crate::e2e::take_pick();
    #[cfg(not(feature = "e2e"))]
    None
}

/// Runs off the main thread (`async` command, plain fn) because the blocking system dialog needs that.
#[tauri::command(async)]
pub fn pick_folder(app: AppHandle, state: State<'_, AppState>) -> Result<Option<Collection>, AppError> {
    guarded(&state, "pick_folder", || {
        let root = match test_pick() {
            Some(path) => path,
            None => {
                let Some(picked) = app.dialog().file().blocking_pick_folder() else { return Ok(None) };
                picked.into_path().map_err(|e| AppError::Internal(e.to_string()))?
            }
        };
        let root = dunce::canonicalize(root)?;
        let collection = state.add_collection(Collection::new(root));
        state.persist_collections()?;
        Ok(Some(collection))
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedFile {
    pub collection: Collection,
    pub path: String,
}

/// Opening one document adds its folder as a collection, so links to neighbouring pages keep working (spec amendment A1).
#[tauri::command(async)]
pub fn pick_file(app: AppHandle, state: State<'_, AppState>) -> Result<Option<OpenedFile>, AppError> {
    guarded(&state, "pick_file", || {
        let picked = match test_pick() {
            Some(path) => path,
            None => {
                let Some(picked) = app
                    .dialog()
                    .file()
                    .add_filter("Documents", &["md", "markdown", "txt"])
                    .blocking_pick_file()
                else {
                    return Ok(None);
                };
                picked.into_path().map_err(|e| AppError::Internal(e.to_string()))?
            }
        };
        let file = dunce::canonicalize(picked)?;
        let (root, path) = workspace::split_file(&file)?;
        let collection = state.add_collection(Collection::new(root));
        state.persist_collections()?;
        Ok(Some(OpenedFile { collection, path }))
    })
}

/// Sends the indexer's notices to the window as events.
pub fn emitter(app: &AppHandle) -> Emit {
    let app = app.clone();
    Arc::new(move |notice| {
        let sent = match notice {
            Notice::Progress(p) => app.emit("index-progress", p),
            Notice::Changed(c) => app.emit("collection-changed", c),
            Notice::Unavailable(id) => app.emit("collection-unavailable", json!({ "collectionId": id })),
        };
        if let Err(e) = sent {
            eprintln!("Markvy: event not delivered: {e}");
        }
    })
}

/// Opening a folder's tree also starts its search index and live reload (once).
#[tauri::command(async)]
pub fn get_tree(app: AppHandle, state: State<'_, AppState>, collection_id: String) -> Result<Tree, AppError> {
    guarded(&state, "get_tree", || {
        let root = state.root_of(&collection_id)?;
        let tree = workspace::build_tree(&root)?;
        state.indexer.ensure(&collection_id, &root, emitter(&app));
        Ok(tree)
    })
}

#[tauri::command(async)]
pub fn search(app: AppHandle, state: State<'_, AppState>, query: String, scope: Scope, filters: Filters) -> Result<SearchResponse, AppError> {
    guarded(&state, "search", || {
        let ids: Vec<String> = match &scope {
            Scope::All => state.collections.locked().iter().map(|c| c.id.clone()).collect(),
            Scope::Collection { collection_id } | Scope::Document { collection_id, .. } => vec![collection_id.clone()],
        };
        // "Everywhere" includes folders not opened yet in this run: index them now.
        for id in ids {
            if let Ok(root) = state.root_of(&id) {
                if root.is_dir() {
                    state.indexer.ensure(&id, &root, emitter(&app));
                } else {
                    // Windows watchers say nothing when the root itself goes away; this is where it is noticed.
                    state.indexer.vanished(&id, &*emitter(&app));
                }
            }
        }
        Ok(state.indexer.search(&scope, &query, &filters))
    })
}

#[tauri::command(async)]
pub fn read_document(state: State<'_, AppState>, collection_id: String, path: String) -> Result<DocumentText, AppError> {
    guarded(&state, "read_document", || {
        let root = state.root_of(&collection_id)?;
        reader::read_text(&paths::resolve(&root, &path)?)
    })
}

/// The one network call (spec §4.3): a picture the reader approved. Async: it can take up to 10 seconds.
#[tauri::command(async)]
pub fn fetch_remote_image(state: State<'_, AppState>, url: String) -> Result<net::RemoteImage, AppError> {
    guarded(&state, "fetch_remote_image", || net::fetch_image(&url))
}

#[tauri::command(async)]
pub fn load_library(state: State<'_, AppState>) -> Result<LoadResult, AppError> {
    guarded(&state, "load_library", || {
        if let Some(first) = state.initial_load.locked().take() {
            return first;
        }
        let _guard = state.library_lock.locked(); // load can set a damaged file aside; never race a save
        library::load(&state.data_dir)
    })
}

/// The core owns the `collections` key; whatever the screens send for it is replaced.
#[tauri::command(async)]
pub fn save_library(state: State<'_, AppState>, library: Value) -> Result<(), AppError> {
    guarded(&state, "save_library", || {
        state.check_writable()?;
        let mut lib = library;
        if !lib.is_object() {
            return Err(AppError::Internal("library must be a JSON object".into()));
        }
        let _guard = state.library_lock.locked();
        lib["version"] = json!(1);
        lib["collections"] = collections_to_json(&state.collections.locked());
        library::save(&state.data_dir, &lib)
    })
}

#[tauri::command(async)]
pub fn open_external(state: State<'_, AppState>, url: String) -> Result<(), AppError> {
    guarded(&state, "open_external", || external::open(&url))
}

#[tauri::command(async)]
pub fn open_log_folder(state: State<'_, AppState>) -> Result<(), AppError> {
    guarded(&state, "open_log_folder", || {
        log::ensure_dir(&state.data_dir)
            .map_err(AppError::from_io)
            .and_then(|logs| ::open::that_detached(logs).map_err(|e| AppError::Internal(e.to_string())))
    })
}

/// Removes a folder from "Your folders". The folder and its documents are untouched.
#[tauri::command(async)]
pub fn forget_collection(state: State<'_, AppState>, collection_id: String) -> Result<(), AppError> {
    guarded(&state, "forget_collection", || {
        if collection_id == workspace::SAMPLE_ID {
            return Err(AppError::Internal("the sample library can't be removed".into()));
        }
        state.remove_collection(&collection_id);
        state.indexer.forget(&collection_id);
        state.persist_collections()
    })
}

/// Asked once at start-up: did the window just reload after a crash, and should the tabs come back? (A12)
#[tauri::command(async)]
pub fn take_recovery(state: State<'_, AppState>) -> Result<Option<crate::recovery::Recovered>, AppError> {
    guarded(&state, "take_recovery", || Ok(state.recovery.take()))
}

#[tauri::command(async)]
pub fn set_editing_allowed(state: State<'_, AppState>, allowed: bool) -> Result<(), AppError> {
    guarded(&state, "set_editing_allowed", || { state.editing.store(allowed, Ordering::Relaxed); Ok(()) })
}

/// The screens have written every draft after a close request: the window may close now.
#[tauri::command]
pub fn close_ready(state: State<'_, AppState>) {
    if let Some(waiter) = state.close_waiter.locked().take() {
        let _ = waiter.send(());
    }
}

#[tauri::command(async)]
pub fn open_for_edit(state: State<'_, AppState>, collection_id: String, path: String) -> Result<edit::EditSource, AppError> {
    guarded(&state, "open_for_edit", || {
        let root = state.editable_root(&collection_id)?;
        let file = paths::resolve(&root, &path)?;
        if workspace::kind_of(&path) != Some(workspace::NodeKind::Document) { return Err(AppError::NotEditable); }
        edit::open(&file)
    })
}

#[tauri::command(async)]
pub fn file_fingerprint(state: State<'_, AppState>, collection_id: String, path: String) -> Result<String, AppError> {
    guarded(&state, "file_fingerprint", || {
        let root = state.root_of(&collection_id)?;
        Ok(edit::fingerprint(&std::fs::read(paths::resolve(&root, &path)?)?))
    })
}

#[tauri::command(async)]
pub fn save_document(state: State<'_, AppState>, collection_id: String, path: String, text: String, base_hash: String) -> Result<edit::Saved, AppError> {
    guarded(&state, "save_document", || {
        let root = state.editable_root(&collection_id)?;
        let saved = edit::save(&paths::resolve(&root, &path)?, &text, &base_hash)?;
        if matches!(saved, edit::Saved::Saved { .. }) {
            if let Err(e) = edit::discard_draft(&state.data_dir, &collection_id, &path) {
                let _ = log::append(&state.data_dir, &format!("draft not removed after save {collection_id}/{path}: {}", serde_json::to_string(&e).unwrap_or_default()));
            }
            let _ = log::append(&state.data_dir, &format!("saved {collection_id}/{path}"));
        }
        Ok(saved)
    })
}

#[tauri::command(async)]
pub fn save_draft(state: State<'_, AppState>, draft: edit::Draft) -> Result<(), AppError> {
    guarded(&state, "save_draft", || {
        state.editable_root(&draft.collection_id)?;
        edit::save_draft(&state.data_dir, &draft)
    })
}

#[tauri::command(async)]
pub fn take_draft(state: State<'_, AppState>, collection_id: String, path: String) -> Result<Option<edit::Draft>, AppError> {
    guarded(&state, "take_draft", || { state.root_of(&collection_id)?; edit::take_draft(&state.data_dir, &collection_id, &path) })
}

#[tauri::command(async)]
pub fn discard_draft(state: State<'_, AppState>, collection_id: String, path: String) -> Result<(), AppError> {
    guarded(&state, "discard_draft", || { state.root_of(&collection_id)?; edit::discard_draft(&state.data_dir, &collection_id, &path) })
}

#[tauri::command(async)]
pub fn list_drafts(state: State<'_, AppState>) -> Result<Vec<edit::Draft>, AppError> {
    guarded(&state, "list_drafts", || Ok(edit::list_drafts(&state.data_dir)))
}

#[tauri::command(async)]
pub fn create_page(state: State<'_, AppState>, collection_id: String, folder: String, name: String, title: String) -> Result<String, AppError> {
    guarded(&state, "create_page", || {
        let rel = edit::create_page(&state.editable_root(&collection_id)?, &folder, &name, &title)?;
        let _ = log::append(&state.data_dir, &format!("created {collection_id}/{rel}"));
        Ok(rel)
    })
}

#[tauri::command(async)]
pub fn create_folder(state: State<'_, AppState>, collection_id: String, parent: String, name: String) -> Result<String, AppError> {
    guarded(&state, "create_folder", || {
        let rel = edit::create_folder(&state.editable_root(&collection_id)?, &parent, &name)?;
        let _ = log::append(&state.data_dir, &format!("created folder {collection_id}/{rel}"));
        Ok(rel)
    })
}

#[tauri::command(async)]
pub fn rename_with_edits(state: State<'_, AppState>, collection_id: String, from: String, new_name: String, edits: Vec<edit::FileEdit>) -> Result<String, AppError> {
    guarded(&state, "rename_with_edits", || {
        let rel = edit::rename_with_edits(&state.editable_root(&collection_id)?, &from, &new_name, &edits)?;
        let _ = log::append(&state.data_dir, &format!("renamed {collection_id}/{from} to {rel}, {} linking pages updated", edits.len()));
        Ok(rel)
    })
}

#[tauri::command(async)]
pub fn delete_entry(state: State<'_, AppState>, collection_id: String, path: String) -> Result<(), AppError> {
    guarded(&state, "delete_entry", || {
        edit::delete(&state.editable_root(&collection_id)?, &path)?;
        let _ = log::append(&state.data_dir, &format!("moved to the Recycle Bin: {collection_id}/{path}"));
        Ok(())
    })
}

#[tauri::command(async)]
pub fn save_picture(state: State<'_, AppState>, collection_id: String, page: String, base64: String) -> Result<String, AppError> {
    guarded(&state, "save_picture", || {
        use base64::Engine as _;
        let bytes = base64::engine::general_purpose::STANDARD.decode(base64).map_err(|_| AppError::ImageRejected)?;
        let link = edit::save_picture(&state.editable_root(&collection_id)?, &page, &bytes)?;
        let folder = page.rsplit_once('/').map(|(f, _)| f).unwrap_or("");
        let rel = if folder.is_empty() { link.clone() } else { format!("{folder}/{link}") };
        let _ = log::append(&state.data_dir, &format!("saved picture {collection_id}/{rel} for {page}"));
        Ok(link)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::LoadResult;

    #[test]
    fn failures_are_logged_and_successes_are_not() {
        let d = tempfile::tempdir().unwrap();
        let s = AppState::new(d.path().to_path_buf(), vec![], Ok(LoadResult::fresh()));
        assert_eq!(logged(&s, "read_document", Err::<(), _>(AppError::NotFound)), Err(AppError::NotFound));
        assert_eq!(logged(&s, "list_collections", Ok(1)), Ok(1));
        let text = std::fs::read_to_string(crate::log::dir(d.path()).join("markvy.log")).unwrap();
        assert_eq!(text.lines().count(), 1);
        assert!(text.contains("read_document: {\"code\":\"NotFound\"}"));
    }

    #[test]
    fn a_panicking_command_returns_internal_and_is_logged() {
        let d = tempfile::tempdir().unwrap();
        let s = AppState::new(d.path().to_path_buf(), vec![], Ok(LoadResult::fresh()));
        let r: Result<(), AppError> = guarded(&s, "boom", || panic!("kaboom"));
        assert_eq!(r, Err(AppError::Internal("panic: kaboom".into())));
        let text = std::fs::read_to_string(crate::log::dir(d.path()).join("markvy.log")).unwrap();
        assert!(text.contains("boom: {\"code\":\"Internal\""));
    }

    #[test]
    fn a_panic_while_holding_the_folder_list_does_not_break_later_commands() {
        let d = tempfile::tempdir().unwrap();
        let s = AppState::new(d.path().to_path_buf(), vec![], Ok(LoadResult::fresh()));
        let _ = guarded(&s, "first", || -> Result<(), AppError> {
            let _held = s.collections.locked();
            panic!("while holding the list")
        });
        assert!(s.collections.is_poisoned());
        assert_eq!(guarded(&s, "second", || Ok(s.collections.locked().len())), Ok(0));
    }

    #[test]
    fn a_log_that_cannot_be_written_never_changes_the_result() {
        let d = tempfile::tempdir().unwrap();
        let file = d.path().join("not-a-folder");
        std::fs::write(&file, "x").unwrap();
        let s = AppState::new(file, vec![], Ok(LoadResult::fresh()));
        assert_eq!(logged(&s, "read_document", Err::<(), _>(AppError::TooLarge)), Err(AppError::TooLarge));
    }
}
