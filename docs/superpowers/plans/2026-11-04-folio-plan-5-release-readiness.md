# Folio Plan 5: Release Readiness (Crash Safety, Whole-App Tests, CI, Installers)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Folio ready to ship:
- a failure in the core never freezes or breaks the app;
- if the web view crashes, the window reloads and brings the reader's tabs back;
- the brief's 12 UAT scenarios run as automated whole-app tests on Windows and Linux;
- the screens are checked in WebKit and with axe-core;
- CI builds and tests every change on Windows, macOS and Linux, including the speed targets;
- a release workflow builds signed installers;
- the manual checklists and the UAT script are written down.

**Architecture:**
- **Rust core.**
  - Every command runs inside `guarded`, which catches a panic and returns `Internal`.
  - Locks recover from poisoning, so one panic never breaks later commands.
  - The indexer thread, the folder watchers and the `folio://` protocol also contain panics.
  - A new `recovery` module decides what to do when the web view's content process ends:
    - reload the window and restore the tabs;
    - if it happens again within a minute, reload without reopening the tabs.
  - It hooks the process-failure event of each platform's web view. A new `take_recovery` command tells the screens what happened.
- **Test-only `e2e` Cargo feature.** It adds:
  - a data-folder override (`FOLIO_DATA_DIR`);
  - a way to answer the file pickers;
  - a crash trigger;
  - an uptime reading.
  Release builds never enable it.
- **Whole-app tests.** WebdriverIO with `tauri-driver` drives the real app on Windows and Linux.
- **Screen tests.** Playwright runs the screens in WebKit and Chromium with a simulated core, built from the sample wiki, and runs axe-core on every screen.
- **CI and release.** GitHub Actions workflows: `ci.yml` (three platforms) and `release.yml` (installers, signing when the secrets exist, checksums).
- **Static checks.** These guard the workflows, the dependency list and the read-only rule:
  - Vitest tests of the workflow files;
  - `check:deps`;
  - clippy `disallowed-methods`.

**Tech Stack:**
- Plans 1–4: Tauri 2.12, Svelte 5 runes, TypeScript, Vitest with jsdom, and the Rust crates already in `Cargo.toml`.
- New, Rust, platform-only:
  - `webview2-com` 0.39 (Windows), the version Tauri already uses;
  - `webkit2gtk` 2.0 with feature `v2_40` (Linux), the version Tauri already uses.
- New, dev only (npm):
  - `@wdio/cli`, `@wdio/local-runner`, `@wdio/mocha-framework`, `@wdio/spec-reporter`, `@wdio/globals` 9;
  - `@playwright/test` 1;
  - `@axe-core/playwright` 4;
  - `yaml` 2.
- Tools installed with `cargo install` (not dependencies):
  - `tauri-driver`;
  - `msedgedriver-tool` (Windows only).

**Spec:** `docs/superpowers/specs/2026-11-02-folio-desktop-architecture-design.md`, sections §1 (criterion 3), §5 (containment rules), §6 (no telemetry, dependency review), §7 (testing), §8 (packaging), §9 (product-owner dependencies), §10 (risks), and amendments A1–A11. The brief's section 12 lists the 12 UAT scenarios; they are copied into Task 5 and Task 10.

**Branch:** `feat/folio-plan-5`.

## Spec amendments this plan proposes (needs the product owner's approval before execution)

| # | Spec says | This plan does | Why |
|---|---|---|---|
| A12 | §5: "If the web view crashes, the window reloads and restores the session." | The window reloads and the tabs come back, with the notice "Folio had a problem and reloaded. Your tabs are back." If it crashes again within 60 seconds, the window reloads without reopening the tabs, so a document that crashes the web view can't trap the reader in a loop. Home then offers "Restore previous session" as usual. On Windows, if the whole WebView2 engine stops (not only the page), Folio restarts itself instead. A new command, `take_recovery`, tells the screens what happened. Every crash is written to the log. | A plain reload-and-restore loops forever on a document that crashes the web view each time it opens. |
| A13 | §7: whole-app tests with WebdriverIO and `tauri-driver` | Builds with the Cargo feature `e2e` add test-only commands: `e2e_set_next_pick`, `e2e_crash_webview` and `e2e_uptime_ms`. They also take the data folder from `FOLIO_DATA_DIR`. Release builds and `release.yml` never enable the feature, and a test enforces this. | Native file pickers can't be driven by WebDriver. Tests must never touch the tester's own library. A crash must be reproducible on demand. |
| A14 | §6: "The CI dependency review flags any new dependency that makes network calls." | `npm run check:deps` fails on any crate in `Cargo.lock`, or npm production package in `package-lock.json`, that isn't in `scripts/reviewed-deps.json`. A person checks whether it uses the network, then adds it with `--update`. | No script can tell whether a library makes network calls. Flagging every new dependency for a person to review is the enforceable version. |

## Out of scope

