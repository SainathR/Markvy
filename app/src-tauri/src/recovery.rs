//! What happens when the web view's content process ends (spec §5, amendment A12).
use crate::{log, state::{AppState, LockExt}};
use serde::Serialize;
use std::{sync::Mutex, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};
use tauri::{AppHandle, Manager};

/// A second crash this soon after the first reloads without reopening tabs: one of them may be the cause.
pub const REPEAT_WINDOW: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Crash { Renderer, Engine }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action { Reload, Restart }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recovered {
    pub restore_session: bool,
    /// Wall-clock ms (since 1970) when this Markvy process started. A saved session older than this was not saved by this run.
    pub started_at_ms: u64,
}

pub struct Recovery {
    last: Mutex<Option<Instant>>,
    pending: Mutex<Option<Recovered>>,
    started_at_ms: u64,
}

impl Default for Recovery {
    fn default() -> Self {
        let started_at_ms = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
        Recovery { last: Mutex::new(None), pending: Mutex::new(None), started_at_ms }
    }
}

impl Recovery {
    pub fn on_crash(&self, kind: Crash, now: Instant) -> Action {
        let mut last = self.last.locked();
        let repeat = last.is_some_and(|t| now.duration_since(t) < REPEAT_WINDOW);
        *last = Some(now);
        *self.pending.locked() = Some(Recovered { restore_session: !repeat, started_at_ms: self.started_at_ms });
        match kind {
            Crash::Renderer => Action::Reload,
            Crash::Engine => Action::Restart,
        }
    }

    /// What the screens are told once, right after the reload.
    pub fn take(&self) -> Option<Recovered> {
        self.pending.locked().take()
    }
}

/// Writes one line to Markvy's log (release builds have no console); stderr is only the fallback.
pub fn report(app: &AppHandle, line: &str) {
    let logged = app.try_state::<AppState>().map(|state| log::append(&state.data_dir, line));
    if !matches!(logged, Some(Ok(()))) {
        eprintln!("Markvy: {line}");
    }
}

/// Logs the crash and reloads the window (or restarts Markvy when the whole engine is gone).
pub fn crashed(app: &AppHandle, kind: Crash) {
    // The macOS hook can fire before the state is managed.
    let Some(state) = app.try_state::<AppState>() else { return eprintln!("Markvy: {kind:?} crash before start-up finished") };
    let action = state.recovery.on_crash(kind, Instant::now());
    report(app, &format!("webview: {kind:?} process ended; {action:?}"));
    match action {
        Action::Reload => match app.get_webview_window("main") {
            Some(w) => {
                if let Err(e) = w.reload() {
                    report(app, &format!("reload failed: {e}"));
                }
            }
            None => report(app, "no main window to reload"),
        },
        Action::Restart => app.restart(),
    }
}

// The platform event handlers run on the UI thread, so recovery runs on its own thread and lets the handler return first.

#[cfg(windows)]
pub(crate) fn kind_of(kind: webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_PROCESS_FAILED_KIND) -> Option<Crash> {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    match kind {
        COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED | COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE => Some(Crash::Renderer),
        COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED => Some(Crash::Engine),
        _ => None,
    }
}

#[cfg(windows)]
pub fn watch(window: &tauri::WebviewWindow) {
    use webview2_com::{Microsoft::Web::WebView2::Win32::*, ProcessFailedEventHandler};
    let app = window.app_handle().clone();
    let app_for_log = app.clone();
    let attached = window.with_webview(move |platform| unsafe {
        let Ok(core) = platform.controller().CoreWebView2() else { return report(&app_for_log, "no WebView2 core to watch") };
        let handler = ProcessFailedEventHandler::create(Box::new(move |_, args| {
            let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
            if let Some(args) = args {
                args.ProcessFailedKind(&mut kind)?;
            }
            if let Some(crash) = kind_of(kind) {
                let app = app.clone();
                std::thread::spawn(move || crashed(&app, crash));
            }
            Ok(())
        }));
        let mut token = 0i64;
        if let Err(e) = core.add_ProcessFailed(&handler, &mut token) {
            report(&app_for_log, &format!("crash watch not attached: {e}"));
        }
    });
    if let Err(e) = attached {
        report(window.app_handle(), &format!("crash watch not attached: {e}"));
    }
}

#[cfg(target_os = "linux")]
pub fn watch(window: &tauri::WebviewWindow) {
    use webkit2gtk::WebViewExt;
    let app = window.app_handle().clone();
    let for_hook = app.clone();
    let attached = window.with_webview(move |platform| {
        platform.inner().connect_web_process_terminated(move |_, _reason| {
            let app = for_hook.clone();
            std::thread::spawn(move || crashed(&app, Crash::Renderer));
        });
    });
    if let Err(e) = attached {
        report(&app, &format!("crash watch not attached: {e}"));
    }
}

