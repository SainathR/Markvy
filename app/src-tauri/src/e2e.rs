//! Test-only hooks for the whole-app tests (spec amendment A13). Compiled only with `--features e2e`.
use crate::{errors::AppError, state::LockExt};
use std::{path::PathBuf, sync::{Mutex, OnceLock}, time::Instant};
use tauri::AppHandle;

static NEXT_PICK: Mutex<Option<PathBuf>> = Mutex::new(None);
static STARTED: OnceLock<Instant> = OnceLock::new();
static LOADED_AT_MS: OnceLock<u64> = OnceLock::new();

/// Called first thing in `run()`, so uptime covers the core's own start-up.
pub fn mark_start() {
    STARTED.get_or_init(Instant::now);
}

/// The first finished page load is the start-up time; later loads (reloads) return None.
pub fn record_first_load() -> Option<u64> {
    let ms = STARTED.get()?.elapsed().as_millis() as u64;
    LOADED_AT_MS.set(ms).ok().map(|()| ms)
}

/// Called on every finished page load. With MARKVY_E2E_STARTUP_EXIT=1 the first one prints the time and quits (no WebDriver attached).
pub fn page_loaded(app: &AppHandle) {
    if let Some(ms) = record_first_load() {
        if std::env::var_os("MARKVY_E2E_STARTUP_EXIT").is_some_and(|v| v == "1") {
            println!("BENCH startup_ms={ms}");
            app.exit(0);
        }
    }
}

/// Tests keep their own library: never the tester's.
pub fn data_dir() -> Option<PathBuf> {
    std::env::var_os("MARKVY_DATA_DIR").map(PathBuf::from)
}

pub fn take_pick() -> Option<PathBuf> {
    NEXT_PICK.locked().take()
}

/// The next folder or file picker returns this path instead of opening.
#[tauri::command]
pub fn e2e_set_next_pick(path: String) {
    *NEXT_PICK.locked() = Some(PathBuf::from(path));
}

/// Milliseconds since the core started. The start-up check reads it once Home is showing.
#[tauri::command]
pub fn e2e_uptime_ms() -> u64 {
    STARTED.get().map_or(0, |t| t.elapsed().as_millis() as u64)
}

#[tauri::command]
pub fn e2e_crash_webview(app: AppHandle) -> Result<(), AppError> {
    crate::recovery::crash_for_test(&app)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn data_dir_comes_from_markvy_data_dir() {
        std::env::set_var("MARKVY_DATA_DIR", "/tmp/markvy-e2e-x");
        assert_eq!(data_dir(), Some(std::path::PathBuf::from("/tmp/markvy-e2e-x")));
        std::env::remove_var("MARKVY_DATA_DIR");
        assert_eq!(data_dir(), None);
    }

    #[test]
    fn only_the_first_page_load_is_recorded() {
        mark_start();
        // The statics are process-wide, so this is the only test that touches them.
        let first = record_first_load();
        assert!(first.is_some());
        assert_eq!(record_first_load(), None);
        assert_eq!(LOADED_AT_MS.get().copied(), first);
    }

    #[test]
    fn a_test_pick_is_used_once() {
        e2e_set_next_pick("C:/notes".into());
        assert_eq!(take_pick(), Some(std::path::PathBuf::from("C:/notes")));
        assert_eq!(take_pick(), None);
    }
}