- Running CI and the release workflow on GitHub. This needs the product owner's repository (spec §9.1). This plan writes the workflows and checks them locally (Tasks 8–9). They run for the first time once the repository exists.
- Real signing. This needs the Windows certificate and the Apple Developer membership (§9.2–9.3). The release workflow signs when the secrets exist, and otherwise builds unsigned and says so.
- Running the UAT with 5 users, the screen-reader pass and the macOS manual checklist. Task 10 writes these as scripts for people to run.
- The independent security review decision (§9.5).
- Deferred minors from Plans 1–4 (see their ledgers) stay deferred, except these, which this plan picks up:
  - clippy `disallowed-methods` (Plan 1 ledger, Task 8);
  - `.gitattributes` for fixture line endings (Plan 1 ledger, Task 9);
  - lock poisoning (Plan 1 final ruling);
  - the Windows junction and virtual-drive manual checks (Plan 1, now in Task 10's release checklist).

## Global Constraints

Every task's requirements include this section.

- **Earlier constraints still hold.**
  - Every document read goes through `paths::resolve`.
  - The CSP string in `tauri.conf.json` is unchanged.
  - Capabilities stay `core:default` only.
  - Errors are `{code, details?}`.
  - Messages are plain language, verbatim from spec §5, `MESSAGES` or this section.
  - Untrusted text is never rendered with `{@html}`.
  - CSS changes only through `scripts/port-styles.mjs`.
- **Rust builds** use `export PATH="$USERPROFILE/.cargo/bin:$PATH"; export CARGO_TARGET_DIR="$LOCALAPPDATA/folio-target"`. Never build into `app/src-tauri/target`, which OneDrive locks.
- **Read-only (§6, A8):**
  - Only `library.rs` and `log.rs` may write files. `npm run check:readonly` enforces it, and from Task 7 so does clippy.
  - The `e2e` and `recovery` modules write nothing except log lines through `log::append`.
  - Whole-app tests create their fixture folders from Node, not from the app.
- **Network (§6):**
  - `net.rs` is the only Rust networking code.
  - No new crate, npm production package or command may add network access, telemetry or update checks.
- **`e2e` feature (A13):**
  - Code for it compiles only under `#[cfg(feature = "e2e")]`.
  - `release.yml` and `tauri.conf.json` never mention `e2e`.
- **New messages,** verbatim:
  - `Recovered`: "Folio had a problem and reloaded."
  - `RecoveredRestored`: "Folio had a problem and reloaded. Your tabs are back."
  - `RecoveredFresh`: "Folio had a problem again and reloaded. Your tabs weren’t reopened, in case one of them caused it. You can reopen them with Restore previous session."
- **Speed targets (§7):**
  - start under 1.5 s;
  - a 1,000-file folder's tree under 2 s;
  - search across 5,000 documents under 200 ms.
- **Platforms (§1, §10):** CI runs on `windows-latest`, `macos-latest` and `ubuntu-24.04`.
  - Ruling: 24.04 until GitHub offers a 26.04 runner; then bump it.
- **Packages (§8):**

  | Platform | Packages | Signing |
  |---|---|---|
  | Windows | MSI and NSIS | certificate, when the secret exists |
  | macOS | universal DMG | Developer ID and notarization, when the secrets exist |
  | Linux | AppImage and .deb | SHA-256 checksums for every file |

- **No automatic updates (§1).** No updater plugin, no update-check URL.
- **Test file names, kept out of Vitest's `include`:**
  - WebdriverIO specs end in `.e2e.ts` and live under `app/e2e/`.
  - Playwright specs end in `.pw.ts` and live under `app/webtest/`.

## Review Focus

The five failure modes most likely to bite a person, and the test that pins each:

1. **A document that crashes the web view every time it opens.** Expected: a second crash within 60 s reloads without reopening the tabs, so there is no loop.
   - Task 2: `a_second_crash_within_a_minute_does_not_restore`.
   - Task 3: `after a repeated crash, tabs stay closed and Home offers restore`.
   - Task 5: the crash spec's second crash.
2. **A panic while a lock is held.** Expected: later commands still work.
   - Task 1: `a_panic_while_holding_the_folder_list_does_not_break_later_commands`.
   - Task 1: `a_panicking_index_build_still_finishes`, so search never says "still indexing" forever.
3. **Whole-app tests run on a developer's own machine.** Expected: they never read or change the developer's own library.
   - Task 4: `data_dir_comes_from_folio_data_dir`.
   - Task 5: scenario 9 asserts `library.json` appears in the temporary data folder.
4. **No signing secrets** (a fork, or the first run before certificates exist). Expected: the release still builds, marks itself unsigned and never ships the `e2e` feature.
   - Task 9: `release workflow signs only when secrets exist and never enables e2e`.
5. **A Linux or macOS checkout gets LF line endings, while the tests were written against Windows CRLF fixtures.** Expected: the same results on every platform.
   - Task 7: `.gitattributes` plus the LF-clone test run.

---

### Task 1: Contain panics in commands and background work

**Files:**
- Modify: `app/src-tauri/src/state.rs` (add `LockExt`)
- Modify: `app/src-tauri/src/errors.rs` (add `panic_text`)
- Modify: `app/src-tauri/src/commands.rs` (add `guarded`; every command uses it; `pick_folder` and `pick_file` become `#[tauri::command(async)]` functions that are not `async`)
- Modify: `app/src-tauri/src/indexer.rs` (poison-safe locks; the build thread and the watcher handler contain panics)
- Modify: `app/src-tauri/src/lib.rs` (the `folio://` handler contains panics)
- Modify: `app/src-tauri/src/net.rs` (poison-safe locks, if any `.lock().unwrap()` is outside tests)

**Interfaces:**
- Produces:
  - `pub trait LockExt<T> { fn locked(&self) -> std::sync::MutexGuard<'_, T>; }`, implemented for `std::sync::Mutex<T>` in `state.rs`.
  - `pub fn panic_text(payload: &(dyn std::any::Any + Send)) -> String` in `errors.rs`.
  - `pub fn guarded<T>(state: &AppState, command: &str, body: impl FnOnce() -> Result<T, AppError>) -> Result<T, AppError>` in `commands.rs`. It catches a panic as `AppError::Internal(format!("panic: {text}"))`, then passes the result through `logged`.
  - `pub(crate) fn finish_after_panic(indexes: &Mutex<HashMap<String, CollectionIndex>>, id: &str, generation: u64, emit: &dyn Fn(Notice))` in `indexer.rs`.

- [ ] **Step 1: Write the failing tests**

In `state.rs` tests:

```rust
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
```

In `commands.rs` tests:

```rust
#[test]
fn a_panicking_command_returns_internal_and_is_logged() {
    let d = tempfile::tempdir().unwrap();
    let s = AppState::new(d.path().to_path_buf(), vec![], Ok(LoadResult::fresh()));
    let r: Result<(), AppError> = guarded(&s, "boom", || panic!("kaboom"));
    assert_eq!(r, Err(AppError::Internal("panic: kaboom".into())));
    let text = std::fs::read_to_string(crate::log::dir(d.path()).join("folio.log")).unwrap();
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
fn panic_text_reads_both_payload_kinds() {
    let a = std::panic::catch_unwind(|| panic!("static text")).unwrap_err();
    let b = std::panic::catch_unwind(|| panic!("{}", String::from("owned"))).unwrap_err();
    assert_eq!(crate::errors::panic_text(&*a), "static text");
    assert_eq!(crate::errors::panic_text(&*b), "owned");
}
```

In `indexer.rs` tests (use the module's existing test helpers for building a `Mutex<HashMap<…>>`; if there are none, build one inline):

```rust
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
```

If `Notice` lacks `Debug` or `PartialEq`, use `matches!` as above. Don't add derives only for tests.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd app/src-tauri && cargo test locked panic finish_after 2>&1 | tail -20`. Use the build env from Global Constraints.
Expected: compile errors, because `LockExt`, `guarded`, `panic_text` and `finish_after_panic` are not defined.

- [ ] **Step 3: Implement**

`state.rs`:

```rust
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
```

Then replace every `.lock().unwrap()` in non-test code of `state.rs`, `commands.rs`, `indexer.rs` and `net.rs` with `.locked()`, and add `use crate::state::LockExt;` where needed. Test code may keep `.lock().unwrap()`. Afterwards this must print nothing outside `#[cfg(test)]` modules:

```bash
grep -n "\.lock()\.unwrap()" app/src-tauri/src/*.rs
```

Before replacing any line, read its critical section. If a section can leave the data half-changed when it panics, write that in the report. Don't paper over it.

`errors.rs`:

```rust
/// The message of a caught panic, for the log and Copy details.
pub fn panic_text(payload: &(dyn std::any::Any + Send)) -> String {
    payload
        .downcast_ref::<&str>()
        .map(|s| s.to_string())
        .or_else(|| payload.downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "unknown".to_string())
}
```

`commands.rs`:

```rust
/// Runs a command body so a panic comes back as an error (spec §5) instead of a promise that never settles.
pub fn guarded<T>(state: &AppState, command: &str, body: impl FnOnce() -> Result<T, AppError>) -> Result<T, AppError> {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(body))
        .unwrap_or_else(|payload| Err(AppError::Internal(format!("panic: {}", crate::errors::panic_text(&*payload)))));
    logged(state, command, result)
}
```

Every command now calls `guarded(&state, "<name>", || { …body… })` instead of `logged(&state, "<name>", (|| {…})())`.

`pick_folder` and `pick_file` change from `pub async fn` to `#[tauri::command(async)] pub fn`. Tauri still runs them off the main thread, which is what `blocking_pick_folder` and `blocking_pick_file` need. Their bodies move into `guarded`. Behaviour is otherwise unchanged:
- `None` means the person cancelled;
- the path is canonicalized;
- the collection is added and persisted.

`indexer.rs`:
- `start` wraps the build:

  ```rust
  std::thread::spawn(move || {
      let built = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| build(&indexes, &id, &root, generation, &*emit)));
      if let Err(payload) = built {
          eprintln!("Folio: indexing {id} stopped: {}", crate::errors::panic_text(&*payload));
          finish_after_panic(&indexes, &id, generation, &*emit);
      }
  });
  ```

- `finish_after_panic`:

  ```rust
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
  ```

- The watcher closure in `watch` becomes:

  ```rust
  move |res: DebounceEventResult| {
      if let Err(payload) = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| on_events(&indexes, &cid, &base, res, &*emit))) {
          eprintln!("Folio: change handling for {cid} failed: {}", crate::errors::panic_text(&*payload));
      }
  }
  ```

  Keep the existing variable names.

`lib.rs`, the `folio://` handler:

```rust
tauri::async_runtime::spawn_blocking(move || {
    let response = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| asset::respond(&app, &request)))
        .unwrap_or_else(|_| tauri::http::Response::builder().status(500).body(std::borrow::Cow::Borrowed(&[][..])).unwrap());
    responder.respond(response);
});
```

The type must match `asset::respond`'s return type, `Response<Cow<'static, [u8]>>`.

`Cargo.toml` must not set `panic = "abort"` in any profile. Add this comment above `[dependencies]`: `# Never set panic = "abort": commands rely on catching panics (spec §5).`

- [ ] **Step 4: Run all Rust tests**

Run: `cd app/src-tauri && cargo test 2>&1 | grep -E "^test result|FAILED|panicked" | head`
Expected:
- every result line reports `0 failed`;
- the passed count is at least 132 + 6;
- the `panicked at` lines come only from the intended panics in the new tests.

Also run `cd app && npm run check:readonly` (passes) and `npx vitest run` (206 pass; unchanged).

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri
git commit -m "fix(core): contain panics in commands, indexing, watchers and folio://, and recover poisoned locks"
```

---

### Task 2: Crash recovery in the core

**Files:**
- Create: `app/src-tauri/src/recovery.rs`
- Modify: `app/src-tauri/src/lib.rs` (`pub mod recovery;`, the macOS builder hook, watching the main window in `setup`, registering `take_recovery`)
- Modify: `app/src-tauri/src/state.rs` (`pub recovery: Recovery` field, set to `Recovery::default()` in `new`)
- Modify: `app/src-tauri/src/commands.rs` (`take_recovery`)
- Modify: `app/src-tauri/Cargo.toml` (platform dependencies)

**Interfaces:**
- Consumes: `guarded`, `LockExt` (Task 1); `log::append`.
- Produces:
  - `pub enum Crash { Renderer, Engine }`.
  - `pub enum Action { Reload, Restart }`.
  - `#[derive(Serialize)] #[serde(rename_all = "camelCase")] pub struct Recovered { pub restore_session: bool }`, serialized as `{"restoreSession":bool}`.
  - `pub const REPEAT_WINDOW: Duration = Duration::from_secs(60)`.
  - `impl Recovery { pub fn on_crash(&self, kind: Crash, now: Instant) -> Action; pub fn take(&self) -> Option<Recovered>; }`.
  - `pub fn crashed(app: &tauri::AppHandle, kind: Crash)`.
  - `pub fn watch(window: &tauri::WebviewWindow)` (Windows and Linux; a no-op elsewhere).
  - The command `take_recovery() -> Option<Recovered>`.

- [ ] **Step 1: Write the failing tests** (in `recovery.rs`)

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn a_first_crash_reloads_and_restores() {
        let r = Recovery::default();
        assert_eq!(r.on_crash(Crash::Renderer, Instant::now()), Action::Reload);
        assert_eq!(r.take(), Some(Recovered { restore_session: true }));
        assert_eq!(r.take(), None, "told once");
    }

    #[test]
    fn a_second_crash_within_a_minute_does_not_restore() {
        let r = Recovery::default();
        let t = Instant::now();
        r.on_crash(Crash::Renderer, t);
        r.take();
        assert_eq!(r.on_crash(Crash::Renderer, t + Duration::from_secs(59)), Action::Reload);
        assert_eq!(r.take(), Some(Recovered { restore_session: false }));
    }

    #[test]
    fn a_crash_after_a_quiet_minute_restores_again() {
        let r = Recovery::default();
        let t = Instant::now();
        r.on_crash(Crash::Renderer, t);
        r.on_crash(Crash::Renderer, t + REPEAT_WINDOW + Duration::from_secs(1));
        assert_eq!(r.take(), Some(Recovered { restore_session: true }));
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
        assert_eq!(serde_json::to_string(&Recovered { restore_session: true }).unwrap(), r#"{"restoreSession":true}"#);
    }
}
```

On Windows only, add a test of the event-kind mapping:

```rust
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd app/src-tauri && cargo test recovery 2>&1 | tail -5`
Expected: compile error, because the `recovery` module is missing.

- [ ] **Step 3: Implement**

`Cargo.toml`:

```toml
[target.'cfg(windows)'.dependencies]
webview2-com = "0.39"

[target.'cfg(target_os = "linux")'.dependencies]
webkit2gtk = { version = "2.0", features = ["v2_40"] }
```

Both versions must match what `Cargo.lock` already resolves for Tauri (`webview2-com 0.39.1`, `webkit2gtk 2.0.2`). If `cargo` resolves a second copy of either, stop and report.

`recovery.rs`:

```rust
//! What happens when the web view's content process ends (spec §5, amendment A12).
use crate::{log, state::{AppState, LockExt}};
use serde::Serialize;
use std::{sync::Mutex, time::{Duration, Instant}};
use tauri::{AppHandle, Manager};

/// A second crash this soon after the first reloads without reopening tabs: one of them may be the cause.
pub const REPEAT_WINDOW: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Crash { Renderer, Engine }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action { Reload, Restart }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recovered { pub restore_session: bool }

#[derive(Default)]
pub struct Recovery {
    last: Mutex<Option<Instant>>,
    pending: Mutex<Option<Recovered>>,
}

impl Recovery {
    pub fn on_crash(&self, kind: Crash, now: Instant) -> Action {
        let mut last = self.last.locked();
        let repeat = last.is_some_and(|t| now.duration_since(t) < REPEAT_WINDOW);
        *last = Some(now);
        *self.pending.locked() = Some(Recovered { restore_session: !repeat });
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

/// Logs the crash and reloads the window (or restarts Folio when the whole engine is gone).
pub fn crashed(app: &AppHandle, kind: Crash) {
    let state = app.state::<AppState>();
    let action = state.recovery.on_crash(kind, Instant::now());
    if let Err(e) = log::append(&state.data_dir, &format!("webview: {kind:?} process ended; {action:?}")) {
        eprintln!("Folio: log not written: {e}");
    }
    match action {
        Action::Reload => match app.get_webview_window("main") {
            Some(w) => {
                if let Err(e) = w.reload() {
                    eprintln!("Folio: reload failed: {e}");
                }
            }
            None => eprintln!("Folio: no main window to reload"),
        },
        Action::Restart => app.restart(),
    }
}
```

Platform hooks, in the same file. The event handlers run on the UI thread, so recovery runs on its own thread and lets the handler return first.

```rust
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
    let attached = window.with_webview(move |platform| unsafe {
        let Ok(core) = platform.controller().CoreWebView2() else { return eprintln!("Folio: no WebView2 core to watch") };
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
        let mut token = Default::default();
        if let Err(e) = core.add_ProcessFailed(&handler, &mut token) {
            eprintln!("Folio: crash watch not attached: {e}");
        }
    });
    if let Err(e) = attached {
        eprintln!("Folio: crash watch not attached: {e}");
    }
}

#[cfg(target_os = "linux")]
pub fn watch(window: &tauri::WebviewWindow) {
    use webkit2gtk::WebViewExt;
    let app = window.app_handle().clone();
    let attached = window.with_webview(move |platform| {
        platform.inner().connect_web_process_terminated(move |_, _reason| {
            let app = app.clone();
            std::thread::spawn(move || crashed(&app, Crash::Renderer));
        });
    });
    if let Err(e) = attached {
        eprintln!("Folio: crash watch not attached: {e}");
    }
}

/// macOS uses the builder hook in lib.rs instead.
#[cfg(not(any(windows, target_os = "linux")))]
pub fn watch(_window: &tauri::WebviewWindow) {}
```

The exact `webview2-com` 0.39 names are the source of truth. Check `ProcessFailedEventHandler`, the `add_ProcessFailed` token type and `ProcessFailedKind` against `~/.cargo/registry/src/*/webview2-com-0.39.1/src/` and Tauri's own use in `tauri-runtime-wry-2.12.3`. Then adjust the code above to match. Don't change its behaviour.

`lib.rs`:

```rust
let builder = tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(/* nav-guard, unchanged */);
#[cfg(target_os = "macos")]
let builder = builder.on_web_content_process_terminate(|webview| {
    let app = webview.app_handle().clone();
    std::thread::spawn(move || recovery::crashed(&app, recovery::Crash::Renderer));
});
builder
    .setup(|app| {
        /* unchanged state set-up … */
        if let Some(window) = app.get_webview_window("main") {
            recovery::watch(&window);
        }
        Ok(())
    })
    /* … */
```

Register `commands::take_recovery` in `generate_handler!`.

`commands.rs`:

```rust
/// Asked once at start-up: did the window just reload after a crash, and should the tabs come back? (A12)
#[tauri::command(async)]
pub fn take_recovery(state: State<'_, AppState>) -> Result<Option<crate::recovery::Recovered>, AppError> {
    guarded(&state, "take_recovery", || Ok(state.recovery.take()))
}
```

- [ ] **Step 4: Run tests and build**

Run: `cd app/src-tauri && cargo test 2>&1 | grep -E "^test result|FAILED"`
Expected: every result line reports `0 failed`. The new `recovery` tests pass, including `windows_tests` on Windows.

Run: `cd app && npm run check:readonly && npm run tauri build -- --no-bundle`
Expected: the check passes and the build succeeds. The Linux and macOS hooks compile for the first time in CI (Task 8). Note this in the report.

- [ ] **Step 5: Manual check on Windows (record the result in the report)**
1. Run `npm run tauri dev`.
2. Open the sample library and one document.
3. In Task Manager, expand Folio and end the "WebView2 Renderer" (or "Microsoft Edge WebView2") process that belongs to Folio. Don't end the "Manager" process.
4. Expected: the window reloads, and `logs/folio.log` in the app data folder has a `webview: Renderer process ended; Reload` line. The screens don't use `take_recovery` until Task 3, so no notice appears yet.

- [ ] **Step 6: Commit**

```bash
git add app/src-tauri
git commit -m "feat(core): reload the window when the web view crashes, without looping on a repeat crash"
```

---

### Task 3: Crash recovery in the screens

**Files:**
- Modify: `app/src/lib/core.ts` (`Recovered`, `takeRecovery`, three `MESSAGES`)
- Modify: `app/src/state/app.svelte.ts` (`init` calls `recover`)
- Test: `app/src/state/app.test.ts`, `app/src/lib/core.test.ts`

**Interfaces:**
- Consumes: the command `take_recovery() -> {restoreSession:boolean} | null` (Task 2).
- Produces:
  - `export interface Recovered { restoreSession: boolean }`.
  - `core.takeRecovery(): Promise<Recovered | null>`.
  - `MESSAGES.Recovered`, `MESSAGES.RecoveredRestored`, `MESSAGES.RecoveredFresh`, verbatim from Global Constraints.

- [ ] **Step 1: Write the failing tests**

In `app/src/state/app.test.ts`, first add `takeRecovery: vi.fn().mockResolvedValue(null),` to `fakeApi`. Then add these tests. Reuse the `session` objects the file already defines; copy the one at line 67 into a shared `const savedSession` at the top of the new `describe`, if it isn't already shared.

```ts
describe('AppStore crash recovery (A12)', () => {
  const library = (session: unknown) => ({ library: { version: 1, session }, reset: false });

  it('after a crash reload, the saved tabs come back with a notice', async () => {
    const app = new AppStore(fakeApi({
      loadLibrary: vi.fn().mockResolvedValue(library(savedSession)),
      takeRecovery: vi.fn().mockResolvedValue({ restoreSession: true }),
    }));
    await app.init();
    expect(app.view).toBe('reader');
    expect(app.notice).toBe(MESSAGES.RecoveredRestored);
  });

  it('after a repeated crash, tabs stay closed and Home offers restore', async () => {
    const app = new AppStore(fakeApi({
      loadLibrary: vi.fn().mockResolvedValue(library(savedSession)),
      takeRecovery: vi.fn().mockResolvedValue({ restoreSession: false }),
    }));
    await app.init();
    expect(app.view).toBe('home');
    expect(app.savedSession).toBeTruthy();
    expect(app.notice).toBe(MESSAGES.RecoveredFresh);
  });

  it('a crash before anything was saved says only that Folio reloaded', async () => {
    const app = new AppStore(fakeApi({ takeRecovery: vi.fn().mockResolvedValue({ restoreSession: true }) }));
    await app.init();
    expect(app.notice).toBe(MESSAGES.Recovered);
  });

  it('a normal start shows no recovery notice', async () => {
    const app = new AppStore(fakeApi());
    await app.init();
    expect(app.notice).toBeNull();
  });

  it('a failing recovery check never blocks start-up', async () => {
    const app = new AppStore(fakeApi({ takeRecovery: vi.fn().mockRejectedValue({ code: 'Internal' }) }));
    await app.init();
    expect(app.ready).toBe(true);
    expect(app.notice).toBeNull();
  });
});
```

`'home'` must match the store's actual name for the Home view. Check how `view` is typed in `app.svelte.ts` and use that value.

In `app/src/lib/core.test.ts`, add a bridge test in the style of the existing ones (they mock `invoke`):

```ts
it('takeRecovery calls take_recovery with no arguments', async () => {
  await core.takeRecovery();
  expect(invoke).toHaveBeenCalledWith('take_recovery');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd app && npx vitest run src/state/app.test.ts src/lib/core.test.ts`
Expected: FAIL, because `takeRecovery` and the `MESSAGES` entries are undefined.

- [ ] **Step 3: Implement**

`core.ts`:
- Add `export interface Recovered { restoreSession: boolean }`.
- Add `takeRecovery: () => invoke<Recovered | null>('take_recovery'),` to `core`.
- Add to `MESSAGES`:

```ts
  Recovered: 'Folio had a problem and reloaded.',
  RecoveredRestored: 'Folio had a problem and reloaded. Your tabs are back.',
  RecoveredFresh: 'Folio had a problem again and reloaded. Your tabs weren’t reopened, in case one of them caused it. You can reopen them with Restore previous session.',
```

`app.svelte.ts`: at the end of `init()`, after `this.ready = true;` and the existing save scheduling, add `await this.recover();`. Then add:

```ts
  /** Right after a crash reload (spec §5, amendment A12): bring the tabs back, unless this was a repeat crash. */
  private async recover(): Promise<void> {
    let rec: Recovered | null = null;
    try {
      rec = await this.api.takeRecovery();
    } catch {
      return; // the check failing must never stop Folio from starting
    }
    if (!rec) return;
    if (!rec.restoreSession) this.notice = MESSAGES.RecoveredFresh;
    else if (this.savedSession) {
      this.restoreSession();
      this.notice = MESSAGES.RecoveredRestored;
    } else this.notice = MESSAGES.Recovered;
  }
```

- [ ] **Step 4: Run all screen tests and the type check**

Run: `cd app && npx vitest run && npm run check`
Expected:
- all pass, at least 206 + 6 tests;
- `svelte-check` reports 0 errors and 0 warnings beyond those already on main.

- [ ] **Step 5: Manual check (record it in the report)**
1. Repeat Task 2 Step 5 with a document open.
2. Expected: after the reload, the same tab is back with "Folio had a problem and reloaded. Your tabs are back."
3. End the renderer again within a minute.
4. Expected: Home, with the `RecoveredFresh` notice and "Restore previous session" offered.

- [ ] **Step 6: Commit**

```bash
git add app/src
git commit -m "feat(app): restore the tabs after a crash reload, and explain a repeat crash"
```

---

### Task 4: Test-only hooks (`e2e` feature) and the tree speed check

**Files:**
- Create: `app/src-tauri/src/e2e.rs`
- Modify: `app/src-tauri/Cargo.toml` (`[features] e2e = []`)
- Modify: `app/src-tauri/src/lib.rs` (`#[cfg(feature = "e2e")] pub mod e2e;`, the data-folder override, starting the clock, extra handlers)
- Modify: `app/src-tauri/src/commands.rs` (pickers take a test answer first)
- Modify: `app/src-tauri/src/recovery.rs` (`crash_for_test`, compiled only with `e2e`)
- Modify: `app/src-tauri/src/workspace.rs` (an ignored speed test)

**Interfaces:**
- Consumes: `recovery` (Task 2); `LockExt` (Task 1).
- Produces, only with `--features e2e`:
  - commands `e2e_set_next_pick(path: String)`, `e2e_uptime_ms() -> u64` and `e2e_crash_webview() -> Result<(), AppError>`;
  - the environment variable `FOLIO_DATA_DIR`.
- Produces in every build: `fn test_pick() -> Option<PathBuf>` in `commands.rs`, which always returns `None` without the feature.

- [ ] **Step 1: Write the failing tests**

`e2e.rs` tests:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn data_dir_comes_from_folio_data_dir() {
        std::env::set_var("FOLIO_DATA_DIR", "/tmp/folio-e2e-x");
        assert_eq!(data_dir(), Some(std::path::PathBuf::from("/tmp/folio-e2e-x")));
        std::env::remove_var("FOLIO_DATA_DIR");
        assert_eq!(data_dir(), None);
    }

    #[test]
    fn a_test_pick_is_used_once() {
        e2e_set_next_pick("C:/notes".into());
        assert_eq!(take_pick(), Some(std::path::PathBuf::from("C:/notes")));
        assert_eq!(take_pick(), None);
    }
}
```

`workspace.rs` test (speed target §7; it runs in CI from Task 8):

```rust
#[test]
#[ignore = "speed check: cargo test --release tree_speed -- --ignored"]
fn tree_speed_1000_files() {
    let d = tempfile::tempdir().unwrap();
    for s in 0..20 {
        let dir = d.path().join(format!("Section {s:02}"));
        std::fs::create_dir(&dir).unwrap();
        for f in 0..50 {
            std::fs::write(dir.join(format!("Page {f:02}.md")), "# Page\n").unwrap();
        }
    }
    let started = std::time::Instant::now();
    let tree = build_tree(d.path()).unwrap();
    assert_eq!(tree.root.children.len(), 20);
    assert!(started.elapsed().as_millis() < 2000, "took {:?}", started.elapsed());
}
```

Writing in a test temp folder is test code; the read-only check ignores `#[cfg(test)]` modules. If `npm run check:readonly` flags it, follow the pattern the existing tests use.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd app/src-tauri && cargo test --features e2e e2e 2>&1 | tail -5`
Expected: compile error, because `e2e` doesn't exist.

- [ ] **Step 3: Implement**

`Cargo.toml`:

```toml
[features]
# Test-only commands for the whole-app tests (spec amendment A13). Never enabled in release builds.
e2e = []
```

`e2e.rs`:

```rust
//! Test-only hooks for the whole-app tests (spec amendment A13). Compiled only with `--features e2e`.
use crate::{errors::AppError, state::LockExt};
use std::{path::PathBuf, sync::{Mutex, OnceLock}, time::Instant};
use tauri::AppHandle;

static NEXT_PICK: Mutex<Option<PathBuf>> = Mutex::new(None);
static STARTED: OnceLock<Instant> = OnceLock::new();

/// Called first thing in `run()`, so uptime covers the core's own start-up.
pub fn mark_start() {
    STARTED.get_or_init(Instant::now);
}

/// Tests keep their own library: never the tester's.
pub fn data_dir() -> Option<PathBuf> {
    std::env::var_os("FOLIO_DATA_DIR").map(PathBuf::from)
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
```

`lib.rs`:
- At the top of `run()`: `#[cfg(feature = "e2e")] e2e::mark_start();`
- In `setup`, replace `let data_dir = app.path().app_data_dir()?;` with:

```rust
#[cfg(feature = "e2e")]
let data_dir = match e2e::data_dir() { Some(dir) => dir, None => app.path().app_data_dir()? };
#[cfg(not(feature = "e2e"))]
let data_dir = app.path().app_data_dir()?;
```

- The handlers: one command list, extended only under the feature. Use a local macro so the list isn't duplicated:

```rust
macro_rules! folio_handler {
    ($($extra:path),* $(,)?) => {
        tauri::generate_handler![
            commands::list_collections, commands::pick_folder, commands::pick_file, commands::get_tree,
            commands::search, commands::read_document, commands::load_library, commands::save_library,
            commands::fetch_remote_image, commands::open_external, commands::open_log_folder,
            commands::forget_collection, commands::take_recovery, $($extra),*
        ]
    };
}
#[cfg(feature = "e2e")]
let handler = folio_handler![e2e::e2e_set_next_pick, e2e::e2e_uptime_ms, e2e::e2e_crash_webview];
#[cfg(not(feature = "e2e"))]
let handler = folio_handler![];
```

  Then use `.invoke_handler(handler)`. If `generate_handler!` rejects the empty-extras expansion, write the two lists out in full and add a comment that they must stay in step.

`commands.rs`:

```rust
/// Whole-app tests answer the picker in advance (A13). Always None in normal builds.
fn test_pick() -> Option<std::path::PathBuf> {
    #[cfg(feature = "e2e")]
    return crate::e2e::take_pick();
    #[cfg(not(feature = "e2e"))]
    None
}
```

`pick_folder` and `pick_file` use `test_pick()` first and open the dialog only when it returns `None`. A test pick still goes through `dunce::canonicalize`. `pick_file` with a test pick still goes through `workspace::split_file`.

`recovery.rs`:

```rust
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
```

The same rule as Task 2 applies: check the exact `webview2-com` 0.39 helper names in its source and adjust.

- [ ] **Step 4: Run tests in both feature modes and build the e2e binary**

Run:

```bash
cd app/src-tauri
cargo test 2>&1 | grep -E "^test result|FAILED"
cargo test --features e2e 2>&1 | grep -E "^test result|FAILED"
cargo test --release tree_speed -- --ignored --nocapture 2>&1 | grep -E "test result|took"
cd .. && npm run check:readonly && npm run tauri build -- --no-bundle --features e2e
```

Expected:
- every run reports `0 failed`;
- `tree_speed_1000_files` passes;
- the e2e binary builds at `$CARGO_TARGET_DIR/release/folio.exe`.

Then confirm the commands are absent without the feature:

```bash
cargo build --release
grep -c e2e_crash_webview "$CARGO_TARGET_DIR/release/folio.exe"
```

Expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri
git commit -m "test(core): add the test-only e2e feature (data folder, picker answers, crash, uptime) and a tree speed check"
```

---

### Task 5: Whole-app tests with WebdriverIO (Windows and Linux)

**Files:**
- Create: `app/e2e/wdio.conf.ts`, `app/e2e/tsconfig.json`, `app/e2e/helpers.ts`
- Create: `app/e2e/specs/scenarios.e2e.ts`, `app/e2e/specs/crash.e2e.ts`, `app/e2e/specs/speed.e2e.ts`
- Modify: `app/package.json` (dev dependencies and the `test:e2e` script)
- Modify: `.gitignore` (`app/e2e/.driver/`)

**Interfaces:**
- Consumes:
  - the `e2e` feature (Task 4): `FOLIO_DATA_DIR`, `e2e_set_next_pick`, `e2e_uptime_ms`, `e2e_crash_webview`;
  - the recovery notices (Task 3).
- Produces: `npm run test:e2e`, used by CI in Task 8.
  - It builds the release binary with `--features e2e --no-bundle`, unless `FOLIO_E2E_SKIP_BUILD=1`.
  - It honours `FOLIO_NATIVE_DRIVER`, the path to msedgedriver or WebKitWebDriver.
  - It prints `BENCH name=value` lines.

The brief's section 12 scenarios (automated here, all 12):
1. First-time user opens the application.
2. User opens an individual Markdown document.
3. User browses an interconnected Wiki.
4. User searches for a specific topic.
5. User navigates to a matching section.
6. User opens multiple tabs.
7. User reads two documents side by side.
8. User changes reading preferences.
9. User bookmarks a document.
10. User returns to a previous reading session.
11. User identifies a broken link.
12. User understands the remote image security prompt.

- [ ] **Step 1: Install the tools and dependencies**

```bash
cd app
npm install -D @wdio/cli@9 @wdio/local-runner@9 @wdio/mocha-framework@9 @wdio/spec-reporter@9 @wdio/globals@9
cargo install tauri-driver --locked
# Windows only: downloads the msedgedriver that matches the installed WebView2 into app/e2e/.driver
cargo install msedgedriver-tool --locked
mkdir -p e2e/.driver && (cd e2e/.driver && msedgedriver-tool)
```

Add to `package.json` scripts: `"test:e2e": "wdio run e2e/wdio.conf.ts"`.

- [ ] **Step 2: Write the config and helpers**

`app/e2e/tsconfig.json`:

```json
{
  "compilerOptions": { "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "strict": true, "types": ["node", "@wdio/globals/types", "@wdio/mocha-framework"], "skipLibCheck": true },
  "include": ["./**/*.ts"]
}
```

`app/e2e/wdio.conf.ts`:

```ts
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('..', import.meta.url));
const targetDir = process.env.CARGO_TARGET_DIR ?? path.join(appDir, 'src-tauri', 'target');
const binary = path.join(targetDir, 'release', process.platform === 'win32' ? 'folio.exe' : 'folio');
const localEdgeDriver = path.join(appDir, 'e2e', '.driver', 'msedgedriver.exe');
const nativeDriver = process.env.FOLIO_NATIVE_DRIVER ?? (process.platform === 'win32' && existsSync(localEdgeDriver) ? localEdgeDriver : undefined);
let driver: ChildProcess | undefined;

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./specs/**/*.e2e.ts'],
  maxInstances: 1,
  hostname: '127.0.0.1',
  port: 4444,
  capabilities: [{ 'tauri:options': { application: binary } } as WebdriverIO.Capabilities],
  logLevel: 'warn',
  waitforTimeout: 10_000,
  waitforInterval: 20,
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { ui: 'bdd', timeout: 120_000 },
  onPrepare() {
    if (process.env.FOLIO_E2E_SKIP_BUILD) return;
    const built = spawnSync('npm', ['run', 'tauri', 'build', '--', '--no-bundle', '--features', 'e2e'], { cwd: appDir, stdio: 'inherit', shell: true });
    if (built.status !== 0) throw new Error('The e2e build failed.');
  },
  // One fresh data folder per spec file: never the tester's own library (A13).
  beforeSession() {
    process.env.FOLIO_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'folio-e2e-'));
    const args = nativeDriver ? ['--native-driver', nativeDriver] : [];
    driver = spawn(path.join(os.homedir(), '.cargo', 'bin', 'tauri-driver'), args, { stdio: [null, process.stdout, process.stderr], env: process.env });
  },
  afterSession() {
    driver?.kill();
  },
};
```

`app/e2e/helpers.ts`:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Calls one of Folio's commands from inside the page. */
export function invoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  return browser.executeAsync((c: string, a: Record<string, unknown>, done: (v: unknown) => void) => {
    (window as any).__TAURI_INTERNALS__.invoke(c, a).then(done, (e: unknown) => done({ failed: e }));
  }, cmd, args) as Promise<T>;
}

/** A folder of documents, written by the test (never by Folio). Returns its path. */
export function makeFolder(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'folio-docs-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  }
  return root;
}

export const heading1 = () => $('[role="tabpanel"] h1');

/** The innermost element whose text contains `t`. (WebdriverIO's bare `*=text` only matches links.) */
export const text = (t: string) =>
  $(`//*[contains(normalize-space(.), "${t}") and not(*[contains(normalize-space(.), "${t}")])]`);

