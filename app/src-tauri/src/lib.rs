pub mod asset;
pub mod commands;
#[cfg(feature = "e2e")]
pub mod e2e;
pub mod edit;
pub mod errors;
pub mod external;
pub mod indexer;
pub mod library;
pub mod log;
pub mod navigation;
pub mod net;
pub mod paths;
pub mod reader;
pub mod recovery;
pub mod search;
pub mod state;
pub mod workspace;

use tauri::{path::BaseDirectory, Manager};

/// The app's data folder, with the library from a pre-release app ID copied in on first start (newest first).
fn app_data_dir(app: &tauri::App) -> tauri::Result<std::path::PathBuf> {
    let dir = app.path().app_data_dir()?;
    for old_id in ["com.scimaxglobal.markvy", "com.scimaxglobal.folio"] {
        let Some(old) = dir.parent().map(|p| p.join(old_id)) else { break };
        match library::import_from(&old, &dir) {
            Ok(true) => break,
            Ok(false) => {}
            Err(e) => { let _ = log::append(&dir, &format!("could not import the library from {old_id}: {e}")); }
        }
    }
    Ok(dir)
}

/// Longest the window waits for the screens to write their drafts before it closes anyway.
const CLOSE_WAIT: std::time::Duration = std::time::Duration::from_secs(2);

/// Closing the window keeps drafts (spec): the screens write every draft, then say `close_ready`.
/// A second close request, a dead web view or a slow disk closes it after at most `CLOSE_WAIT`.
fn close_after_drafts(window: &tauri::Window) {
    use tauri::Emitter;
    let (tx, rx) = std::sync::mpsc::channel();
    // Replacing an earlier waiter drops its sender, so that earlier wait ends at once: a second click closes now.
    // Before setup has registered the state there are no drafts to wait for.
    let Some(st) = window.try_state::<state::AppState>() else { let _ = window.destroy(); return; };
    *state::LockExt::locked(&st.close_waiter) = Some(tx);
    let _ = window.emit("close-requested", ());
    let window = window.clone();
    std::thread::spawn(move || {
        let _ = rx.recv_timeout(CLOSE_WAIT);
        let _ = window.destroy();
    });
}

/// One command list; the test-only commands are appended only under the `e2e` feature.
macro_rules! markvy_handler {
    ($($extra:path),* $(,)?) => {
        tauri::generate_handler![
            commands::list_collections, commands::pick_folder, commands::pick_file, commands::get_tree,
            commands::search, commands::read_document, commands::load_library, commands::save_library,
            commands::fetch_remote_image, commands::open_external, commands::open_log_folder,
            commands::forget_collection, commands::take_recovery,
            commands::set_editing_allowed, commands::close_ready, commands::open_for_edit, commands::file_fingerprint, commands::save_document,
            commands::save_draft, commands::take_draft, commands::discard_draft, commands::list_drafts,
            commands::create_page, commands::create_folder, commands::rename_with_edits, commands::delete_entry, commands::save_picture,
            $($extra),*
        ]
    };
}

pub fn run() {
    #[cfg(feature = "e2e")]
    e2e::mark_start();
    #[cfg(feature = "e2e")]
    let handler: fn(tauri::ipc::Invoke<tauri::Wry>) -> bool = markvy_handler![e2e::e2e_set_next_pick, e2e::e2e_uptime_ms, e2e::e2e_crash_webview];
    #[cfg(not(feature = "e2e"))]
    let handler: fn(tauri::ipc::Invoke<tauri::Wry>) -> bool = markvy_handler![];
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // A document must never navigate the window away from the app (WebKit follows MathML href).
        .plugin(
            tauri::plugin::Builder::<tauri::Wry>::new("nav-guard")
                .on_navigation(|_webview, url| navigation::is_app_url(url))
                .build(),
        );
    #[cfg(feature = "e2e")]
    let builder = builder.on_page_load(|webview, payload| {
        if payload.event() == tauri::webview::PageLoadEvent::Finished {
            e2e::page_loaded(webview.app_handle());
        }
    });
    // WebKit on macOS reports a dead content process through this hook; Windows and Linux use recovery::watch.
    #[cfg(target_os = "macos")]
    let builder = builder.on_web_content_process_terminate(|webview| {
        let app = webview.app_handle().clone();
        std::thread::spawn(move || recovery::crashed(&app, recovery::Crash::Renderer));
    });
    builder
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                close_after_drafts(window);
            }
        })
        .setup(|app| {
            #[cfg(feature = "e2e")]
            let data_dir = match e2e::data_dir() { Some(dir) => dir, None => app_data_dir(app)? };
            #[cfg(not(feature = "e2e"))]
            let data_dir = app_data_dir(app)?;
            // A failed read is kept, not papered over: the state then refuses to save over the unread library.
            let loaded = library::load(&data_dir);
            let mut collections = loaded.as_ref().map(|l| workspace::collections_from_library(&l.library)).unwrap_or_default();
            if let Ok(root) = app.path().resolve("sample-wiki", BaseDirectory::Resource) {
                collections.insert(0, workspace::Collection {
                    id: workspace::SAMPLE_ID.into(),
                    name: "Sample library".into(),
                    root,
                    available: true,
                });
            }
            app.manage(state::AppState::new(data_dir, collections, loaded));
            if let Some(window) = app.get_webview_window("main") {
                recovery::watch(&window);
            }
            Ok(())
        })
        .register_asynchronous_uri_scheme_protocol("markvy", |ctx, request, responder| {
            // Disk reads run on the blocking pool so a slow drive never stalls the window.
            let app = ctx.app_handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                let response = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| asset::respond(&app, &request)))
                    .unwrap_or_else(|_| {
                        recovery::report(&app, "markvy:// handler panicked");
                        tauri::http::Response::builder().status(500).body(std::borrow::Cow::Borrowed(&[][..])).unwrap()
                    });
                responder.respond(response);
            });
        })
        .invoke_handler(handler)
        .run(tauri::generate_context!())
        .expect("error while running Markvy");
}