/// macOS uses the builder hook in lib.rs instead.
#[cfg(not(any(windows, target_os = "linux")))]
pub fn watch(_window: &tauri::WebviewWindow) {}

/// Crashes the page's content process on purpose, for the whole-app crash test (A13).
#[cfg(feature = "e2e")]
pub fn crash_for_test(app: &AppHandle) -> Result<(), crate::errors::AppError> {
    use crate::errors::AppError;
    let window = app.get_webview_window("main").ok_or_else(|| AppError::Internal("no main window".into()))?;
    #[cfg(windows)]
    {
        // Chromium's DevTools "Page.crash" ends the renderer exactly like a real crash.
        return window
            .with_webview(|platform| unsafe {
                use webview2_com::{CallDevToolsProtocolMethodCompletedHandler, CoTaskMemPWSTR};
                if let Ok(core) = platform.controller().CoreWebView2() {
                    let method = CoTaskMemPWSTR::from("Page.crash");
                    let params = CoTaskMemPWSTR::from("{}");
                    let done = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(|_, _| Ok(())));
                    let _ = core.CallDevToolsProtocolMethod(*method.as_ref().as_pcwstr(), *params.as_ref().as_pcwstr(), &done);
                }
            })
            .map_err(|e| AppError::Internal(e.to_string()));
    }
    #[cfg(target_os = "linux")]
    {
        use webkit2gtk::WebViewExt;
        return window
            .with_webview(|platform| platform.inner().terminate_web_process())
            .map_err(|e| AppError::Internal(e.to_string()));
    }
    #[allow(unreachable_code)]
    Err(AppError::Internal(format!("not supported on this system ({})", window.label())))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn a_first_crash_reloads_and_restores() {
        let r = Recovery::default();
        assert_eq!(r.on_crash(Crash::Renderer, Instant::now()), Action::Reload);
        assert_eq!(r.take(), Some(Recovered { restore_session: true, started_at_ms: r.started_at_ms }));
        assert_eq!(r.take(), None, "told once");
    }

    #[test]
    fn a_second_crash_within_a_minute_does_not_restore() {
        let r = Recovery::default();
        let t = Instant::now();
        r.on_crash(Crash::Renderer, t);
        r.take();
        assert_eq!(r.on_crash(Crash::Renderer, t + Duration::from_secs(59)), Action::Reload);
        assert_eq!(r.take(), Some(Recovered { restore_session: false, started_at_ms: r.started_at_ms }));
    }

    #[test]
    fn a_crash_after_a_quiet_minute_restores_again() {
        let r = Recovery::default();
        let t = Instant::now();
        r.on_crash(Crash::Renderer, t);
        r.on_crash(Crash::Renderer, t + REPEAT_WINDOW + Duration::from_secs(1));
        assert_eq!(r.take(), Some(Recovered { restore_session: true, started_at_ms: r.started_at_ms }));
    }

    #[test]
    fn the_start_time_is_a_recent_wall_clock_time() {
        let r = Recovery::default();
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64;
        assert!(r.started_at_ms > 1_700_000_000_000 && r.started_at_ms <= now);
    }

    #[test]
    fn an_engine_crash_restarts_the_app() {
        assert_eq!(Recovery::default().on_crash(Crash::Engine, Instant::now()), Action::Restart);
    }

    #[test]
    fn nothing_to_report_without_a_crash() {
        assert_eq!(Recovery::default().take(), None);
    }

    #[test]
    fn recovered_serializes_for_the_screens() {
        assert_eq!(serde_json::to_string(&Recovered { restore_session: true, started_at_ms: 42 }).unwrap(), r#"{"restoreSession":true,"startedAtMs":42}"#);
    }
}

#[cfg(all(test, windows))]
mod windows_tests {
    use super::*;
    use webview2_com::Microsoft::Web::WebView2::Win32::*;

    #[test]
    fn process_failure_kinds_map_to_crashes() {
        assert_eq!(kind_of(COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED), Some(Crash::Renderer));
        assert_eq!(kind_of(COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE), Some(Crash::Renderer));
        assert_eq!(kind_of(COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED), Some(Crash::Engine));
        assert_eq!(kind_of(COREWEBVIEW2_PROCESS_FAILED_KIND_FRAME_RENDER_PROCESS_EXITED), None, "documents have no frames");
        assert_eq!(kind_of(COREWEBVIEW2_PROCESS_FAILED_KIND_GPU_PROCESS_EXITED), None, "WebView2 recovers on its own");
    }
}