/** A link or other element inside the reading pane, found by its text. */
export const inDoc = (selector: string) => $('[role="tabpanel"]').$(selector);

export async function openSample(): Promise<void> {
  await $('button*=Explore the sample library').click();
  await heading1().waitForDisplayed();
}

export function bench(name: string, ms: number): void {
  console.log(`BENCH ${name}=${Math.round(ms)}`);
}
```

- [ ] **Step 3: Write the scenario spec**

`app/e2e/specs/scenarios.e2e.ts`. One session runs the scenarios in order, the way one reader would. Check every selector against the components first:
- labels come from `src/lib/i18n.ts` (`en`);
- `aria-label`s come from the components (`ReaderPane.svelte`, `DocumentView.svelte`, `AppBar.svelte`, `HomeView.svelte`);
- the store holds the Home and Library views.

Change a selector only to match the real markup, and never weaken an assertion.

```ts
import { Key } from 'webdriverio';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { heading1, inDoc, invoke, makeFolder, openSample, text } from '../helpers.js';

describe('The brief’s 12 UAT scenarios (§7, brief section 12)', () => {
  it('1. a first-time user sees the welcome screen and no saved session', async () => {
    await $('h1*=Welcome to Folio').waitForDisplayed();
    await expect(text('No saved session yet.')).toBeDisplayed();
  });

  it('2. opens an individual Markdown document', async () => {
    const root = makeFolder({ 'Trip plan.md': '# Trip plan\n\nPack the [[Checklist]].\n', 'Checklist.md': '# Checklist\n\n- Passport\n' });
    await invoke('e2e_set_next_pick', { path: path.join(root, 'Trip plan.md') });
    await $('button*=Open a document').click();
    await expect(heading1()).toHaveText('Trip plan');
    await $('a=Checklist').click(); // its folder opened too (A1), so the wiki link works
    await expect(heading1()).toHaveText('Checklist');
  });

  it('3. browses an interconnected wiki', async () => {
    await $('[aria-label="Home"]').click();
    await openSample();
    await inDoc('a=Introduction').click();
    await expect(heading1()).toHaveText('Introduction to Digital Services');
  });

  it('4. searches for a specific topic', async () => {
    const box = $('[aria-label="Search documents"]');
    await box.setValue('printing');
    await browser.keys(Key.Enter);
    await expect(text('Introduction to Digital Services')).toBeDisplayed();
  });

  it('5. goes to the matching section', async () => {
    await text('Printing from a public computer').click();
    const section = inDoc('h3*=Printing from a public computer');
    await section.waitForDisplayed();
    await expect(section).toBeDisplayedInViewport();
  });

  it('6. opens multiple tabs', async () => {
    await $('[aria-label="Home"]').click();
    await openSample();
    const link = inDoc('a=Glossary');
    await browser.action('key').down(Key.Ctrl).perform(true);
    await link.click();
    await browser.action('key').up(Key.Ctrl).perform();
    await browser.waitUntil(async () => (await $$('[aria-label="Open documents"] .tab')).length >= 2);
  });

  it('7. reads two documents side by side', async () => {
    await $('[aria-label="Read side by side"]').click();
    await expect($('[aria-label="Open documents, right side"]')).toBeDisplayed();
    await $('[aria-label="Back to single page"]').click();
  });

  it('8. changes reading preferences', async () => {
    const size = () => browser.execute(() => getComputedStyle(document.querySelector('[role="tabpanel"] p')!).fontSize);
    const before = await size();
    await $('[aria-label="Appearance"]').click();
    await $('[aria-label="Smaller text"]').click();
    await browser.keys(Key.Escape);
    await browser.waitUntil(async () => (await size()) !== before);
  });

  it('9. bookmarks a section, and the bookmark is saved in the test’s own data folder', async () => {
    const mark = $('[aria-label="Bookmark this section"]');
    await mark.moveTo();
    await mark.click();
    await expect(text('Bookmarked “')).toBeDisplayed();
    await browser.pause(1500); // the library saves at most once per second
    expect(existsSync(path.join(process.env.FOLIO_DATA_DIR!, 'library.json'))).toBe(true);
  });

  it('10. returns to the previous reading session', async () => {
    await browser.reloadSession(); // a new Folio process with the same data folder
    await $('button*=Restore previous session').click();
    await browser.waitUntil(async () => (await $$('[aria-label="Open documents"] .tab')).length >= 2);
  });

  it('11. sees that a link is broken', async () => {
    await $('[aria-label="Home"]').click();
    await openSample();
    await inDoc('a=Introduction').click();
    await inDoc('a=Troubleshooting').waitForDisplayed();
    await inDoc('a=Troubleshooting').click();
    await inDoc('a=Printer Manual').click();
    await expect($('h2=This page can’t be found')).toBeDisplayed();
    await browser.keys(Key.Escape);
  });

  it('12. understands the internet picture prompt, and nothing is fetched without asking', async () => {
    await $('[aria-label="Back (Alt + Left)"]').click();
    await expect(heading1()).toHaveText('Introduction to Digital Services');
    await $('button*=Review and show picture').click();
    await expect($('h2=Show a picture from the internet?')).toBeDisplayed();
    await expect($('[role="dialog"]')).toHaveText(expect.stringContaining('images.example.org'));
    await $('[role="dialog"]').$('button=Cancel').click();
    await expect($('button*=Review and show picture')).toBeDisplayed();
  });
});
```

Scenario 11 depends on the sample wiki's link path. If Introduction has no link to Troubleshooting, open Troubleshooting from the library tree (`[aria-label="Library"]` panel, the "Troubleshooting" entry) instead. Keep the "Printer Manual" assertion either way.

- [ ] **Step 4: Write the crash and speed specs**

`app/e2e/specs/crash.e2e.ts`:

```ts
import { heading1, inDoc, openSample, text } from '../helpers.js';

const crash = () =>
  browser.execute(() => { void (window as any).__TAURI_INTERNALS__.invoke('e2e_crash_webview'); });

describe('Web view crash (§5, A12)', () => {
  it('reloads and brings the tabs back', async () => {
    await openSample();
    await inDoc('a=Introduction').click();
    await expect(heading1()).toHaveText('Introduction to Digital Services');
    await browser.pause(1500); // the session is saved at most once per second
    await crash();
    await text('Your tabs are back.').waitForDisplayed({ timeout: 20_000 });
    await expect(heading1()).toHaveText('Introduction to Digital Services');
  });

  it('a second crash within a minute reloads without reopening the tabs', async () => {
    await crash();
    await text('Your tabs weren’t reopened').waitForDisplayed({ timeout: 20_000 });
    await expect($('button*=Restore previous session')).toBeDisplayed();
  });
});
```

`app/e2e/specs/speed.e2e.ts`:

```ts
import path from 'node:path';
import { bench, invoke, makeFolder, text } from '../helpers.js';

describe('Speed targets (§7)', () => {
  it('starts in under 1.5 seconds', async () => {
    await $('h1*=Welcome to Folio').waitForDisplayed();
    const ms = await invoke<number>('e2e_uptime_ms');
    bench('startup_ms', ms);
    expect(ms).toBeLessThan(1500);
  });

  it('shows a 1,000-file folder’s tree in under 2 seconds', async () => {
    const files: Record<string, string> = {};
    for (let s = 0; s < 20; s++) for (let f = 0; f < 50; f++) files[path.join(`Section ${String(s).padStart(2, '0')}`, `Page ${f}.md`)] = `# Page ${f}\n`;
    await invoke('e2e_set_next_pick', { path: makeFolder(files) });
    const started = Date.now();
    await $('button*=Open a folder').click();
    await text('Section 19').waitForDisplayed();
    const ms = Date.now() - started;
    bench('tree_1000_ms', ms);
    expect(ms).toBeLessThan(2000);
  });
});
```

- [ ] **Step 5: Run the whole-app tests on Windows**

Run: `cd app && npm run test:e2e 2>&1 | tail -40`. Use the build env from Global Constraints.
Expected:
- 3 spec files pass, with 16 tests;
- two `BENCH` lines are printed, both under target.

If a scenario fails because the app misbehaves (not because a selector is wrong), it's a real defect. Fix the app in this task with a Vitest test that pins the fix, or write it in the report as a finding for the controller to rule on. Never delete or skip a scenario.

- [ ] **Step 6: Commit**

```bash
git add app/e2e app/package.json app/package-lock.json .gitignore
git commit -m "test(e2e): automate the 12 UAT scenarios, the crash reload and the speed targets with WebdriverIO"
```

---

### Task 6: Screens in WebKit with Playwright, and axe-core on every screen

**Files:**
- Create: `app/webtest.html`, `app/src/webtest/main.ts`, `app/src/webtest/fake-core.ts`
- Create: `app/webtest/playwright.config.ts`, `app/webtest/screens.pw.ts`, `app/webtest/tsconfig.json`
- Create: `docs/release/accessibility-findings.md` (only if Step 5 needs it)
- Modify: `app/vite.config.ts` (a `webtest` mode), `app/package.json`, `.gitignore` (`app/dist-webtest/`, `app/test-results/`, `app/playwright-report/`)
- Test: `app/src/webtest/fake-core.test.ts`

**Interfaces:**
- Consumes:
  - the `core` command names and argument shapes from `src/lib/core.ts`;
  - the sample wiki in `app/tests/fixtures/sample-wiki`.
- Produces:
  - `npm run build:webtest`, which writes `dist-webtest/`;
  - `npm run test:web`, which runs Playwright on the `webkit` and `chromium` projects;
  - `export function handle(cmd: string, args: Record<string, unknown>): unknown` in `fake-core.ts`, the simulated core.

Simulated-core limits, which the macOS manual checklist (Task 10) covers instead:
- local pictures (`folio://`) don't load;
- file pickers return "cancelled";
- there is no live reload.

- [ ] **Step 1: Write the failing tests for the simulated core**

`app/src/webtest/fake-core.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { handle } from './fake-core';

describe('simulated core for screen tests', () => {
  it('lists the sample library', () => {
    expect(handle('list_collections', {})).toEqual([{ id: 'sample', name: 'Sample library', root: '/sample-wiki', available: true }]);
  });

  it('builds the tree from the sample wiki, folders first', () => {
    const tree = handle('get_tree', { collectionId: 'sample' }) as any;
    expect(tree.truncated).toBe(false);
    expect(tree.root.children.map((c: any) => c.name)).toEqual(['Guides', 'Images', 'References', 'Technical', 'Getting-Started.md', 'README.md']);
  });

  it('reads a document', () => {
    const doc = handle('read_document', { collectionId: 'sample', path: 'Guides/Introduction.md' }) as any;
    expect(doc.text).toContain('# Introduction to Digital Services');
  });

  it('refuses a missing document the way the core does', () => {
    expect(() => handle('read_document', { collectionId: 'sample', path: 'Nope.md' })).toThrow(expect.objectContaining({ code: 'NotFound' }));
  });

  it('finds sections by text', () => {
    const res = handle('search', { query: 'printing', scope: { kind: 'all' }, filters: { headingsOnly: false, wholeWords: false, folder: '' } }) as any;
    expect(res.indexing).toBe(false);
    expect(res.results.some((r: any) => r.path === 'Guides/Introduction.md' && r.hits.length > 0)).toBe(true);
  });

  it('saves and loads the library in session storage', () => {
    handle('save_library', { library: { version: 1, prefs: { theme: 'sepia' } } });
    expect((handle('load_library', {}) as any).library.prefs.theme).toBe('sepia');
  });
});
```

The tree order must match the order `build_tree` produces (folders first, then case-insensitive by name). Check `workspace.rs` and adjust the expected array to match the real order, never the other way round.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd app && npx vitest run src/webtest`
Expected: FAIL, because `./fake-core` is missing.

- [ ] **Step 3: Implement the simulated core and the webtest build**

`app/src/webtest/fake-core.ts`:

```ts
/** A simulated core for screen tests in a plain browser (spec §7, macOS row). Never part of the app build. */
import type { SearchResult, TreeNode } from '../lib/core';
import { slugify } from '../lib/toc';

const raw = import.meta.glob('../../tests/fixtures/sample-wiki/**/*.{md,svg}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const PREFIX = '../../tests/fixtures/sample-wiki/';
const files = new Map(Object.entries(raw).map(([k, v]) => [k.slice(PREFIX.length), v]));
const STORE = 'folio-webtest-library';
export const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function tree(): TreeNode {
  const root: TreeNode = { name: 'Sample library', path: '', kind: 'folder', children: [] };
  for (const rel of [...files.keys()]) {
    let node = root;
    const parts = rel.split('/');
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join('/');
      const last = i === parts.length - 1;
      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, path, kind: last ? (part.endsWith('.md') ? 'document' : 'image') : 'folder', children: [] };
        node.children.push(child);
      }
      node = child;
    });
  }
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) => (a.kind === 'folder') !== (b.kind === 'folder') ? (a.kind === 'folder' ? -1 : 1) : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

function search(query: string): SearchResult[] {
  const q = query.toLowerCase();
  const results: SearchResult[] = [];
  for (const [path, text] of files) {
    if (!path.endsWith('.md') || !q) continue;
    const lines = text.split(/\r?\n/);
    const title = lines.find((l) => l.startsWith('# '))?.slice(2) ?? path;
    let heading = title, level = 1;
    const hits: SearchResult['hits'] = [];
    for (const line of lines) {
      const m = /^(#{1,6})\s+(.*)$/.exec(line);
      if (m) { heading = m[2]; level = m[1].length; }
      if (line.toLowerCase().includes(q)) hits.push({ slug: slugify(heading), heading, level, snippet: line.replace(/^#+\s*/, '').slice(0, 160), headingMatch: !!m });
    }
    if (hits.length) results.push({ collectionId: 'sample', path, title, titleMatch: title.toLowerCase().includes(q), total: hits.length, hits: hits.slice(0, 5) });
  }
  return results;
}

export function handle(cmd: string, args: Record<string, unknown>): unknown {
  switch (cmd) {
    case 'list_collections': return [{ id: 'sample', name: 'Sample library', root: '/sample-wiki', available: true }];
    case 'get_tree': return { root: tree(), truncated: false };
    case 'read_document': {
      const text = files.get(String(args.path));
      if (text === undefined || !String(args.path).endsWith('.md')) throw { code: 'NotFound' };
      return { text, size: text.length, modifiedMs: null, lossy: false };
    }
    case 'search': return { results: search(String(args.query)), indexing: false };
    case 'load_library': return { library: JSON.parse(sessionStorage.getItem(STORE) ?? '{"version":1}'), reset: false };
    case 'save_library': sessionStorage.setItem(STORE, JSON.stringify(args.library)); return null;
    case 'fetch_remote_image': return { mime: 'image/png', base64: PNG_1PX };
    case 'open_external': (window as any).__openedExternally = [...((window as any).__openedExternally ?? []), args.url]; return null;
    case 'pick_folder': case 'pick_file': return null;
    case 'forget_collection': case 'open_log_folder': return null;
    case 'take_recovery': {
      const r = new URLSearchParams(location.search).get('recovered');
      return r === null ? null : { restoreSession: r === 'restore' };
    }
    default: throw { code: 'Internal', details: `simulated core has no ${cmd}` };
  }
}
```

If `lib/toc.ts` exports its slug function under another name, import that one. The simulated core must use the same slugs the screens use.

`app/src/webtest/main.ts`:

```ts
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { handle } from './fake-core';

mockWindows('main');
mockIPC((cmd, args) => handle(cmd, (args ?? {}) as Record<string, unknown>), { shouldMockEvents: true });
await import('../main');
```

`app/webtest.html`: a copy of `app/index.html` whose script tag points to `/src/webtest/main.ts`. Check `index.html` for anything else it loads and keep that too.

`app/vite.config.ts`: in `defineConfig(({ mode }) => …)` (convert the export if needed), when `mode === 'webtest'` set `build: { outDir: 'dist-webtest', rollupOptions: { input: 'webtest.html' } }`. The normal build is unchanged. Verify by building normally and checking that `dist/` contains no `fake-core` code:

```bash
grep -rl simulated dist/assets
```

Expected: nothing.

`app/package.json` scripts:

```json
"build:webtest": "vite build --mode webtest",
"test:web": "playwright test -c webtest/playwright.config.ts"
```

- [ ] **Step 4: Write the Playwright config and the screen tests**

```bash
npm install -D @playwright/test@1 @axe-core/playwright@4
npx playwright install webkit chromium
```

`app/webtest/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.pw.ts',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4174/webtest.html', viewport: { width: 1280, height: 820 } },
  projects: [
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 820 } } },
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 820 } } },
  ],
  webServer: {
    command: 'npm run build:webtest && npx vite preview --mode webtest --outDir dist-webtest --port 4174 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4174/webtest.html',
    reuseExistingServer: !process.env.CI,
    cwd: '..',
  },
});
```

`app/webtest/tsconfig.json`:

```json
{ "compilerOptions": { "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "strict": true, "skipLibCheck": true }, "include": ["./**/*.ts"] }
```

`app/webtest/screens.pw.ts`. Each test opens one screen and runs axe with the WCAG 2.1 A and AA rules. Set `EXEMPT` to `[]` to start:

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Rule ids that would need the approved design changed: each is listed with its reason in docs/release/accessibility-findings.md. */
const EXEMPT: string[] = [];

async function noViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).disableRules(EXEMPT).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

async function openSample(page: Page) {
  await page.getByRole('button', { name: /Explore the sample library/ }).click();
  await expect(page.locator('[role="tabpanel"] h1')).toBeVisible();
}

test('Home', async ({ page }) => {
  await page.goto('');
  await expect(page.getByRole('heading', { level: 1, name: /Welcome to Folio/ })).toBeVisible();
  await noViolations(page);
});

test('Reading workspace', async ({ page }) => {
  await page.goto('');
  await openSample(page);
  await noViolations(page);
});

test('Search', async ({ page }) => {
  await page.goto('');
  await openSample(page);
  await page.getByLabel('Search documents').fill('printing');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Introduction to Digital Services').first()).toBeVisible();
  await noViolations(page);
});

test('Side-by-side reading', async ({ page }) => {
  await page.goto('');
  await openSample(page);
  await page.getByLabel('Read side by side').click();
  await expect(page.getByLabel('Open documents, right side')).toBeVisible();
  await noViolations(page);
});

test('Reading preferences', async ({ page }) => {
  await page.goto('');
  await page.getByLabel('Preferences').click();
  await expect(page.getByRole('heading', { name: 'Reading preferences' })).toBeVisible();
  await noViolations(page);
});

test('Library and bookmarks', async ({ page }) => {
  await page.goto('');
  await page.getByRole('button', { name: 'Library' }).first().click();
  await expect(page.getByRole('heading', { name: 'Library' }).first()).toBeVisible();
  await noViolations(page);
});

test('Privacy, security and help', async ({ page }) => {
  await page.goto('');
  await page.getByLabel(/Privacy|help/i).first().click();
  await expect(page.getByRole('heading', { name: 'Privacy, security and help' })).toBeVisible();
  await noViolations(page);
});

test('Internet picture dialog', async ({ page }) => {
  await page.goto('');
  await openSample(page);
  await page.locator('[role="tabpanel"] a', { hasText: 'Introduction' }).first().click();
  await page.getByRole('button', { name: /Review and show picture/ }).click();
  await expect(page.getByRole('heading', { name: 'Show a picture from the internet?' })).toBeVisible();
  await noViolations(page);
});

test('Broken link dialog', async ({ page }) => {
  await page.goto('');
  await openSample(page);
  await page.getByRole('treeitem', { name: /Troubleshooting/ }).first().click();
  await page.locator('[role="tabpanel"] a', { hasText: 'Printer Manual' }).click();
  await expect(page.getByRole('heading', { name: 'This page can’t be found' })).toBeVisible();
  await noViolations(page);
});

test('Recovery notice after a crash reload restores the tabs', async ({ page }) => {
  await page.goto('');
  await openSample(page);
  await page.waitForTimeout(1500); // saved at most once per second
  await page.goto('?recovered=restore');
  await expect(page.getByText('Folio had a problem and reloaded. Your tabs are back.')).toBeVisible();
  await expect(page.locator('[role="tabpanel"] h1')).toBeVisible();
});

for (const theme of ['Light', 'Sepia', 'Dark', 'High contrast']) {
  test(`Reading workspace contrast: ${theme}`, async ({ page }) => {
    await page.goto('');
    await openSample(page);
    await page.getByLabel('Appearance').click();
    await page.getByRole('radio', { name: new RegExp(theme, 'i') }).first().click();
    await page.keyboard.press('Escape');
    await noViolations(page);
  });
}
```

Fix up the theme names and the Library and Help selectors to the names the components really use:
- the theme names are in `ThemeSwatches.svelte` and `prefs.ts`. Cover every theme, including Automatic's light and dark;
- the help button's name is in `AppBar.svelte`;
- the tree role is in `TreeView.svelte`.

- [ ] **Step 5: Run, then fix or record each violation**

Run: `cd app && npm run test:web 2>&1 | tail -40`
Expected: all tests pass on both projects.

For each axe violation:
- **The fix doesn't change the approved look** (a missing name, a wrong role, a focus order, a small contrast fix inside an existing token): fix it. CSS goes through `scripts/port-styles.mjs` OVERRIDES and is then regenerated; markup goes in the component. Add a Vitest test where the component logic changed.
- **The fix would change the approved look** (for example, a theme colour the prototype chose): add its rule id to `EXEMPT` and write `docs/release/accessibility-findings.md` with the rule, the screen and theme, what is wrong and the proposed change. This becomes a product-owner decision at the end of the plan.

After the fixes, re-run `npx vitest run` and `npm run check`. Both must pass.

- [ ] **Step 6: Commit**

```bash
git add app/webtest app/webtest.html app/src/webtest app/vite.config.ts app/package.json app/package-lock.json .gitignore docs/release app/src app/scripts
git commit -m "test(web): check every screen in WebKit and Chromium with axe-core, using a simulated core"
```

---

### Task 7: Static guards: dependency review, clippy write ban, line endings

**Files:**
- Create: `app/scripts/check-deps.mjs`, `app/scripts/check-deps.test.mjs`, `app/scripts/reviewed-deps.json`
- Create: `app/src-tauri/clippy.toml`
- Create: `.gitattributes`
- Modify: `app/src-tauri/src/library.rs`, `app/src-tauri/src/log.rs` (`#![allow(clippy::disallowed_methods)]` with a reason)
- Modify: `app/package.json` (`check:deps`)

**Interfaces:**
- Produces:
  - `npm run check:deps`, which exits 1 and lists unreviewed names. `--update` rewrites the reviewed list.
  - These pure functions:
    - `cargoNames(lockText: string): string[]`;
    - `npmProdNames(lock: object): string[]`;
    - `unreviewed(names: string[], reviewed: string[]): string[]`.
  - The clippy command CI runs:

    ```bash
    cargo clippy --manifest-path app/src-tauri/Cargo.toml -- -A clippy::all -D clippy::disallowed_methods
    ```

- [ ] **Step 1: Write the failing tests**

`app/scripts/check-deps.test.mjs`:

```js
import { describe, expect, it } from 'vitest';
import { cargoNames, npmProdNames, unreviewed } from './check-deps.mjs';

describe('dependency review (§6, A14)', () => {
  it('reads crate names from Cargo.lock', () => {
    const lock = '[[package]]\nname = "ureq"\nversion = "2.12.1"\n\n[[package]]\nname = "url"\nversion = "2.5.4"\n';
    expect(cargoNames(lock)).toEqual(['ureq', 'url']);
  });

  it('reads only production npm packages', () => {
    const lock = { packages: { '': {}, 'node_modules/marked': {}, 'node_modules/vitest': { dev: true }, 'node_modules/a/node_modules/b': {} } };
    expect(npmProdNames(lock)).toEqual(['b', 'marked']);
  });

  it('reports names nobody has reviewed yet', () => {
    expect(unreviewed(['marked', 'evil-telemetry'], ['marked'])).toEqual(['evil-telemetry']);
  });

  it('the committed lists are fully reviewed', async () => {
    const { check } = await import('./check-deps.mjs');
    expect(check()).toEqual({ cargo: [], npm: [] });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd app && npx vitest run scripts/check-deps.test.mjs`
Expected: FAIL, because the module is missing.

- [ ] **Step 3: Implement**

`app/scripts/check-deps.mjs`:

```js
// Every new dependency needs a person to check it makes no network calls (spec §6, amendment A14).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const LIST = here('./reviewed-deps.json');

export const cargoNames = (text) => [...new Set([...text.matchAll(/^\[\[package\]\]\r?\nname = "([^"]+)"/gm)].map((m) => m[1]))].sort();

export const npmProdNames = (lock) =>
  [...new Set(Object.entries(lock.packages ?? {})
    .filter(([key, meta]) => key && !meta.dev)
    .map(([key]) => key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length)))].sort();

export const unreviewed = (names, reviewed) => names.filter((n) => !reviewed.includes(n));

function current() {
  return {
    cargo: cargoNames(readFileSync(here('../src-tauri/Cargo.lock'), 'utf8')),
    npm: npmProdNames(JSON.parse(readFileSync(here('../package-lock.json'), 'utf8'))),
  };
}

export function check() {
  const now = current();
  const reviewed = JSON.parse(readFileSync(LIST, 'utf8'));
  return { cargo: unreviewed(now.cargo, reviewed.cargo), npm: unreviewed(now.npm, reviewed.npm) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--update')) {
    writeFileSync(LIST, JSON.stringify(current(), null, 2) + '\n');
    console.log('Reviewed list updated. Commit it with a note on what you checked.');
  } else {
    const missing = check();
    const all = [...missing.cargo.map((n) => `crate ${n}`), ...missing.npm.map((n) => `npm ${n}`)];
    if (all.length) {
      console.error(`New dependencies need review (does any of them use the network?):\n  ${all.join('\n  ')}\nAfter checking, run: npm run check:deps -- --update`);
      process.exit(1);
    }
    console.log('Dependency review passed.');
  }
}
```

Then:
1. Add `"check:deps": "node scripts/check-deps.mjs"` to `package.json`.
2. Run `npm run check:deps -- --update` once to record today's dependencies. The production ones were reviewed in Plans 1–4. Every dev-only package added in Tasks 5–6 is excluded by `dev: true`.
3. Check by hand that the generated list has no npm production package other than these and their dependencies: `@fontsource/*`, `@tauri-apps/api`, `dompurify`, `katex`, `marked`, `mermaid`.

`app/src-tauri/clippy.toml`:

```toml
# Folio never changes files (spec §6): only library.rs and log.rs may write (A8). They opt out with #![allow(clippy::disallowed_methods)].
disallowed-methods = [
  { path = "std::fs::write", reason = "read-only app (spec §6)" },
  { path = "std::fs::File::create", reason = "read-only app (spec §6)" },
  { path = "std::fs::OpenOptions::write", reason = "read-only app (spec §6)" },
  { path = "std::fs::OpenOptions::append", reason = "read-only app (spec §6)" },
  { path = "std::fs::OpenOptions::create", reason = "read-only app (spec §6)" },
  { path = "std::fs::create_dir", reason = "read-only app (spec §6)" },
  { path = "std::fs::create_dir_all", reason = "read-only app (spec §6)" },
  { path = "std::fs::remove_file", reason = "read-only app (spec §6)" },
  { path = "std::fs::remove_dir", reason = "read-only app (spec §6)" },
  { path = "std::fs::remove_dir_all", reason = "read-only app (spec §6)" },
  { path = "std::fs::rename", reason = "read-only app (spec §6)" },
  { path = "std::fs::copy", reason = "read-only app (spec §6)" },
  { path = "std::fs::hard_link", reason = "read-only app (spec §6)" },
  { path = "std::fs::set_permissions", reason = "read-only app (spec §6)" },
]
```

Add the first line of `library.rs` and of `log.rs`:

```rust
#![allow(clippy::disallowed_methods)] // the only two files allowed to write (spec §6, amendment A8)
```

Run the clippy command from Interfaces. Any hit outside these two files is a read-only violation. Stop and report it; never allow it.

`.gitattributes` (repo root):

```
# Fixtures are checked out with CRLF on every platform, so tests see the same bytes on Windows, macOS and Linux.
app/tests/fixtures/** text eol=crlf
```

- [ ] **Step 4: Verify**

Run:

```bash
cd app && npx vitest run && npm run check:deps && npm run check:readonly
cd src-tauri && cargo clippy -- -A clippy::all -D clippy::disallowed_methods
```

Expected: all pass, and clippy reports no `disallowed_methods`.

Prove clippy catches a write. Temporarily add `pub fn _probe() { let _ = std::fs::write("x", "y"); }` to `paths.rs` and run clippy:
- Expected: `error: use of a disallowed method std::fs::write`.
- Remove the probe.

Simulate the Linux and macOS checkout:

```bash
TMP=$(mktemp -d)
git clone -q --config core.autocrlf=false "$(git rev-parse --show-toplevel)" "$TMP/lf"
grep -c $'\r' "$TMP/lf/app/tests/fixtures/sample-wiki/README.md"
```

Expected: a count above 0 (CRLF despite `autocrlf=false`). Uncommitted `.gitattributes` isn't cloned, so commit first and then run the clone.

Then run the Rust tests in the clone:

```bash
cd "$TMP/lf/app/src-tauri" && cargo test 2>&1 | grep -E "^test result|FAILED"
```

Expected: `0 failed`.

- [ ] **Step 5: Commit** (commit first, then run the LF-clone check in Step 4; if it fails, fix it and commit again)

```bash
git add .gitattributes app/scripts app/package.json app/src-tauri/clippy.toml app/src-tauri/src/library.rs app/src-tauri/src/log.rs
git commit -m "chore: review every new dependency, ban file writes with clippy, and pin fixture line endings"
```

---

### Task 8: CI on Windows, macOS and Linux, with the speed checks

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `app/scripts/check-workflows.test.mjs`
- Modify: `app/package.json` (dev dependency `yaml`)

**Interfaces:**
- Consumes: every script from Tasks 1–7 (`check:readonly`, `check:deps`, `check`, `test`, `test:web`, `test:e2e`, the clippy command, the ignored speed tests).
- Produces: `ci.yml`, which runs on every push and pull request. `check-workflows.test.mjs` pins its shape, and Task 9 extends the same file.

- [ ] **Step 1: Write the failing test**

Run `cd app && npm install -D yaml@2`. Then create `app/scripts/check-workflows.test.mjs`:

```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const load = (name) => parse(readFileSync(fileURLToPath(new URL(`../../.github/workflows/${name}`, import.meta.url)), 'utf8'));
const runs = (job) => job.steps.map((s) => s.run ?? '').join('\n');

describe('ci.yml (§7: every change, three platforms)', () => {
  const ci = load('ci.yml');
  const job = ci.jobs.test;

  it('runs on every push and pull request', () => {
    expect(Object.keys(ci.on).sort()).toEqual(['pull_request', 'push']);
  });

  it('covers Windows, macOS and Linux and lets each finish', () => {
    expect(job.strategy.matrix.os.sort()).toEqual(['macos-latest', 'ubuntu-24.04', 'windows-latest']);
    expect(job.strategy['fail-fast']).toBe(false);
  });

  it('runs every check, test suite and speed check', () => {
    const all = runs(job);
    for (const cmd of ['npm ci', 'npm run check:readonly', 'npm run check:deps', 'npm run check', 'npm test', 'cargo test', '-D clippy::disallowed_methods', '-- --ignored', 'npm run test:web', 'npm run test:e2e']) {
      expect(all).toContain(cmd);
    }
  });

  it('runs whole-app tests only where WebDriver exists (not macOS)', () => {
    const e2e = job.steps.find((s) => (s.run ?? '').includes('npm run test:e2e'));
    expect(e2e.if).toContain("runner.os != 'macOS'");
  });

  it('never builds with the e2e feature outside the whole-app test step', () => {
    const others = job.steps.filter((s) => !(s.run ?? '').includes('test:e2e') && !(s.name ?? '').includes('e2e'));
    expect(others.map((s) => s.run ?? '').join('\n')).not.toContain('--features e2e');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd app && npx vitest run scripts/check-workflows.test.mjs`
Expected: FAIL with ENOENT, because `.github/workflows/ci.yml` is missing.

- [ ] **Step 3: Write `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push:
  pull_request:

jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [windows-latest, macos-latest, ubuntu-24.04]
    runs-on: ${{ matrix.os }}
    defaults:
      run:
        working-directory: app
        shell: bash
    env:
      CI: true
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: app/package-lock.json
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: app/src-tauri
      - name: Linux system libraries
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf webkit2gtk-driver xvfb
      - run: npm ci
      - name: Read-only, network and dependency checks
        run: npm run check:readonly && npm run check:deps
      - run: npm run check
      - run: npm test
      - run: cargo test --manifest-path src-tauri/Cargo.toml
      - name: No file writes outside library.rs and log.rs
        run: cargo clippy --manifest-path src-tauri/Cargo.toml -- -A clippy::all -D clippy::disallowed_methods
      - name: Speed checks (search 5,000 documents under 200 ms, 1,000-file tree under 2 s)
        run: cargo test --release --manifest-path src-tauri/Cargo.toml speed -- --ignored --nocapture
      - name: Screens in WebKit and Chromium, with axe-core
        run: |
          npx playwright install --with-deps webkit chromium
          npm run test:web
      - name: Build (macOS, no whole-app tests there)
        if: runner.os == 'macOS'
        run: npm run tauri build -- --no-bundle
      - name: Whole-app test tools (e2e)
        if: runner.os != 'macOS'
        run: |
          cargo install tauri-driver --locked
          if [ "$RUNNER_OS" = "Windows" ]; then
            cargo install msedgedriver-tool --locked
            mkdir -p e2e/.driver && (cd e2e/.driver && msedgedriver-tool)
          fi
      - name: Whole-app tests, start-up and tree speed (e2e)
        if: runner.os != 'macOS'
        run: |
          if [ "$RUNNER_OS" = "Linux" ]; then
            FOLIO_NATIVE_DRIVER=$(command -v WebKitWebDriver) xvfb-run -a npm run test:e2e
          else
            npm run test:e2e
          fi
```

The speed filter `speed` matches `search_speed_5000_documents` and `tree_speed_1000_files`. Check that both test names contain `speed`.

- [ ] **Step 4: Verify locally**

Run: `cd app && npx vitest run scripts/check-workflows.test.mjs && npx vitest run`
Expected: pass.

Then run every `run:` line of the workflow, in order, in Git Bash from `app/`, skipping the Linux-only and macOS-only steps. The point is to prove the commands themselves work on Windows; record each result in the report.

The workflow runs on GitHub only once the product owner's repository exists (spec §9.1). Say so in the report; it is not a failure of this task.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml app/scripts/check-workflows.test.mjs app/package.json app/package-lock.json
git commit -m "ci: build and test on Windows, macOS and Linux with the speed checks"
```

---

### Task 9: Installers and signing

**Files:**
- Create: `.github/workflows/release.yml`
- Modify: `app/src-tauri/tauri.conf.json` (bundle metadata)
- Modify: `app/scripts/check-workflows.test.mjs` (release tests)

**Interfaces:**
- Consumes: the `tauri.conf.json` bundle section; the test helpers in `check-workflows.test.mjs` (Task 8).
- Produces: `release.yml`, which runs on tags `v*` and by hand.
  - It builds Windows MSI and NSIS, a macOS universal DMG, and Linux AppImage and .deb.
  - It signs when the secrets exist.
  - It writes `SHA256SUMS.txt`.
  - It creates a draft GitHub release on tags.
  - Secrets it reads:
    - Windows: `WINDOWS_CERTIFICATE` (base64 PFX) and `WINDOWS_CERTIFICATE_PASSWORD`;
    - macOS: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`.

- [ ] **Step 1: Write the failing tests** (append to `check-workflows.test.mjs`)

```js
describe('release.yml (§8: packages, signing, checksums)', () => {
  const rel = load('release.yml');
  const build = rel.jobs.build;
  const text = readFileSync(fileURLToPath(new URL('../../.github/workflows/release.yml', import.meta.url)), 'utf8');

  it('runs on version tags and by hand', () => {
    expect(rel.on.push.tags).toEqual(['v*']);
    expect(rel.on).toHaveProperty('workflow_dispatch');
  });

  it('builds the spec’s packages on each platform', () => {
    const bundles = Object.fromEntries(build.strategy.matrix.include.map((m) => [m.os, m.bundles]));
    expect(bundles['windows-latest']).toBe('msi,nsis');
    expect(bundles['macos-latest']).toBe('app,dmg');
    expect(bundles['ubuntu-22.04']).toBe('deb,appimage');
    const mac = build.strategy.matrix.include.find((m) => m.os === 'macos-latest');
    expect(mac.args).toContain('universal-apple-darwin');
  });

  it('release workflow signs only when secrets exist and never enables e2e', () => {
    expect(text).not.toMatch(/e2e/);
    const signing = build.steps.filter((s) => /sign/i.test(s.name ?? ''));
    expect(signing.length).toBeGreaterThanOrEqual(2);
    for (const s of signing) expect(s.if).toMatch(/!= ''/);
  });

  it('writes SHA-256 checksums and says whether the build was signed', () => {
    expect(runs(build)).toContain('sha256sum');
    expect(runs(build)).toContain('GITHUB_STEP_SUMMARY');
    expect(runs(rel.jobs.publish)).toContain('SHA256SUMS.txt');
  });

  it('publishes only as a draft, so a person checks it first', () => {
    expect(runs(rel.jobs.publish)).toContain('--draft');
  });
});

describe('tauri.conf.json (§1, §8)', () => {
  const conf = JSON.parse(readFileSync(fileURLToPath(new URL('../src-tauri/tauri.conf.json', import.meta.url)), 'utf8'));
  it('has no updater and no e2e', () => {
    expect(JSON.stringify(conf)).not.toMatch(/updater|e2e/i);
  });
  it('has the bundle metadata installers show', () => {
    expect(conf.bundle.publisher).toBeTruthy();
    expect(conf.bundle.category).toBe('Productivity');
    expect(conf.bundle.shortDescription).toBeTruthy();
  });
});
```

Linux release builds run on `ubuntu-22.04` so the AppImage works on older glibc as well as on the current LTS. CI tests on 24.04 (Task 8).

- [ ] **Step 2: Run them to verify they fail**

Run: `cd app && npx vitest run scripts/check-workflows.test.mjs`
Expected: FAIL, because `release.yml` is missing and the bundle metadata is absent.

- [ ] **Step 3: Implement**

`tauri.conf.json` `bundle`: keep everything that's there and add the following. Use these values as written:

```json
"publisher": "Sainath Racherla",
"category": "Productivity",
"shortDescription": "Read Markdown documents and wikis like a well-designed book.",
"longDescription": "Folio opens Markdown documents and wiki folders on your computer and shows them like a book. It never changes your files, works offline and sends nothing anywhere."
```

The publisher name and the app ID `com.sainath.markvy` are on the product owner's checklist (Task 10).

`.github/workflows/release.yml`:

```yaml
name: Release
on:
  push:
    tags: ['v*']
  workflow_dispatch:

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: windows-latest
            bundles: msi,nsis
            args: ''
          - os: macos-latest
            bundles: app,dmg
            args: --target universal-apple-darwin
          - os: ubuntu-22.04
            bundles: deb,appimage
            args: ''
    runs-on: ${{ matrix.os }}
    defaults:
      run:
        working-directory: app
        shell: bash
    env:
      WINDOWS_CERTIFICATE: ${{ secrets.WINDOWS_CERTIFICATE }}
      WINDOWS_CERTIFICATE_PASSWORD: ${{ secrets.WINDOWS_CERTIFICATE_PASSWORD }}
      SECRET_APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
      SECRET_APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
      SECRET_APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
      SECRET_APPLE_ID: ${{ secrets.APPLE_ID }}
      SECRET_APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
      SECRET_APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: app/package-lock.json
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ runner.os == 'macOS' && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}
      - name: Linux system libraries
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf
      - run: npm ci
      - name: Windows signing certificate
        if: runner.os == 'Windows' && env.WINDOWS_CERTIFICATE != ''
        shell: pwsh
        run: |
          $pfx = Join-Path $env:RUNNER_TEMP 'folio.pfx'
          [IO.File]::WriteAllBytes($pfx, [Convert]::FromBase64String($env:WINDOWS_CERTIFICATE))
          $password = ConvertTo-SecureString $env:WINDOWS_CERTIFICATE_PASSWORD -AsPlainText -Force
          $cert = Import-PfxCertificate -FilePath $pfx -CertStoreLocation Cert:\CurrentUser\My -Password $password
          Remove-Item $pfx
          @{ bundle = @{ windows = @{ certificateThumbprint = $cert.Thumbprint; digestAlgorithm = 'sha256'; timestampUrl = 'http://timestamp.digicert.com' } } } |
            ConvertTo-Json -Depth 5 | Set-Content -Path src-tauri/tauri.signing.json -Encoding utf8
          "SIGN_ARGS=--config src-tauri/tauri.signing.json" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
          "SIGNED=yes" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
      - name: macOS signing and notarization identity
        if: runner.os == 'macOS' && env.SECRET_APPLE_CERTIFICATE != ''
        run: |
          {
            echo "APPLE_CERTIFICATE=$SECRET_APPLE_CERTIFICATE"
            echo "APPLE_CERTIFICATE_PASSWORD=$SECRET_APPLE_CERTIFICATE_PASSWORD"
            echo "APPLE_SIGNING_IDENTITY=$SECRET_APPLE_SIGNING_IDENTITY"
            echo "APPLE_ID=$SECRET_APPLE_ID"
            echo "APPLE_PASSWORD=$SECRET_APPLE_PASSWORD"
            echo "APPLE_TEAM_ID=$SECRET_APPLE_TEAM_ID"
            echo "SIGNED=yes"
          } >> "$GITHUB_ENV"
      - name: Build installers
        run: npm run tauri build -- --bundles ${{ matrix.bundles }} ${{ matrix.args }} $SIGN_ARGS
      - name: Collect installers and checksums
        run: |
          mkdir -p ../out
          find src-tauri/target -path '*/release/bundle/*' -type f \( -name '*.msi' -o -name '*-setup.exe' -o -name '*.dmg' -o -name '*.deb' -o -name '*.AppImage' \) -exec cp {} ../out/ \;
          cd ../out && (sha256sum * 2>/dev/null || shasum -a 256 *) > SHA256SUMS-${{ runner.os }}.txt
          cat SHA256SUMS-${{ runner.os }}.txt
          echo "### ${{ runner.os }}: signed: ${SIGNED:-no}" >> "$GITHUB_STEP_SUMMARY"
          if [ "${SIGNED:-no}" != "yes" ]; then echo "Unsigned build: the signing secrets are not set (spec §9)." >> "$GITHUB_STEP_SUMMARY"; fi
      - uses: actions/upload-artifact@v4
        with:
          name: folio-${{ runner.os }}
          path: out/

  publish:
    needs: build
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-24.04
    permissions:
      contents: write
    steps:
      - uses: actions/download-artifact@v4
        with:
          path: out
          merge-multiple: true
      - name: Draft release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          cd out && cat SHA256SUMS-*.txt > SHA256SUMS.txt
          gh release create "$GITHUB_REF_NAME" --repo "$GITHUB_REPOSITORY" --draft --title "Folio $GITHUB_REF_NAME" --notes "Check the signing status in the workflow summary before publishing." *
```

Two details to check while writing:
- The `targets` expression for `dtolnay/rust-toolchain`. If an empty string is rejected, split it into a separate macOS-only step that runs `rustup target add aarch64-apple-darwin x86_64-apple-darwin`.
- The bundle output path. `CARGO_TARGET_DIR` isn't set in CI, so the bundles land under `app/src-tauri/target/…/release/bundle/`. The `find` above looks there, including `universal-apple-darwin/release/bundle`.

The checksum step writes per-platform `SHA256SUMS-<os>.txt` files, which `publish` joins into `SHA256SUMS.txt`.

- [ ] **Step 4: Verify**

Run:

```bash
cd app && npx vitest run
npm run tauri build -- --bundles msi,nsis
```

Expected:
- all tests pass;
- `$CARGO_TARGET_DIR/release/bundle/msi/Folio_0.1.0_x64_en-US.msi` and `$CARGO_TARGET_DIR/release/bundle/nsis/Folio_0.1.0_x64-setup.exe` exist. Report their sizes.

Install the NSIS build on this machine and start Folio from the Start menu. The sample library opens. Then uninstall it from Settings → Apps. Record each step in the report.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml app/src-tauri/tauri.conf.json app/scripts/check-workflows.test.mjs
git commit -m "build: release installers for three platforms, signed when the secrets exist, with checksums"
```

---

### Task 10: Manual checklists, UAT script and release checklist

**Files:**
- Create: `docs/release/macos-checklist.md`
- Create: `docs/release/accessibility-pass.md`
- Create: `docs/release/uat-script.md`
- Create: `docs/release/release-checklist.md`

**Interfaces:**
- Consumes:
  - the 12 scenarios (Task 5 list);
  - the A12 notices;
  - the release secrets (Task 9);
  - spec §7 and §9;
  - `docs/release/accessibility-findings.md`, if Task 6 created it.
- Produces: the documents people use before release. There is no code.

- [ ] **Step 1: Write `macos-checklist.md`** (spec §7: WebDriver isn't available for macOS web views)

Write it as a numbered checklist with a pass/fail column and a notes column. Cover:
1. Open the signed, notarized DMG. Drag Folio to Applications. It opens without a Gatekeeper warning. (An unsigned build shows a warning; write down which one you tested.)
2. All 12 scenarios from Task 5, worded for a person. Use real file pickers: open a folder and open a document.
3. Local pictures: the sample wiki's `Images/architecture.svg` shows in "Architecture".
4. Live reload: edit a document in TextEdit; Folio updates and keeps the scroll position.
5. Crash reload: open a document, then in Activity Monitor force-quit the "Folio Web Content" process (or `com.apple.WebKit.WebContent` belonging to Folio). Expected: the reload and "Your tabs are back." Do it again within a minute. Expected: the `RecoveredFresh` notice and Home.
6. Dark mode follows the system under "Automatic". Reduced motion follows System Settings › Accessibility.
7. Quit and reopen: "Restore previous session" brings the tabs back.

- [ ] **Step 2: Write `accessibility-pass.md`** (spec §7: the manual keyboard and screen-reader pass)

Cover:
- For each of the 7 screens and the 4 dialogs: keyboard only (Tab, Shift-Tab, Enter, Escape, arrows in the tree and the radio groups). Focus is always visible and never lost.
- The screen-reader steps for NVDA (Windows), VoiceOver (macOS) and Orca (Linux). Each step lists what must be announced, for example: "Bookmark this section, button"; the dialog title when a dialog opens; the notice text as a status message.
- A record table with these columns: screen, assistive technology, step, expected, heard or seen, pass/fail, notes.
- A link to `accessibility-findings.md`, if it exists, as the open decisions.

- [ ] **Step 3: Write `uat-script.md`** (brief section 12; spec §1 criterion 4)

Cover:
- Who: at least 5 people who don't use Markdown, on the desktop build, before release.
- The facilitator script: a short consent note; "think aloud"; don't help unless the participant is stuck for 2 minutes, and write down when you do.
- The 12 scenarios as tasks in plain words, with no hints about where buttons are. For example: "You've been sent a document called Trip plan. Open it and read it."
- The record sheet. For each participant and scenario: completed (yes / with help / no), time, and the brief's six categories (confusing interactions, missing functionality, navigation difficulties, visual problems, accessibility issues, user suggestions).
- Quote the brief's rule as a heading note: "Do not dismiss usability problems merely because a feature works technically."
- The findings log template: finding, how many participants, severity, proposed change, decision.

- [ ] **Step 4: Write `release-checklist.md`**

Cover:
- Before the first release, the product owner provides (spec §9):
  1. The GitHub repository, with Actions enabled. Push `main`; `ci.yml` must pass on all three platforms.
  2. The Windows code-signing certificate, as the `WINDOWS_CERTIFICATE` (base64 PFX) and `WINDOWS_CERTIFICATE_PASSWORD` secrets.
  3. The Apple Developer Program membership and the six `APPLE_*` secrets (Task 9 list).
  4. At least 5 UAT participants (`uat-script.md`).
  5. A decision on the independent security review before public release.
  6. Confirmation of the app ID `com.sainath.markvy` and the publisher name "Sainath Racherla". The app ID can't change after the first release without losing people's saved settings.
- Each release:
  1. Bump `version` in `tauri.conf.json`, `Cargo.toml` and `package.json`.
  2. Tag `vX.Y.Z` and push.
  3. Check the workflow summary: each platform says "signed: yes".
  4. Download each installer and check it against `SHA256SUMS.txt`.
  5. Run `macos-checklist.md` on a real Mac.
  6. Smoke-test the Windows and Linux installers (install, open the sample library, uninstall).
  7. Publish the draft release.
- Manual checks carried over from Plan 1, each with steps and an expected result:
  - a folder reached through a Windows junction (needs an administrator to create the junction) is refused if it points outside the collection;
  - a folder on a virtual drive (`subst X: C:\Docs`) opens and reads.
- What Folio's release notes may claim: only spec §6's enforced protections, with no "secure" or "certified" (spec §6 "Wording").

- [ ] **Step 5: Read every document once for plain language and accuracy**

Check each against spec §1, §5, §6, §7 and §9, and against the notices from Task 3. Every message quoted must be verbatim.

- [ ] **Step 6: Commit**

```bash
git add docs/release
git commit -m "docs: add the macOS checklist, the accessibility pass, the UAT script and the release checklist"
```

---

## Self-review notes (completed while writing)

- **Spec coverage.**
  - §5, "A panic in a command is caught and returned as an error": Task 1. Every command uses `guarded`; locks recover; the background threads and `folio://` contain panics too.
  - §5, "If the web view crashes, the window reloads and restores the session": Tasks 2–3 (A12), checked whole-app in Task 5 (`crash.e2e.ts`) and by hand on macOS in Task 10.
  - §6, "CI dependency review": Task 7 (A14).
  - §6.1.2, the read-only rule: strengthened by clippy in Task 7.
  - §7:
    - Rust unit tests: existing, plus Tasks 1, 2 and 4.
    - The read-only check: CI, Task 8.
    - Vitest: CI.
    - WebdriverIO on Windows and Linux: Task 5.
    - Playwright WebKit and the macOS manual checklist: Tasks 6 and 10.
    - axe-core on every screen: Task 6.
    - The keyboard and screen-reader pass: Task 10.
    - The speed targets: Rust in Task 4 (tree) and Plan 3 (search), whole-app in Task 5 (start-up, tree), run by CI in Task 8.
    - UAT: Task 10.
    - CI on three platforms for every change: Task 8.
  - §8, the packages, signing and checksums: Task 9. No updater: Task 9 test.
  - §9: Task 10's release checklist.
  - §10, risks:
    - the three web views: Tasks 5, 6 and 8, plus the macOS checklist;
    - Linux WebKitGTK versions: CI on 24.04, release on 22.04.
  - §1 criterion 3, three platforms from the first release: Tasks 8–9.
  - Not covered by code: running UAT, the security review, and pushing to GitHub. These are product-owner steps, listed in Task 10.
- **Placeholders.** None:
  - each code step has its code;
  - each test step has its assertions;
  - the steps that depend on exact third-party names (`webview2-com` 0.39) point to the local source to check, and don't change behaviour.
- **Type consistency.**
  - `Recovered { restore_session }` serializes as `{restoreSession}`, which matches TS `Recovered`.
  - `take_recovery` is registered in Task 2, called in Task 3, kept in Task 4's handler macro and simulated in Task 6.
  - `LockExt::locked` (Task 1) is used in Tasks 2 and 4.
  - `guarded` (Task 1) is used by `take_recovery` (Task 2).
  - The `e2e` command names match across Tasks 4 and 5.
  - The `MESSAGES` keys match across Global Constraints, Task 3, Task 5 (text matches) and Task 6.
- **Hygiene picked up in passing.**
  - Lock poisoning: Plan 1 final ruling.
  - clippy `disallowed-methods`: Plan 1 ledger, Task 8.
  - `.gitattributes`: Plan 1 ledger, Task 9.
  - The Windows junction and virtual-drive manual checks: Plan 1, now in Task 10.
