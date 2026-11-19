# Folio Plan 4: Website Links, Pictures from the Internet, Privacy & Help

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the prototype's remaining interactions and its last screen:
- website and email links open in the default browser or mail app, after a confirmation the reader can turn off;
- pictures from the internet stay hidden until the reader allows them, once or always for a site;
- the Privacy & Help screen, with a help dialog for each screen;
- a "page can't be found" dialog for broken links;
- a log file, "Copy details" on error messages, and "Open log folder";
- removing a folder from "Your folders".

**Architecture:**
- **Rust core.**
  - A new `net` module is the only network code in the app. It fetches one approved picture: http or https only, no cookies, 10-second timeout, 5 MB limit, image types only.
  - A new `external` module checks and opens website and email links.
  - A new `log` module appends technical details of failures to a log file in the app data folder.
  - New commands: `fetch_remote_image`, `open_external`, `open_log_folder` and `forget_collection`. Every command now logs its failures.
- **Pure logic.** TypeScript modules with unit tests:
  - new error codes and `errorDetails` (`lib/core.ts`);
  - privacy preferences (`lib/prefs.ts`);
  - allowed picture sites, clear history and reset (`lib/library.ts`);
  - closing a folder's tabs (`lib/workspace.ts`);
  - the picture placeholder and swapping in the fetched picture (`lib/markdown/enhance.ts`, `lib/remote.ts`).
- **App store and components.** The store gains the dialog state and actions. New components are four dialogs and the Privacy & Help screen.

**Tech Stack:**
- Plans 1–3: Tauri 2, Svelte 5 runes, TypeScript, Vitest with jsdom, marked, DOMPurify, KaTeX, Mermaid, pulldown-cmark and notify.
- New, Rust only:
  - `ureq` 2 with only the `tls` feature (rustls, no cookie store). It is used only in `net.rs`.
  - `base64` 0.22.
  - `url` 2.
  - `open` 5, which opens a link in the default browser.

**Spec:** `docs/superpowers/specs/2026-11-02-folio-desktop-architecture-design.md`, sections §3.1 (`net`), §3.3, §4.3–4.4, §5 and §6. The approved prototype `index.html` is the visual and wording reference. Its `extDialog`, `remoteDialog`, `brokenDialog`, `helpDialog`, `HELP`, the remote-picture placeholder in `renderDoc`, the `#view-help` markup and the `clear-history` / `reset-all` actions are the behaviour this plan ports.

## Spec amendments this plan proposes (needs the product owner's approval before execution)

| # | Spec says | This plan does | Why |
|---|---|---|---|
| A8 | §6.1.2: no write calls outside `library.rs` | `log.rs` may also write, but only `logs/folio.log` in the app data folder (renamed to `folio.log.1` at 1 MB). The read-only check allows exactly these two files. | §5 requires a log file, which §6.1.2 didn't allow for. Documents are still never written. |
| A9 | (prototype) "Reset workspace" makes Folio look as it did the first time | Reset clears favorites, bookmarks, history, reading progress, the saved session, allowed picture sites and all settings. It keeps "Your folders". | Each folder has its own "Remove from your folders" button. Silently forgetting every folder would be a surprise. |
| A10 | (prototype) the Help screen's "prototype compared with the desktop app" table | It is replaced by "What Folio enforces", a plain list of §6's enforced protections, plus the stated limitation. | §6 "Wording": Privacy & Help lists only what is enforced, and states the limitation plainly. |

## Out of scope (later plans)

- **Plan 5:**
  - whole-app automation (WebdriverIO, Playwright) and axe-core checks;
  - CI on three platforms with the speed benchmarks;
  - installers and code signing;
  - reloading the window after a web view crash (§5);
  - catching panics in commands (§5).
- The deferred small issues from Plan 3 (`docs/superpowers/plans/2026-11-03-folio-plan-3-ledger.md`) stay deferred unless a task here touches the same lines.

## Global Constraints

Every task's requirements include this section.

- **Earlier constraints still hold.**
  - Every document read goes through `paths::resolve`.
  - The CSP string is unchanged.
  - Errors are `{code, details?}`.
  - Messages are plain language, taken verbatim from spec §5 or `MESSAGES`.
  - Untrusted text is never rendered with `{@html}`.
  - Rust builds use `CARGO_TARGET_DIR="$LOCALAPPDATA/folio-target"`.
  - CSS changes only through `scripts/port-styles.mjs`.
- **Network, spec §3.1 and §6:**
  - `net.rs` is the only Rust file that may use networking (`ureq`, `TcpStream`, `UdpSocket`, `reqwest`, `hyper`). `npm run check:readonly` fails the build otherwise.
  - Only `fetch_remote_image` uses `net.rs`.
  - Remote pictures: `http` or `https` only, no cookies, 10-second timeout, 5 MB limit, `image/*` content types only.
- **Website links, spec §6:** `open_external` accepts only `http`, `https` and `mailto`. Anything else gets `LinkRefused`.
- **Writes, amendment A8:** only `library.rs` (`library.json`) and `log.rs` (`logs/folio.log` and `logs/folio.log.1`) may write. `npm run check:readonly` enforces it.
- **New error codes and messages,** verbatim from spec §5:
  - `ImageFailed`: "The picture couldn’t be loaded."
  - `ImageRejected`: "That link isn’t a picture, or it’s larger than 5 MB."
  - `LinkRefused`: "Folio only opens web and email links."
- **Preferences:**
  - `extLinks` is `'ask'` or `'direct'`, default `'ask'`.
  - `remoteImages` is `'ask'` or `'block'`, default `'ask'`.
  - "Restore default settings" on the Preferences screen leaves these two alone.
- **Library key** `allowedImageSites`: lower-case host names, unique. They can be removed in Privacy & Help (spec §4.3).
- **Wording, spec §6:**
  - Privacy & Help lists only what is enforced.
  - It never uses the words "secure" or "certified".
  - It states the remote-picture limitation plainly.
- **Logs:** they hold technical details only (command, error code, details), never document text.
- **Icon-only buttons** carry `aria-label` and `title`.
- **Dialogs** use `Dialog.svelte`: modal, Esc closes, and focus returns to whatever opened it.

## Review Focus

These are the five inputs most likely to bite real users that the spec doesn't spell out. Each line names the test that pins it.

1. **A picture link that misbehaves.** The server never answers, redirects to a web page, or sends 6 MB with no length header. Folio must give up within about 10 seconds with `ImageFailed` or `ImageRejected`, keep the placeholder, and never hang. Tests: Task 1 `a_slow_server_times_out`, `refuses_a_page_that_is_not_a_picture` and `refuses_more_than_5_mb_without_a_length`.
2. **Links with unusual schemes or characters.** Examples: `javascript:`, `file:`, `HTTPS://Example.org`, `mailto:`, and `https://example.org/a b"c`. Only http(s) and mailto may open, in a normalised form; everything else is refused with a plain message. Tests: Task 2 `only_web_and_email_links_open` and `addresses_are_normalised_before_opening`.
3. **The log can't be written** (disk full, or a read-only app data folder). The command's result must be unchanged, and nothing may crash. Test: Task 2 `a_log_that_cannot_be_written_never_changes_the_result`.
4. **Removing the folder whose document is open,** or the folder shown in the sidebar. Its tabs close, the sidebar moves to another folder, favorites stay (hidden), and nothing crashes. Tests: Task 3 `closeCollection removes that folder's tabs from both panes`, and Task 6 `forgetting a folder closes its tabs and picks another folder`.
5. **Reset while documents are open and a session is saved.** It must return to Home with default settings, the saved session gone and the folders list kept. Test: Task 6 `reset returns to Home with defaults and keeps the folders`.

---

### Task 1: Rust core: error codes and the `net` module (`fetch_remote_image`)

**Files:**
- Create: `app/src-tauri/src/net.rs`
- Modify: `app/src-tauri/Cargo.toml`, `app/src-tauri/src/errors.rs`, `app/src-tauri/src/commands.rs` and `app/src-tauri/src/lib.rs`
- Modify: `app/scripts/check-readonly.mjs` and `app/scripts/check-readonly.test.mjs`

**Interfaces:**
- Produces:
  - `AppError::{ImageFailed, ImageRejected, LinkRefused}`.
  - `net::{MAX_BYTES, TIMEOUT, RemoteImage { mime, base64 }, check_url, fetch_image, fetch_image_with}`.
  - The command `fetch_remote_image(url) -> RemoteImage`.
  - From the check script: `findNetwork(fileName, source)` and `NETWORK_FILES`.

- [ ] **Step 1: Add the dependencies.** In `Cargo.toml` under `[dependencies]`, add:
```toml
ureq = { version = "2", default-features = false, features = ["tls"] }
base64 = "0.22"
url = "2"
```
In `lib.rs`, add `pub mod net;`.

- [ ] **Step 2: Write the failing tests.** In `errors.rs`, append inside `mod tests`:
```rust
    #[test]
    fn picture_and_link_codes_serialize_as_codes() {
        for (e, code) in [(AppError::ImageFailed, "ImageFailed"), (AppError::ImageRejected, "ImageRejected"), (AppError::LinkRefused, "LinkRefused")] {
            assert_eq!(serde_json::to_value(e).unwrap(), json!({ "code": code }));
        }
    }
```
Create `app/src-tauri/src/net.rs` containing only this test module. Step 4 adds the code above it.
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine};
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::{Arc, Mutex},
        thread,
        time::Instant,
    };

    /// A tiny local server: answers each connection with the next canned response and records each request.
    fn serve(responses: Vec<Vec<u8>>) -> (String, Arc<Mutex<Vec<String>>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}/", listener.local_addr().unwrap());
        let seen = Arc::new(Mutex::new(Vec::new()));
        let log = Arc::clone(&seen);
        thread::spawn(move || {
            for body in responses {
                let Ok((mut stream, _)) = listener.accept() else { return };
                let mut buf = [0u8; 8192];
                let n = stream.read(&mut buf).unwrap_or(0);
                log.lock().unwrap().push(String::from_utf8_lossy(&buf[..n]).to_lowercase());
                let _ = stream.write_all(&body);
            }
        });
        (base, seen)
    }

    fn http(status: &str, headers: &str, body: &[u8]) -> Vec<u8> {
        let mut out = format!("HTTP/1.1 {status}\r\n{headers}Content-Length: {}\r\nConnection: close\r\n\r\n", body.len()).into_bytes();
        out.extend_from_slice(body);
        out
    }

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\nfake";

    #[test]
    fn fetches_a_picture_and_encodes_it() {
        let (base, _) = serve(vec![http("200 OK", "Content-Type: image/png\r\n", PNG)]);
        let img = fetch_image(&format!("{base}a.png")).unwrap();
        assert_eq!(img.mime, "image/png");
        assert_eq!(STANDARD.decode(img.base64).unwrap(), PNG);
    }

    #[test]
    fn refuses_a_page_that_is_not_a_picture() {
        let (base, _) = serve(vec![http("200 OK", "Content-Type: text/html\r\n", b"<html></html>")]);
        assert_eq!(fetch_image(&base).unwrap_err(), AppError::ImageRejected);
    }

    #[test]
    fn refuses_more_than_5_mb_by_its_length() {
        let head = format!("HTTP/1.1 200 OK\r\nContent-Type: image/jpeg\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", MAX_BYTES + 1);
        let (base, _) = serve(vec![head.into_bytes()]);
        assert_eq!(fetch_image(&base).unwrap_err(), AppError::ImageRejected);
    }

    #[test]
    fn refuses_more_than_5_mb_without_a_length() {
        let mut body = b"HTTP/1.1 200 OK\r\nContent-Type: image/jpeg\r\nConnection: close\r\n\r\n".to_vec();
        body.extend(std::iter::repeat(0u8).take(MAX_BYTES as usize + 1));
        let (base, _) = serve(vec![body]);
        assert_eq!(fetch_image(&base).unwrap_err(), AppError::ImageRejected);
    }

    #[test]
    fn a_server_error_is_a_failed_picture() {
        let (base, _) = serve(vec![http("404 Not Found", "Content-Type: text/plain\r\n", b"gone")]);
        assert_eq!(fetch_image(&base).unwrap_err(), AppError::ImageFailed);
    }

    #[test]
    fn a_slow_server_times_out() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/a.png", listener.local_addr().unwrap());
        let started = Instant::now();
        assert_eq!(fetch_image_with(&url, Duration::from_millis(300)).unwrap_err(), AppError::ImageFailed);
        assert!(started.elapsed() < Duration::from_secs(5));
        drop(listener);
    }

    #[test]
    fn only_web_addresses_are_fetched() {
        for url in ["file:///C:/Windows/win.ini", "ftp://example.org/a.png", "data:image/png;base64,AA==", "javascript:alert(1)", "a.png", ""] {
            assert_eq!(fetch_image(url).unwrap_err(), AppError::ImageRejected, "{url}");
        }
    }

    #[test]
    fn sends_no_cookies() {
        let (base, seen) = serve(vec![
            http("302 Found", "Set-Cookie: track=1\r\nLocation: /b.png\r\n", b""),
            http("200 OK", "Content-Type: image/png\r\n", PNG),
        ]);
        fetch_image(&format!("{base}a.png")).unwrap();
        let requests = seen.lock().unwrap();
        assert_eq!(requests.len(), 2);
        assert!(requests.iter().all(|r| !r.contains("\r\ncookie:")), "{requests:?}");
    }
}
```

- [ ] **Step 3: Run the tests and confirm they fail.**

  Run in `app/src-tauri/` (with the `PATH` and `CARGO_TARGET_DIR` exports): `cargo test net:: errors::`.

  Expected: FAIL to compile.

- [ ] **Step 4: Implement.**

  In `errors.rs`, add after `NotText,`:
```rust
    /// A picture from the internet couldn't be fetched (network failure, timeout, server error).
    ImageFailed,
    /// A picture link that isn't http(s), isn't a picture, or is over 5 MB.
    ImageRejected,
    /// A link Folio won't open: only http, https and mailto leave the app.
    LinkRefused,
```
  Put this above the test module in `net.rs`:
```rust
//! The only network code in Folio (spec §3.1, §6): fetching one picture the reader approved.
use crate::errors::AppError;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::{io::Read, time::Duration};

pub const MAX_BYTES: u64 = 5 * 1024 * 1024;
pub const TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, PartialEq, Serialize)]
pub struct RemoteImage {
    pub mime: String,
    pub base64: String,
}

/// http and https only; anything else isn't a picture link.
pub fn check_url(url: &str) -> Result<url::Url, AppError> {
    let parsed = url::Url::parse(url.trim()).map_err(|_| AppError::ImageRejected)?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed),
        _ => Err(AppError::ImageRejected),
    }
}

pub fn fetch_image(url: &str) -> Result<RemoteImage, AppError> {
    fetch_image_with(url, TIMEOUT)
}

/// One anonymous GET: ureq is built without its cookie store, and no credentials are ever added.
pub fn fetch_image_with(url: &str, timeout: Duration) -> Result<RemoteImage, AppError> {
    let url = check_url(url)?;
    let agent = ureq::AgentBuilder::new().timeout(timeout).redirects(5).build();
    let response = agent.get(url.as_str()).call().map_err(|_| AppError::ImageFailed)?;
    let mime = response.content_type().to_ascii_lowercase();
    if !mime.starts_with("image/") {
        return Err(AppError::ImageRejected);
    }
    let declared = response.header("Content-Length").and_then(|v| v.trim().parse::<u64>().ok());
    if declared.is_some_and(|n| n > MAX_BYTES) {
        return Err(AppError::ImageRejected);
    }
    let mut bytes = Vec::new();
    response.into_reader().take(MAX_BYTES + 1).read_to_end(&mut bytes).map_err(|_| AppError::ImageFailed)?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(AppError::ImageRejected);
    }
    Ok(RemoteImage { mime, base64: STANDARD.encode(bytes) })
}
```
  In `commands.rs`, add the command and register `commands::fetch_remote_image` in `lib.rs`:
```rust
/// The one network call (spec §4.3): a picture the reader approved. Async: it can take up to 10 seconds.
#[tauri::command(async)]
pub fn fetch_remote_image(url: String) -> Result<net::RemoteImage, AppError> {
    net::fetch_image(&url)
}
```
  Add `net` to the `use crate::{…}` list in `commands.rs`.

- [ ] **Step 5: Keep network code in `net.rs`.** In `app/scripts/check-readonly.mjs`:
  - Add the exported constants:
    ```js
    export const NETWORK_PATTERNS = [/\bureq\b/, /\breqwest\b/, /\bhyper\b/, /\bTcpStream\b/, /\bUdpSocket\b/];
    export const NETWORK_FILES = new Set(['net.rs', 'src/net.rs']);
    ```
  - Refactor `findWrites` into a shared `scan(fileName, source, patterns)`, which holds the current body minus the allow-list check. Then:
    ```js
    export function findWrites(fileName, source) {
      return ALLOWED_FILES.has(fileName) ? [] : scan(fileName, source, WRITE_PATTERNS);
    }
    export function findNetwork(fileName, source) {
      return NETWORK_FILES.has(fileName) ? [] : scan(fileName, source, NETWORK_PATTERNS);
    }
    ```
  - In the CLI block, also collect `findNetwork` hits. Exit 1 with `'Network code found outside net.rs. Only net.rs may use the network:\n' + hits.join('\n')`.
  - The final success line stays `Read-only check passed.`

  In `check-readonly.test.mjs`, import `findNetwork` and append:
```js
  it('flags network code outside net.rs, and allows it in net.rs', () => {
    expect(findNetwork('commands.rs', 'let r = ureq::get(url).call();')).toEqual(['commands.rs:1: let r = ureq::get(url).call();']);
    expect(findNetwork('src/net.rs', 'let a = ureq::AgentBuilder::new();')).toEqual([]);
    expect(findNetwork('reader.rs', '#[cfg(test)]\nmod t { use std::net::TcpStream; }')).toEqual([]);
  });
```

- [ ] **Step 6: Run the tests and confirm they pass.**
  - Run `cargo test net:: errors::`. Expected: all pass, and the slow-server test finishes in under 5 seconds.
  - In `app/`, run `npx vitest run scripts/check-readonly.test.mjs` and `npm run check:readonly`. Expected: pass.
  - Run `cargo build`. Expected: no warnings.
- [ ] **Step 7: Commit.** `feat(core): fetch approved pictures from the internet, and keep network code in net.rs`

---

### Task 2: Rust core: opening links, the log file and removing a folder

**Files:**
- Create: `app/src-tauri/src/external.rs` and `app/src-tauri/src/log.rs`
- Modify: `app/src-tauri/Cargo.toml`, `app/src-tauri/src/commands.rs`, `app/src-tauri/src/state.rs`, `app/src-tauri/src/lib.rs` and `app/src-tauri/src/indexer.rs` (test hygiene only)
- Modify: `app/scripts/check-readonly.mjs` and `app/scripts/check-readonly.test.mjs`

**Interfaces:**
- Consumes: Task 1's error codes.
- Produces:
  - `external::{check, open}`.
  - `log::{MAX_BYTES, dir, append, ensure_dir}`.
  - `commands::logged`.
  - `AppState::remove_collection(id) -> bool`.
  - The commands `open_external(url)`, `open_log_folder()` and `forget_collection(collectionId)`. Every existing command logs its failures.

- [ ] **Step 1: Add the dependency and the modules.** In `Cargo.toml`, add:
```toml
open = { version = "5", features = ["shellexecute-on-windows"] }
```
On Windows this opens links through the system's ShellExecute call, never through `cmd`. If the resolved `open` 5.x has no such feature, check its README for the equivalent; if there is none, stop and report BLOCKED. In `lib.rs`, add `pub mod external;` and `pub mod log;`.

- [ ] **Step 2: Write the failing tests.** Create `external.rs` with this test module:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_web_and_email_links_open() {
        for ok in ["https://example.org/a", "http://example.org", "HTTPS://Example.org/Path", "mailto:help@example.org"] {
            assert!(check(ok).is_ok(), "{ok}");
        }
        for bad in ["javascript:alert(1)", "file:///C:/Windows/notepad.exe", "ftp://example.org", "data:text/html,hi", "vbscript:x", "C:\\Windows\\x.exe", "notes.md", ""] {
            assert_eq!(check(bad).unwrap_err(), AppError::LinkRefused, "{bad}");
        }
    }

    #[test]
    fn addresses_are_normalised_before_opening() {
        let url = check("https://example.org/a b\"c").unwrap();
        assert_eq!(url.as_str(), "https://example.org/a%20b%22c");
    }
}
```
Create `log.rs` with this test module:
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn appends_one_line_per_entry_in_the_logs_folder() {
        let d = tempfile::tempdir().unwrap();
        append(d.path(), "read_document: {\"code\":\"NotFound\"}").unwrap();
        append(d.path(), "two\nlines").unwrap();
        let text = fs::read_to_string(dir(d.path()).join("folio.log")).unwrap();
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].ends_with("read_document: {\"code\":\"NotFound\"}"));
        assert!(lines[1].ends_with("two lines"));
    }

    #[test]
    fn starts_a_new_file_at_the_size_limit() {
        let d = tempfile::tempdir().unwrap();
        let logs = ensure_dir(d.path()).unwrap();
        fs::write(logs.join("folio.log"), vec![b'x'; MAX_BYTES as usize]).unwrap();
        append(d.path(), "after").unwrap();
        assert_eq!(fs::metadata(logs.join("folio.log.1")).unwrap().len(), MAX_BYTES);
        assert!(fs::read_to_string(logs.join("folio.log")).unwrap().ends_with("after\n"));
    }
}
```
Append to `state.rs`'s test module:
```rust
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
```
Append a test module to `commands.rs`, or extend it if one exists:
```rust
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
        let text = std::fs::read_to_string(crate::log::dir(d.path()).join("folio.log")).unwrap();
        assert_eq!(text.lines().count(), 1);
        assert!(text.contains("read_document: {\"code\":\"NotFound\"}"));
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
```
Run `cargo test external:: log:: state:: commands::`. Expected: FAIL to compile.

- [ ] **Step 3: Implement.** Put this above the test module in `external.rs`:
```rust
//! Website and email links (spec §4.4, §6): only http, https and mailto leave Folio, to the default app.
use crate::errors::AppError;

pub fn check(url: &str) -> Result<url::Url, AppError> {
    let parsed = url::Url::parse(url.trim()).map_err(|_| AppError::LinkRefused)?;
    match parsed.scheme() {
        "http" | "https" | "mailto" => Ok(parsed),
        _ => Err(AppError::LinkRefused),
    }
}

/// Opens the normalised address, in which spaces and quotes are percent-encoded, so it is always one argument.
pub fn open(url: &str) -> Result<(), AppError> {
    let checked = check(url)?;
    ::open::that_detached(checked.as_str()).map_err(|e| AppError::Internal(e.to_string()))
}
```
  Put this above the test module in `log.rs`:
```rust
//! Technical details of failures (spec §5), kept in Folio's own data folder for support and "Copy details".
//! Besides library.json this is the only file Folio writes (amendment A8). It never holds document text.
use std::{
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const FILE: &str = "folio.log";
const OLD: &str = "folio.log.1";
pub const MAX_BYTES: u64 = 1024 * 1024;

pub fn dir(data_dir: &Path) -> PathBuf {
    data_dir.join("logs")
}

pub fn ensure_dir(data_dir: &Path) -> io::Result<PathBuf> {
    let logs = dir(data_dir);
    fs::create_dir_all(&logs)?;
    Ok(logs)
}

/// One line per entry: milliseconds since 1970, then the entry with any line breaks flattened.
pub fn append(data_dir: &Path, entry: &str) -> io::Result<()> {
    let logs = ensure_dir(data_dir)?;
    let path = logs.join(FILE);
    if fs::metadata(&path).is_ok_and(|m| m.len() >= MAX_BYTES) {
        fs::rename(&path, logs.join(OLD))?;
    }
    let ms = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let mut file = OpenOptions::new().create(true).append(true).open(&path)?;
    writeln!(file, "{ms} {}", entry.replace(['\r', '\n'], " "))
}
```
  In `state.rs`, add:
```rust
    /// Forgets a folder from the list; the sample library always stays. Returns true if it was listed.
    pub fn remove_collection(&self, id: &str) -> bool {
        if id == crate::workspace::SAMPLE_ID {
            return false;
        }
        let mut cols = self.collections.lock().unwrap();
        let before = cols.len();
        cols.retain(|c| c.id != id);
        cols.len() != before
    }
```
  In `commands.rs`:
  - Add `external` and `log` to the `use crate::{…}` list.
  - Add this helper:
```rust
/// Every failure goes to the log with its details (spec §5); the screens get the code, and details only for Internal.
pub fn logged<T>(state: &AppState, command: &str, result: Result<T, AppError>) -> Result<T, AppError> {
    if let Err(e) = &result {
        let entry = format!("{command}: {}", serde_json::to_string(e).unwrap_or_default());
        if let Err(io) = log::append(&state.data_dir, &entry) {
            eprintln!("Folio: log not written: {io}");
        }
    }
    result
}
```
  - Wrap the body of every command in `logged`. A sync command becomes `logged(&state, "read_document", (|| { …existing body… })())`. An `async fn` command becomes `let result = async { …existing body… }.await; logged(&state, "pick_folder", result)`. Give `fetch_remote_image` a `state: State<'_, AppState>` parameter so it can log too.
  - Add the commands and register all three in `lib.rs`:
```rust
#[tauri::command(async)]
pub fn open_external(state: State<'_, AppState>, url: String) -> Result<(), AppError> {
    logged(&state, "open_external", external::open(&url))
}

#[tauri::command(async)]
pub fn open_log_folder(state: State<'_, AppState>) -> Result<(), AppError> {
    let result = log::ensure_dir(&state.data_dir)
        .map_err(AppError::from_io)
        .and_then(|logs| ::open::that_detached(logs).map_err(|e| AppError::Internal(e.to_string())));
    logged(&state, "open_log_folder", result)
}

/// Removes a folder from "Your folders". The folder and its documents are untouched.
#[tauri::command(async)]
pub fn forget_collection(state: State<'_, AppState>, collection_id: String) -> Result<(), AppError> {
    let result = (|| {
        if collection_id == workspace::SAMPLE_ID {
            return Err(AppError::Internal("the sample library can't be removed".into()));
        }
        state.remove_collection(&collection_id);
        state.indexer.forget(&collection_id);
        state.persist_collections()
    })();
    logged(&state, "forget_collection", result)
}
```
  In `check-readonly.mjs`:
  - Set `ALLOWED_FILES` to `new Set(['library.rs', 'src/library.rs', 'log.rs', 'src/log.rs'])`.
  - Change the failure message to `'Write calls found outside library.rs and log.rs. Folio must stay read-only:\n'`.
  - In `check-readonly.test.mjs`, rename the test `allows the library store` to `allows the library store and the log`, and add `expect(findWrites('src/log.rs', 'OpenOptions::new().append(true)')).toEqual([]);`.

- [ ] **Step 4: Tidy a test literal.** `indexer.rs` has a test that writes raw NUL bytes into a byte-string literal, so text tools treat the whole file as binary. Replace the raw bytes with `\0` escapes. The bytes must stay the same, so the test is unchanged.
- [ ] **Step 5: Run the tests and confirm they pass.**
  - Run `cargo test`. Expected: all pass.
  - Run `cargo build`. Expected: no warnings.
  - In `app/`, run `npx vitest run scripts/check-readonly.test.mjs` and `npm run check:readonly`. Expected: pass.
- [ ] **Step 6: Commit.** `feat(core): open web and email links, log failures, and remove a folder from the list`

---

### Task 3: Bridge, preferences, library data and workspace (`lib/core.ts`, `prefs.ts`, `library.ts`, `workspace.ts`)

**Files:**
- Modify: `app/src/lib/core.ts`, `core.test.ts`, `prefs.ts`, `prefs.test.ts`, `library.ts`, `library.test.ts`, `workspace.ts` and `workspace.test.ts`
- Modify: `app/vite.config.ts`
- Create: `app/src/app-version.d.ts`

**Interfaces:**
- Consumes: Tasks 1–2's commands and codes.
- Produces:
  - In `core.ts`:
    - `ErrorCode`, extended with `ImageFailed | ImageRejected | LinkRefused`, and `MESSAGES`, extended with the same three.
    - `isAppError(e)` and `errorDetails(e, at?)`.
    - `RemoteImage`, and `core.fetchRemoteImage(url)`, `core.openExternal(url)`, `core.openLogFolder()` and `core.forgetCollection(collectionId)`.
  - In `prefs.ts`: `Prefs.extLinks: 'ask' | 'direct'` and `Prefs.remoteImages: 'ask' | 'block'`.
  - In `library.ts`: `LibraryData.allowedImageSites: string[]`, and `allowSite(lib, host)`, `forbidSite(lib, host)`, `clearHistory(lib)` and `resetLibrary(lib)`.
  - In `workspace.ts`: `closeCollection(ws, collectionId)`.

- [ ] **Step 1: Make the app version available.** In `vite.config.ts`, add `import { version } from './package.json';` and add `define: { __APP_VERSION__: JSON.stringify(version) },` to the config object. Vitest reads the same config. Create `app/src/app-version.d.ts` containing `declare const __APP_VERSION__: string;`.

- [ ] **Step 2: Write the failing tests.**

  **`core.test.ts`.**
  - Add `errorDetails` and `isAppError` to the import.
  - Extend the existing `describeError` test with:
    ```ts
    expect(describeError({ code: 'LinkRefused' })).toBe(MESSAGES.LinkRefused);
    expect(MESSAGES.ImageRejected).toBe('That link isn’t a picture, or it’s larger than 5 MB.');
    ```
  - Append:
```ts
describe('error details', () => {
  it('recognises core errors', () => {
    expect(isAppError({ code: 'NotFound' })).toBe(true);
    expect(isAppError({ code: 'Nope' })).toBe(false);
    expect(isAppError(new Error('x'))).toBe(false);
  });

  it('puts the version, time and code (with details) on one line for the clipboard', () => {
    const at = new Date('2026-11-03T10:00:00.000Z');
    expect(errorDetails({ code: 'Internal', details: 'disk unreadable' }, at)).toBe(`Folio ${__APP_VERSION__} · 2026-11-03T10:00:00.000Z · Internal: disk unreadable`);
    expect(errorDetails({ code: 'NotFound' }, at)).toMatch(/· NotFound$/);
  });
});

describe('core commands added in Plan 4', () => {
  it('sends the argument names the core expects', async () => {
    await core.fetchRemoteImage('https://example.org/a.png');
    expect(invoke).toHaveBeenCalledWith('fetch_remote_image', { url: 'https://example.org/a.png' });
    await core.openExternal('https://example.org');
    expect(invoke).toHaveBeenCalledWith('open_external', { url: 'https://example.org' });
    await core.forgetCollection('c1');
    expect(invoke).toHaveBeenCalledWith('forget_collection', { collectionId: 'c1' });
    await core.openLogFolder();
    expect(invoke).toHaveBeenCalledWith('open_log_folder');
  });
});
```
  **`prefs.test.ts`.** Append inside the main `describe`:
```ts
  it('keeps the privacy choices, defaulting to ask', () => {
    expect([DEFAULT_PREFS.extLinks, DEFAULT_PREFS.remoteImages]).toEqual(['ask', 'ask']);
    expect(normalizePrefs({ extLinks: 'direct', remoteImages: 'block' })).toMatchObject({ extLinks: 'direct', remoteImages: 'block' });
    expect(normalizePrefs({ extLinks: 'always', remoteImages: 'yes' })).toMatchObject({ extLinks: 'ask', remoteImages: 'ask' });
  });
```
  **`library.test.ts`.**
  - Import `allowSite`, `forbidSite`, `clearHistory` and `resetLibrary`.
  - The test `keeps unknown keys and leaves collections to the core` uses `allowedImageSites` as its unknown key, which is now owned. Change that key to `annotations: [{ id: 'a1' }]` and its expectation to `expect(raw.annotations).toEqual([{ id: 'a1' }]);`.
  - Append:
```ts
  it('reads allowed picture sites as unique lower-case hosts', () => {
    const lib = parseLibrary({ allowedImageSites: ['Images.Example.org', 'images.example.org', 7, ''] });
    expect(lib.allowedImageSites).toEqual(['images.example.org']);
    expect(lib.extra).not.toHaveProperty('allowedImageSites');
  });

  it('allows and forbids a picture site', () => {
    const lib = parseLibrary({});
    allowSite(lib, 'Images.Example.org');
    allowSite(lib, 'images.example.org');
    expect(lib.allowedImageSites).toEqual(['images.example.org']);
    forbidSite(lib, 'IMAGES.example.org');
    expect(lib.allowedImageSites).toEqual([]);
  });

  it('clears history but keeps favorites, bookmarks and settings', () => {
    const lib = parseLibrary({ favorites: ['s/a.md'], recent: [{ key: 's/a.md', at: 1 }], searches: [{ q: 'x', at: 1 }], progress: { 's/a.md': 50 }, prefs: { fontSize: 20 } });
    toggleBookmark(lib, 's/a.md', '', 'a');
    clearHistory(lib);
    expect([lib.recent, lib.searches, lib.progress]).toEqual([[], [], {}]);
    expect(lib.favorites).toEqual(['s/a.md']);
    expect(lib.bookmarks).toHaveLength(1);
    expect(lib.prefs.fontSize).toBe(20);
  });

  it('reset empties everything Folio remembers but keeps keys it does not own', () => {
    const lib = parseLibrary({ favorites: ['s/a.md'], favoriteCollections: ['s'], allowedImageSites: ['x.org'], prefs: { fontSize: 20 }, annotations: [1],
      session: { split: false, ratio: 0.5, activeCollection: 's', at: 1, panes: [] } });
    resetLibrary(lib);
    expect(lib).toMatchObject({ favorites: [], favoriteCollections: [], bookmarks: [], recent: [], searches: [], progress: {}, allowedImageSites: [], session: null, prefs: DEFAULT_PREFS });
    expect(lib.extra).toEqual({ annotations: [1] });
  });
```
  **`workspace.test.ts`.** Import `closeCollection` and append:
```ts
  it('closeCollection removes that folder\'s tabs from both panes', () => {
    const ws = emptyWorkspace();
    openDoc(ws, 'a/1.md');
    openDoc(ws, 'b/1.md');
    setSplit(ws, true, 'a/2.md');
    closeCollection(ws, 'a');
    expect(ws.panes[0].tabs.map((t) => current(t).key)).toEqual(['b/1.md']);
    expect(ws.panes[0].activeId).toBe(ws.panes[0].tabs[0].id);
    expect(ws.panes[1].tabs).toEqual([]);
    expect(ws.panes[1].activeId).toBeNull();
  });
```
  Run `npx vitest run src/lib`. Expected: FAIL.

- [ ] **Step 3: Implement.**

  **`core.ts`.**
  - Extend `ErrorCode` with `| 'ImageFailed' | 'ImageRejected' | 'LinkRefused'`, and add the three to `CODES`.
  - Add to `MESSAGES`:
    ```ts
    ImageFailed: 'The picture couldn’t be loaded.',
    ImageRejected: 'That link isn’t a picture, or it’s larger than 5 MB.',
    LinkRefused: 'Folio only opens web and email links.',
    ```
  - Add `export interface RemoteImage { mime: string; base64: string }`.
  - Add to `core`:
    ```ts
    fetchRemoteImage: (url: string) => invoke<RemoteImage>('fetch_remote_image', { url }),
    openExternal: (url: string) => invoke<void>('open_external', { url }),
    openLogFolder: () => invoke<void>('open_log_folder'),
    forgetCollection: (collectionId: string) => invoke<void>('forget_collection', { collectionId }),
    ```
  - Add:
```ts
export const isAppError = (e: unknown): e is AppError =>
  !!e && typeof e === 'object' && CODES.includes((e as AppError).code);

/** What "Copy details" puts on the clipboard: the version, the time and the error, on one line. */
export function errorDetails(e: AppError, at = new Date()): string {
  return [`Folio ${__APP_VERSION__}`, at.toISOString(), e.details ? `${e.code}: ${e.details}` : e.code].join(' · ');
}
```
  **`prefs.ts`.**
  - Add `extLinks: 'ask' | 'direct';` and `remoteImages: 'ask' | 'block';` to `Prefs`.
  - Add `extLinks: 'ask', remoteImages: 'ask',` to `DEFAULT_PREFS`.
  - In `normalizePrefs`, add:
    ```ts
    extLinks: r.extLinks === 'direct' ? 'direct' : 'ask',
    remoteImages: r.remoteImages === 'block' ? 'block' : 'ask',
    ```

  **`library.ts`.**
  - Add `allowedImageSites: string[];` to `LibraryData` and `'allowedImageSites'` to `OWNED`.
  - In `parseLibrary`, add:
    ```ts
    allowedImageSites: uniqueBy(strings(raw.allowedImageSites).map((h) => h.trim().toLowerCase()).filter(Boolean), (h) => h),
    ```
  - Append:
```ts
export function allowSite(lib: LibraryData, host: string): void {
  const h = host.trim().toLowerCase();
  if (h && !lib.allowedImageSites.includes(h)) lib.allowedImageSites = [...lib.allowedImageSites, h];
}

export function forbidSite(lib: LibraryData, host: string): void {
  const h = host.trim().toLowerCase();
  lib.allowedImageSites = lib.allowedImageSites.filter((s) => s !== h);
}

/** "Clear history": recent documents, searches and reading progress. Favorites, bookmarks and settings stay. */
export function clearHistory(lib: LibraryData): void {
  lib.recent = [];
  lib.searches = [];
  lib.progress = {};
}

/** "Reset workspace" (amendment A9): everything Folio remembers about reading. Folders and other plans' keys stay. */
export function resetLibrary(lib: LibraryData): void {
  Object.assign(lib, {
    prefs: { ...DEFAULT_PREFS }, favorites: [], favoriteCollections: [], bookmarks: [], recent: [], searches: [],
    progress: {}, session: null, allowedImageSites: [],
  });
}
```
  Import `DEFAULT_PREFS` from `./prefs`.

  **`workspace.ts`.** Append:
```ts
/** Closes every tab showing a document of one folder, in both panes (the folder was removed from the list). */
export function closeCollection(ws: WorkspaceState, collectionId: string): void {
  for (const pane of ws.panes) {
    pane.tabs = pane.tabs.filter((t) => !current(t).key.startsWith(`${collectionId}/`));
    if (!pane.tabs.some((t) => t.id === pane.activeId)) pane.activeId = pane.tabs[0]?.id ?? null;
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass.** Run `npx vitest run`, `npm run check` and `npx tsc --noEmit -p .`. Expected: all clean. Fix every place where svelte-check now reports a `Prefs` object missing the two new fields.
- [ ] **Step 5: Commit.** `feat(app): add privacy preferences, allowed picture sites, history reset and the new core commands`

---

### Task 4: Picture placeholder and showing a fetched picture (`enhance.ts`, `lib/remote.ts`, `lib/find.ts`)

**Files:**
- Modify: `app/src/lib/markdown/enhance.ts`, `app/src/lib/markdown/render.test.ts` and `app/src/lib/find.ts`
- Create: `app/src/lib/remote.ts` and `app/src/lib/remote.test.ts`

**Interfaces:**
- Consumes: from Task 3, `RemoteImage` and `Prefs['remoteImages']`.
- Produces:
  - `EnhanceContext.remoteImages?: 'ask' | 'block'`.
  - The placeholder markup: `figure.remote-img[data-src][data-alt] > .remote-box > svg.i + div > p, p, button[data-act="remote-img"]`.
  - `hostOf(url)`, `dataUrl(img)` and `showRemoteImage(fig, src)`.

- [ ] **Step 1: Write the failing tests.** In `render.test.ts`, append inside the `describe`:
```ts
  it('offers to review an internet picture, or points to the setting that blocks it', () => {
    const ask = render('Guides/Introduction.md').article.querySelector<HTMLElement>('figure.remote-img')!;
    expect(ask.querySelector('button[data-act="remote-img"]')?.textContent).toBe('Review and show picture…');
    expect(ask.querySelector('svg use')?.getAttribute('href')).toBe('#i-image');
    const files = list(root);
    const text = readFileSync(root + 'Guides/Introduction.md', 'utf8');
    const blocked = renderDocument(text, { collectionId: 'sample', path: 'Guides/Introduction.md', files, assetUrl: (c, p) => `${c}/${p}`, remoteImages: 'block' });
    const fig = blocked.article.querySelector<HTMLElement>('figure.remote-img')!;
    expect(fig.querySelector('button')?.textContent).toBe('Change privacy settings');
    expect(fig.textContent).toContain('Your privacy settings block pictures from the internet.');
  });

  it('removes a data-act a document tries to set itself', () => {
    const { article } = renderDocument('<p data-act="remote-img">x</p>', { collectionId: 'c', path: 'a.md', files: [], assetUrl: (c, p) => p });
    expect(article.querySelector('[data-act]')).toBeNull();
  });
```
  If `list` and `root` aren't in scope at that point in `render.test.ts`, reuse the file's existing `render(...)` helper and pass a context override instead. Keep the assertions.

  Create `app/src/lib/remote.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { dataUrl, hostOf, showRemoteImage } from './remote';

describe('remote pictures', () => {
  it('reads a lower-case host, or nothing for a bad address', () => {
    expect(hostOf('https://Images.Example.org/a.png')).toBe('images.example.org');
    expect(hostOf('not a url')).toBe('');
  });

  it('builds a data URL only for pictures', () => {
    expect(dataUrl({ mime: 'image/png', base64: 'AA==' })).toBe('data:image/png;base64,AA==');
    expect(() => dataUrl({ mime: 'text/html', base64: 'AA==' })).toThrow();
  });

  it('swaps the placeholder for the picture and keeps the description', () => {
    const fig = document.createElement('figure');
    fig.className = 'remote-img';
    fig.dataset.src = 'https://x.org/a.png';
    fig.dataset.alt = 'A reading room';
    fig.innerHTML = '<div class="remote-box"><button data-act="remote-img">Review</button></div>';
    showRemoteImage(fig, 'data:image/png;base64,AA==');
    expect(fig.classList.contains('remote-img')).toBe(false);
    expect(fig.classList.contains('remote-shown')).toBe(true);
    expect(fig.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AA==');
    expect(fig.querySelector('img')?.getAttribute('alt')).toBe('A reading room');
    expect(fig.querySelector('figcaption')?.textContent).toBe('A reading room');
    expect(fig.querySelector('button')).toBeNull();
    expect(fig.dataset.src).toBe('https://x.org/a.png');
  });
});
```
  Run `npx vitest run src/lib/markdown/render.test.ts src/lib/remote.test.ts`. Expected: FAIL.

- [ ] **Step 2: Implement.**

  **`enhance.ts`.**
  - Add `remoteImages?: 'ask' | 'block';` to `EnhanceContext`, with the doc comment `/** The reader's choice for pictures from the internet; default 'ask'. */`.
  - Add `'act'` to `OWN_DATA`.
  - Add this helper near `el`:
```ts
function icon(article: HTMLElement, name: string) {
  const doc = article.ownerDocument;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'i');
  svg.setAttribute('aria-hidden', 'true');
  const use = doc.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}
```
  - In `images`, replace the body of the `if (/^https?:/i.test(src)) { … }` branch with:
```ts
      let host = src;
      try { host = new URL(src).host; } catch { /* keep the raw address */ }
      const blocked = ctx.remoteImages === 'block';
      fig.className = 'remote-img';
      fig.dataset.src = src;
      fig.dataset.alt = alt;
      const title = el(article, 'p');
      title.append(el(article, 'strong', '', 'Picture from the internet not shown'));
      if (alt) title.append(article.ownerDocument.createElement('br'), alt);
      const where = el(article, 'p', '', `It's stored on ${host}. ${blocked ? 'Your privacy settings block pictures from the internet.' : 'Loading it would let that website know you are reading this page.'}`);
      const button = el(article, 'button', 'btn sm', blocked ? 'Change privacy settings' : 'Review and show picture…');
      button.type = 'button';
      button.dataset.act = 'remote-img';
      const text = el(article, 'div');
      text.append(title, where, button);
      const box = el(article, 'div', 'remote-box');
      box.append(icon(article, 'image'), text);
      fig.append(box);
```
  The `SVG_NS` constant is declared lower in the file. Move it, and `XLINK_NS`, above the first use if TypeScript complains.

  **`app/src/lib/remote.ts`:**
```ts
import type { RemoteImage } from './core';

export function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return '';
  }
}

/** The fetched picture as a data: URL (allowed by the CSP's img-src). Only picture types get one. */
export function dataUrl(img: RemoteImage): string {
  if (!img.mime.startsWith('image/')) throw new Error(`not a picture: ${img.mime}`);
  return `data:${img.mime};base64,${img.base64}`;
}

/** Replaces a picture placeholder with the picture, keeping its description as alt text and caption. */
export function showRemoteImage(fig: HTMLElement, src: string): void {
  const doc = fig.ownerDocument;
  const alt = fig.dataset.alt ?? '';
  const img = doc.createElement('img');
  img.setAttribute('src', src);
  img.setAttribute('alt', alt);
  fig.replaceChildren(img);
  if (alt) {
    const caption = doc.createElement('figcaption');
    caption.textContent = alt;
    fig.append(caption);
  }
  fig.classList.replace('remote-img', 'remote-shown');
}
```
  **`find.ts`.** Add `.remote-img` to `SKIP`. The placeholder's words aren't document text, and its contents are replaced when the picture is shown, which would leave stale marks.

- [ ] **Step 3: Run the tests and confirm they pass.** Run `npx vitest run`, `npm run check` and `npx tsc --noEmit -p .`. Expected: clean. The existing test `holds back internet pictures behind a placeholder` must still pass, and so must the `details.test.ts` count of `.remote-img`.
- [ ] **Step 4: Commit.** `feat(app): add the internet-picture placeholder with a review button, and showing an approved picture`

---

### Task 5: Styles for Privacy & Help

**Files:**
- Modify: `app/scripts/port-styles.mjs` and `app/scripts/port-styles.test.mjs`
- Regenerate: `app/src/styles/*.css` and `app/src/IconSprite.svelte`

- [ ] **Step 1: Write the failing test.** In `port-styles.test.mjs`, change the screens test to:
```js
  it('keeps every screen, including Privacy & Help, but not the prototype strip', () => {
    for (const sel of ['.tab-main', '.swatch', '.home-hero', '.prefs-grid', '.lib-tabs', '.search-opts', '.result', '.findbar', '.suggest', '.promise', '.help-grid', '.radio-list', '.shortcuts', '.faq details']) {
      expect(out.app).toContain(sel);
    }
    expect(out.app).not.toContain('.proto-strip');
    expect(out.app).toContain('Desktop app overrides');
  });
```
  Run `npx vitest run scripts/port-styles.test.mjs`. Expected: FAIL.

- [ ] **Step 2: Implement.**
  - In `port-styles.mjs`, nothing is dropped any more. Remove the `DROP` constant and its test in `splitPrototype`, so every section other than "Rendered document" goes to `app`.
  - Update the file's header comment: `// One-off: copies the approved prototype's CSS and icon sprite (index.html) into the app.`
  - Run `node scripts/port-styles.mjs` in `app/`.

- [ ] **Step 3: Run the tests and confirm they pass.**
  - Run `npx vitest run scripts/port-styles.test.mjs`. Expected: PASS.
  - `git status`: only `app.css` changes among the generated files.
- [ ] **Step 4: Commit.** `feat(app): port the Privacy & Help styles`

---

### Task 6: App store: links, pictures, help, errors, reset and removing folders (`state/app.svelte.ts`)

**Files:**
- Modify: `app/src/state/app.svelte.ts` and `app/src/state/app.test.ts`

**Interfaces:**
- Consumes: Tasks 3–4.
- Produces, on `AppStore`:
  - `View`, which now includes `'help'`.
  - State:
    - `lastError: AppError | null`
    - `externalUrl: string | null`
    - `brokenLink: { target: string; collectionId: string } | null`
    - `imageReview: { url: string; alt: string } | null`
    - `shownImages: Record<string, string>`
    - `helpOpen: boolean`
  - Methods:
    - `report(e)`, `dismissNotice()`, `copyDetails()`
    - `followExternal(url)`, `openExternal(url, dontAskAgain?)`
    - `showBroken(target, collectionId)`, `searchSimilar()`
    - `reviewImage(url, alt)`, `showImage(always)`, `isSiteAllowed(url)`, `loadRemoteImage(url)`, `forbidSite(host)`
    - `clearHistory()`, `resetWorkspace()`
    - `forgetCollection(id)`, `openLogFolder()`
  - `resetPrefs()` now keeps `extLinks` and `remoteImages`.

- [ ] **Step 1: Write the failing tests.** In `app.test.ts`:
  - Add to `fakeApi`:
    ```ts
    fetchRemoteImage: vi.fn().mockResolvedValue({ mime: 'image/png', base64: 'AA==' }),
    openExternal: vi.fn().mockResolvedValue(undefined),
    openLogFolder: vi.fn().mockResolvedValue(undefined),
    forgetCollection: vi.fn().mockResolvedValue(undefined),
    ```
  - Append inside the `describe`:
```ts
  it('asks before opening a website, unless the reader turned that off', async () => {
    const api = fakeApi();
    const app = new AppStore(api);
    await app.init();
    app.followExternal('https://example.org');
    expect(app.externalUrl).toBe('https://example.org');
    expect(api.openExternal).not.toHaveBeenCalled();
    await app.openExternal('https://example.org', true);
    expect(app.externalUrl).toBeNull();
    expect(app.library.prefs.extLinks).toBe('direct');
    app.followExternal('https://example.net');
    await vi.waitFor(() => expect(api.openExternal).toHaveBeenCalledWith('https://example.net'));
  });

  it('reports a refused link with its message and keeps the details for copying', async () => {
    const app = new AppStore(fakeApi({ openExternal: vi.fn().mockRejectedValue({ code: 'LinkRefused' }) }));
    await app.openExternal('ftp://x');
    expect(app.notice).toBe(MESSAGES.LinkRefused);
    expect(app.lastError).toEqual({ code: 'LinkRefused' });
    app.dismissNotice();
    expect([app.notice, app.lastError]).toEqual([null, null]);
  });

  it('copies error details to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const app = new AppStore(fakeApi());
    app.report({ code: 'Internal', details: 'disk unreadable' });
    await app.copyDetails();
    expect(writeText.mock.calls[0][0]).toMatch(/Internal: disk unreadable$/);
    expect(app.notice).toBe('Details copied.');
    vi.unstubAllGlobals();
  });

  it('shows a picture once, or always for its site', async () => {
    const api = fakeApi();
    const app = new AppStore(api);
    await app.init();
    app.reviewImage('https://images.example.org/a.jpg', 'Room');
    await app.showImage(false);
    expect(app.shownImages['https://images.example.org/a.jpg']).toBe('data:image/png;base64,AA==');
    expect(app.isSiteAllowed('https://images.example.org/b.jpg')).toBe(false);
    app.reviewImage('https://images.example.org/b.jpg', '');
    await app.showImage(true);
    expect(app.library.allowedImageSites).toEqual(['images.example.org']);
    expect(app.isSiteAllowed('https://images.example.org/c.jpg')).toBe(true);
    await app.loadRemoteImage('https://images.example.org/b.jpg');
    expect(api.fetchRemoteImage).toHaveBeenCalledTimes(2);
  });

  it('blocked pictures send the reader to Privacy & Help instead of asking', async () => {
    const app = new AppStore(fakeApi());
    await app.init();
    app.library.allowedImageSites = ['x.org'];
    app.setPref('remoteImages', 'block');
    app.reviewImage('https://x.org/a.png', '');
    expect(app.imageReview).toBeNull();
    expect(app.view).toBe('help');
    expect(app.isSiteAllowed('https://x.org/a.png')).toBe(false);
  });

  it('a failed picture keeps its placeholder and says why', async () => {
    const app = new AppStore(fakeApi({ fetchRemoteImage: vi.fn().mockRejectedValue({ code: 'ImageRejected' }) }));
    await app.loadRemoteImage('https://x.org/a.png');
    expect(app.shownImages).toEqual({});
    expect(app.notice).toBe(MESSAGES.ImageRejected);
  });

  it('a broken link offers a search for similar pages in its folder', async () => {
    const api = fakeApi();
    const app = new AppStore(api);
    await app.init();
    app.showBroken('Guides/Printer-Manual.md', 'sample');
    app.searchSimilar();
    expect(app.brokenLink).toBeNull();
    expect(app.view).toBe('search');
    await vi.waitFor(() => expect(api.search).toHaveBeenCalledWith('Printer Manual', { kind: 'collection', collectionId: 'sample' }, expect.anything()));
  });

  it('clear history keeps favorites and settings', async () => {
    const app = new AppStore(fakeApi());
    await app.init();
    app.open('sample/Guide.md');
    app.toggleFavorite('sample/Guide.md');
    app.clearHistory();
    expect(app.library.recent).toEqual([]);
    expect(app.library.favorites).toEqual(['sample/Guide.md']);
  });

  it('reset returns to Home with defaults and keeps the folders', async () => {
    const session = { split: false, ratio: 0.5, activeCollection: 'sample', at: 1, panes: [{ tabs: [{ key: 'sample/Guide.md', scroll: 0 }], active: 0 }, { tabs: [], active: 0 }] };
    const api = fakeApi({ loadLibrary: vi.fn().mockResolvedValue({ library: { version: 1, session, prefs: { fontSize: 22 } }, reset: false }) });
    const app = new AppStore(api);
    await app.init();
    app.open('sample/Guide.md');
    app.resetWorkspace();
    expect(app.view).toBe('home');
    expect(app.savedSession).toBeNull();
    expect(app.ws.panes[0].tabs).toEqual([]);
    expect(app.library.prefs).toEqual(DEFAULT_PREFS);
    expect(app.collections).toEqual([sample]);
    await app.flush();
    const saved = (api.saveLibrary as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(saved.recent).toEqual([]);
  });

  it('restoring default reading settings keeps the privacy choices', async () => {
    const app = new AppStore(fakeApi());
    await app.init();
    app.setPref('extLinks', 'direct');
    app.setPref('fontSize', 22);
    app.resetPrefs();
    expect(app.library.prefs.fontSize).toBe(DEFAULT_PREFS.fontSize);
    expect(app.library.prefs.extLinks).toBe('direct');
  });

  it('forgetting a folder closes its tabs and picks another folder', async () => {
    const other: Collection = { id: 'f1', name: 'Notes', root: '/n', available: true };
    const api = fakeApi({ listCollections: vi.fn().mockResolvedValueOnce([sample, other]).mockResolvedValueOnce([sample]) });
    const app = new AppStore(api);
    await app.init();
    app.open('f1/todo.md');
    app.open('sample/Guide.md');
    app.activeCollection = 'f1';
    await app.forgetCollection('f1');
    expect(api.forgetCollection).toHaveBeenCalledWith('f1');
    expect(app.ws.panes[0].tabs.map((t) => t.history[t.index].key)).toEqual(['sample/Guide.md']);
    expect(app.activeCollection).toBe('sample');
    expect(app.collections).toEqual([sample]);
    expect(app.notice).toBe('“Notes” was removed from your folders. The folder itself is unchanged.');
  });
```
  Import `DEFAULT_PREFS` from `../lib/prefs`, and `Collection` from `../lib/core` if it isn't already imported.

  Run `npx vitest run src/state/app.test.ts`. Expected: FAIL.

- [ ] **Step 2: Implement.** In `app.svelte.ts`:
  1. Update the imports:
     - add `errorDetails`, `isAppError` and `type AppError` from `../lib/core`;
     - add `allowSite`, `clearHistory`, `forbidSite` and `resetLibrary` from `../lib/library`;
     - add `dataUrl` and `hostOf` from `../lib/remote`.
  2. Add `'help'` to `View`.
  3. Add these fields:
```ts
  /** The error behind the current notice, for "Copy details". */
  lastError = $state<AppError | null>(null);
  /** A website or email link waiting for the reader's go-ahead. */
  externalUrl = $state<string | null>(null);
  brokenLink = $state<{ target: string; collectionId: string } | null>(null);
  /** A picture from the internet the reader asked to review. */
  imageReview = $state<{ url: string; alt: string } | null>(null);
  /** Pictures shown in this run of Folio, by address (data: URLs). */
  shownImages = $state<Record<string, string>>({});
  helpOpen = $state(false);
  private loadingImages = new Set<string>();
```
  4. Replace every `this.notice = describeError(e)` with `this.report(e)`, including the saver's error callback. Keep `MESSAGES.*` notices as they are.
  5. In `setPref`, after normalising, add `if (key === 'remoteImages' && value === 'block') this.shownImages = {};`.
  6. Replace `resetPrefs` with:
```ts
  /** "Restore default settings" (Preferences): reading settings only; the privacy choices in Privacy & Help stay. */
  resetPrefs(): void {
    const { extLinks, remoteImages } = this.library.prefs;
    this.library.prefs = { ...DEFAULT_PREFS, extLinks, remoteImages };
    this.applyPrefs();
    this.persist();
  }
```
  7. Add these methods before `persist()`:
```ts
  /** Shows an error's plain message and keeps its details for "Copy details". */
  report(e: unknown): void {
    this.notice = describeError(e);
    this.lastError = isAppError(e) ? e : { code: 'Internal', details: String(e) };
  }

  dismissNotice(): void {
    this.notice = null;
    this.lastError = null;
  }

  async copyDetails(): Promise<void> {
    const e = this.lastError;
    if (!e) return;
    this.lastError = null;
    try {
      await navigator.clipboard.writeText(errorDetails(e));
      this.notice = 'Details copied.';
    } catch {
      this.notice = 'The details couldn’t be copied. They are also in the log file: Privacy & Help › Open log folder.';
    }
  }

  /** A website or email link in a document: ask first, unless the reader turned that off. */
  followExternal(url: string): void {
    if (this.library.prefs.extLinks === 'direct') void this.openExternal(url);
    else this.externalUrl = url;
  }

  async openExternal(url: string, dontAskAgain = false): Promise<void> {
    this.externalUrl = null;
    if (dontAskAgain) {
      this.setPref('extLinks', 'direct');
      this.notice = 'Websites will now open without asking. You can change this in Privacy & Help.';
    }
    try {
      await this.api.openExternal(url);
    } catch (e) {
      this.report(e);
    }
  }

  showBroken(target: string, collectionId: string): void {
    this.brokenLink = { target, collectionId };
  }

  /** "Search for similar pages": search the link's folder for the missing page's name. */
  searchSimilar(): void {
    const b = this.brokenLink;
    this.brokenLink = null;
    if (!b) return;
    this.activeCollection = b.collectionId;
    Object.assign(this.query, { scope: 'collection', folder: '' });
    this.searchFor(friendlyName(b.target));
  }

  /** "Review and show picture…": ask, or send the reader to the setting that blocks it. */
  reviewImage(url: string, alt: string): void {
    if (this.library.prefs.remoteImages === 'block') {
      this.view = 'help';
      return;
    }
    this.imageReview = { url, alt };
  }

  async showImage(always: boolean): Promise<void> {
    const r = this.imageReview;
    this.imageReview = null;
    if (!r) return;
    if (always) {
      allowSite(this.library, hostOf(r.url));
      this.persist();
    }
    await this.loadRemoteImage(r.url);
  }

  /** Sites the reader always allows load by themselves, unless pictures from the internet are blocked. */
  isSiteAllowed(url: string): boolean {
    return this.library.prefs.remoteImages !== 'block' && this.library.allowedImageSites.includes(hostOf(url));
  }

  async loadRemoteImage(url: string): Promise<void> {
    if (this.shownImages[url] || this.loadingImages.has(url)) return;
    this.loadingImages.add(url);
    try {
      this.shownImages[url] = dataUrl(await this.api.fetchRemoteImage(url));
    } catch (e) {
      this.report(e);
    } finally {
      this.loadingImages.delete(url);
    }
  }

  forbidSite(host: string): void {
    forbidSite(this.library, host);
    this.persist();
  }

  clearHistory(): void {
    clearHistory(this.library);
    this.persist();
    this.notice = 'History cleared. Your documents are not affected.';
  }

  /** "Reset workspace" (amendment A9): back to a first start, keeping "Your folders". */
  resetWorkspace(): void {
    resetLibrary(this.library);
    this.applyPrefs();
    this.ws = W.emptyWorkspace();
    this.savedSession = null;
    this.sessionLive = true;
    this.find = [null, null];
    this.shownImages = {};
    this.view = 'home';
    this.persist();
    this.notice = 'Folio has been reset. Your folders and documents are not affected.';
  }

  /** Removes a folder from "Your folders"; its documents stay where they are. */
  async forgetCollection(id: string): Promise<void> {
    const name = this.collections.find((c) => c.id === id)?.name ?? '';
    try {
      await this.api.forgetCollection(id);
    } catch (e) {
      this.report(e);
      return;
    }
    W.closeCollection(this.ws, id);
    delete this.trees[id];
    delete this.indexing[id];
    this.failedTrees.delete(id);
    try {
      this.collections = await this.api.listCollections();
    } catch (e) {
      this.report(e);
    }
    if (this.activeCollection === id) this.activeCollection = this.collections.find((c) => c.available)?.id ?? null;
    this.persist();
    this.notice = `“${name}” was removed from your folders. The folder itself is unchanged.`;
  }

  openLogFolder(): void {
    this.api.openLogFolder().catch((e) => this.report(e));
  }
```

- [ ] **Step 3: Run the tests and confirm they pass.** Run `npx vitest run`, `npm run check` and `npx tsc --noEmit -p .`. Expected: all clean.
- [ ] **Step 4: Commit.** `feat(app): add link, picture, help, reset and folder-removal actions to the app store`

---

### Task 7: Dialogs: website link, internet picture, broken link and screen help

**Files:**
- Create: `app/src/ExternalLinkDialog.svelte`, `app/src/RemoteImageDialog.svelte`, `app/src/BrokenLinkDialog.svelte` and `app/src/HelpDialog.svelte`

**Interfaces:**
- Consumes: `Dialog.svelte`, and from Task 6 `app.externalUrl`, `openExternal`, `imageReview`, `showImage`, `brokenLink`, `searchSimilar`, `helpOpen` and `view`.
- Produces: `<ExternalLinkDialog url>`, `<RemoteImageDialog url>`, `<BrokenLinkDialog target collectionId>` and `<HelpDialog>`. Task 9 mounts them.

- [ ] **Step 1: Create `ExternalLinkDialog.svelte`:**
```svelte
<script lang="ts">
  import Dialog from './Dialog.svelte';
  import { app } from './state/app.svelte';

  let { url }: { url: string } = $props();
  let dontAsk = $state(false);
  const isMail = $derived(/^mailto:/i.test(url));
  const cancel = () => (app.externalUrl = null);
</script>

<Dialog title={isMail ? 'Write an email?' : 'Open this website?'} onclose={cancel}>
  <p>This link leads outside your documents to:</p>
  <p class="url-box">{url}</p>
  <p>{isMail ? 'It will open in your usual email app.' : 'It will open in your usual web browser. Folio itself doesn’t connect to websites.'}</p>
  <p><label class="check"><input type="checkbox" bind:checked={dontAsk} /> Don’t ask again</label></p>
  {#snippet actions()}
    <button class="btn" onclick={cancel}>Cancel</button>
    <button class="btn btn-primary" onclick={() => app.openExternal(url, dontAsk)}>{isMail ? 'Open email app' : 'Open in browser'}</button>
  {/snippet}
</Dialog>
```
- [ ] **Step 2: Create `RemoteImageDialog.svelte`:**
```svelte
<script lang="ts">
  import Dialog from './Dialog.svelte';
  import { hostOf } from './lib/remote';
  import { app } from './state/app.svelte';

  let { url }: { url: string } = $props();
  const host = $derived(hostOf(url) || url);
  const keep = () => (app.imageReview = null);
</script>

<Dialog title="Show a picture from the internet?" onclose={keep}>
  <p>This picture is stored on <strong>{host}</strong>, not with your documents.</p>
  <p>To show it, Folio would download it from that website. The website could then see your network address and when you opened this page.</p>
  <p class="url-box">{url}</p>
  {#snippet actions()}
    <button class="btn" onclick={keep}>Keep hidden</button>
    <button class="btn" onclick={() => app.showImage(true)}>Always show pictures from {host}</button>
    <button class="btn btn-primary" onclick={() => app.showImage(false)}>Show this picture</button>
  {/snippet}
</Dialog>
```
- [ ] **Step 3: Create `BrokenLinkDialog.svelte`:**
```svelte
<script lang="ts">
  import Dialog from './Dialog.svelte';
  import { app } from './state/app.svelte';

  let { target, collectionId }: { target: string; collectionId: string } = $props();
  const folder = $derived(app.collections.find((c) => c.id === collectionId)?.name ?? '');
  const close = () => (app.brokenLink = null);
</script>

<Dialog title="This page can’t be found" onclose={close}>
  <p>The link points to <strong>{target}</strong>, but there’s no page with that name in “{folder}”.</p>
  <p>The page may have been renamed, moved, or not written yet. Your other documents are not affected.</p>
  {#snippet actions()}
    <button class="btn" onclick={() => app.searchSimilar()}>Search for similar pages</button>
    <button class="btn btn-primary" onclick={close}>OK</button>
  {/snippet}
</Dialog>
```
- [ ] **Step 4: Create `HelpDialog.svelte`.** The help text for each screen comes from the prototype's `HELP`, adjusted to how the desktop app behaves.
```svelte
<script lang="ts">
  import Dialog from './Dialog.svelte';
  import Icon from './Icon.svelte';
  import { app } from './state/app.svelte';

  const TITLES = { home: 'Getting started', reader: 'Reading documents', search: 'Searching', library: 'Your library', prefs: 'Reading preferences', help: 'Privacy and help' } as const;
  const view = app.view; // the screen the reader asked about, fixed while the dialog is open
  const close = () => (app.helpOpen = false);
  function allTopics() {
    close();
    app.view = 'help';
  }
</script>

<Dialog title={TITLES[view]} onclose={close}>
  {#if view === 'home'}
    <p>Choose how to begin:</p>
    <ul>
      <li><strong>Open a document</strong> reads one file from your computer; its folder opens too.</li>
      <li><strong>Open a folder</strong> lets you browse a whole collection of linked pages.</li>
      <li><strong>Explore the sample library</strong> opens a small example handbook.</li>
    </ul>
    <p><strong>Restore previous session</strong> reopens the tabs you had last time. <strong>Start fresh</strong> closes them.</p>
  {:else if view === 'search'}
    <ul>
      <li>Type a word or phrase and press <kbd>Enter</kbd> or select <strong>Search</strong>.</li>
      <li>Choose <strong>where to search</strong>: everywhere, the folder you're in, or only the document you're reading.</li>
      <li>Results show matching sections. “Heading match” means the words appear in a section title.</li>
      <li>Select a result to jump straight to that section, with matches highlighted. Use the arrows in the bar above the page to move between matches.</li>
    </ul>
  {:else if view === 'library'}
    <ul>
      <li><strong>Recent</strong>: documents you opened, newest first.</li>
      <li><strong>Favorites</strong>: documents you starred.</li>
      <li><strong>Bookmarks</strong>: individual sections you saved.</li>
      <li><strong>Reading progress</strong>: how far you've read each document.</li>
      <li><strong>Search history</strong>: what you searched for.</li>
    </ul>
    <p>Use the filter and sort controls to find things quickly.</p>
  {:else if view === 'prefs'}
    <p>Every change is shown immediately in the preview and in your documents. Settings are remembered on this computer. Use <strong>Restore default settings</strong> to undo them.</p>
  {:else if view === 'help'}
    <p>This page explains how Folio protects your documents, lets you choose how links and pictures from the internet are handled, and lists the keyboard shortcuts.</p>
  {:else}
    <ul>
      <li>The <strong>left panel</strong> lists folders and documents. Select one to open it in a tab.</li>
      <li>The <strong>right panel</strong> lists the sections of the page. The one you're reading is highlighted.</li>
      <li><strong>Links</strong> to other pages open in the same tab. Use Back to return. Hold <kbd>Ctrl</kbd> to open a new tab, or <kbd>Shift</kbd> to open it beside this one.</li>
      <li>A link in <span style="color:var(--danger)">red with a dotted underline</span> points to a missing page.</li>
      <li>A link with <Icon name="external" /> opens a website in your browser.</li>
      <li>The bar under the toolbar shows how far you've read.</li>
    </ul>
  {/if}
  {#snippet actions()}
    <button class="btn" onclick={allTopics}>All help topics</button>
    <button class="btn btn-primary" onclick={close}>Close</button>
  {/snippet}
</Dialog>
```
- [ ] **Step 5: Check.** Run `npm run check`. Expected: 0 errors and 0 warnings. If svelte-check warns that `app.view` is read once outside a reactive context, keep it as written; capturing it once is the intent. The dialog must not change topic if the screen changes behind it.
- [ ] **Step 6: Commit.** `feat(app): add the website-link, internet-picture, broken-link and screen-help dialogs`

---

### Task 8: Privacy & Help screen

**Files:**
- Create: `app/src/HelpView.svelte`
- Modify: `app/src/lib/i18n.ts` and `app/src/lib/i18n.test.ts`

**Interfaces:**
- Consumes:
  - `app.setPref`, `app.library.prefs`, `app.library.allowedImageSites`, `app.forbidSite`, `app.clearHistory`, `app.resetWorkspace`, `app.openLogFolder` and `app.open`;
  - `Dialog`;
  - the icons `lock`, `upload-off`, `eye-off`, `offline`, `clock`, `restore` and `folder-open`.
- Produces:
  - `<HelpView>`, with the heading `#help-h`.
  - The i18n keys `help` and `helpTitle`.

- [ ] **Step 1: Write the failing test.** In `i18n.test.ts`, append:
```ts
  it('translates Privacy & Help', () => {
    expect([t('es', 'help'), t('de', 'help'), t('en', 'helpTitle')]).toEqual(['Privacidad y ayuda', 'Datenschutz & Hilfe', 'Privacy, security and help']);
  });
```
  Run it. Expected: FAIL. Then add:
  - to `en`: `help: 'Privacy & Help', helpTitle: 'Privacy, security and help',`
  - to `es`: `help: 'Privacidad y ayuda', helpTitle: 'Privacidad, seguridad y ayuda',`
  - to `de`: `help: 'Datenschutz & Hilfe', helpTitle: 'Datenschutz, Sicherheit und Hilfe',`

  Run it again. Expected: PASS.

- [ ] **Step 2: Create `HelpView.svelte`.** The wording follows spec §6: only what is enforced, never "secure" or "certified", and the limitation stated plainly.
```svelte
<script lang="ts">
  import Dialog from './Dialog.svelte';
  import Icon from './Icon.svelte';
  import { t } from './lib/i18n';
  import { app } from './state/app.svelte';

  const lang = $derived(app.library.prefs.lang);
  let confirming = $state<'history' | 'reset' | null>(null);
  const sampleOpen = $derived(app.collections.some((c) => c.id === 'sample' && c.available));

  function setLinks(v: 'ask' | 'direct') {
    app.setPref('extLinks', v);
    app.notice = 'Link setting saved.';
  }
  function setPictures(v: 'ask' | 'block') {
    app.setPref('remoteImages', v);
    app.notice = 'Picture setting saved.';
  }
</script>

<section class="view" id="view-help" aria-labelledby="help-h">
  <div class="view-inner wide">
    <h1 class="vt" id="help-h" tabindex="-1">{t(lang, 'helpTitle')}</h1>
    <p class="lede">How Folio handles your documents, links and pictures from the internet, and how to get help.</p>
    <div class="help-grid">
      <div class="promise"><h3><Icon name="lock" />Read-only</h3><p>Folio opens documents for reading only. It has no way to change, move or delete them, and an automatic check stops any version of Folio that tries to write anywhere except its own settings and log.</p></div>
      <div class="promise"><h3><Icon name="upload-off" />Nothing is uploaded</h3><p>Your documents are read on this computer and never sent anywhere. The only thing Folio fetches from the internet is a picture you chose to show.</p></div>
      <div class="promise"><h3><Icon name="eye-off" />No usage tracking</h3><p>Folio has no analytics, crash reporting or update checks.</p></div>
      <div class="promise"><h3><Icon name="offline" />Works offline</h3><p>Reading, searching and navigating don't need an internet connection. Fonts and display tools are built in.</p></div>
    </div>

    <section class="help-section" aria-labelledby="ext-h">
      <h2 id="ext-h">Links to websites</h2>
      <p>Links to websites and email addresses open in your usual browser or email app, never inside Folio. That keeps websites separate from your documents.</p>
      <div class="radio-list" role="radiogroup" aria-labelledby="ext-h">
        <label><input type="radio" name="ext" checked={app.library.prefs.extLinks === 'ask'} onchange={() => setLinks('ask')} /><span>Ask before opening a website <small>Shows the full address first so you can check it. Recommended.</small></span></label>
        <label><input type="radio" name="ext" checked={app.library.prefs.extLinks === 'direct'} onchange={() => setLinks('direct')} /><span>Open websites straight away <small>Skips the question.</small></span></label>
      </div>
    </section>

    <section class="help-section" aria-labelledby="img-h">
      <h2 id="img-h">Pictures from the internet</h2>
      <p>Some documents include pictures stored on other websites. Loading one tells that website that you're reading, and when. Folio hides these pictures until you say otherwise.</p>
      <div class="radio-list" role="radiogroup" aria-labelledby="img-h">
        <label><input type="radio" name="remote" checked={app.library.prefs.remoteImages === 'ask'} onchange={() => setPictures('ask')} /><span>Ask each time <small>A placeholder shows where the picture is. Choose to show it if you trust the source.</small></span></label>
        <label><input type="radio" name="remote" checked={app.library.prefs.remoteImages === 'block'} onchange={() => setPictures('block')} /><span>Never show pictures from the internet <small>Pictures stored with your documents still appear.</small></span></label>
      </div>
      {#if app.library.allowedImageSites.length}
        <h3 class="section-h">Sites whose pictures always show</h3>
        <ul class="rows">
          {#each app.library.allowedImageSites as host (host)}
            <li><span class="row-main"><span class="row-title">{host}</span></span><button class="btn sm" aria-label="Stop always showing pictures from {host}" onclick={() => app.forbidSite(host)}>Remove</button></li>
          {/each}
        </ul>
      {/if}
      {#if sampleOpen}<div class="btn-row"><button class="btn sm" onclick={() => app.open('sample/Guides/Introduction.md')}>See an example</button></div>{/if}
    </section>

    <section class="help-section" aria-labelledby="hist-h">
      <h2 id="hist-h">History and reset</h2>
      <p>Folio remembers recent documents, searches, reading progress, favorites, bookmarks and your open tabs on this computer only, in its own settings file.</p>
      <div class="btn-row">
        <button class="btn" onclick={() => (confirming = 'history')}><Icon name="clock" />Clear history</button>
        <button class="btn" onclick={() => (confirming = 'reset')}><Icon name="restore" />Reset workspace</button>
      </div>
    </section>

    <section class="help-section" aria-labelledby="enf-h">
      <h2 id="enf-h">What Folio enforces</h2>
      <ul>
        <li>The window that shows your documents has no permission to read or write files. It can only ask Folio for documents in the folders you opened.</li>
        <li>Folio opens documents read-only. The only files it writes are its own settings and its log, in its own data folder.</li>
        <li>Every file Folio reads must be inside a folder you opened. Links that point elsewhere are refused.</li>
        <li>Documents can't run scripts, load web pages or send anything: formatting is cleaned before display, and a strict content security policy applies.</li>
        <li>Pictures from the internet load only after you allow them, and only through one part of Folio that accepts nothing but pictures of up to 5 MB.</li>
        <li>Only web and email links leave Folio, and they open in your browser or email app.</li>
      </ul>
      <p>One limitation: the question before showing a picture from the internet is asked by the window that shows documents. If a flaw ever let a document get past the cleaning and the content security policy, it could ask Folio to fetch a picture without asking you. No independent review of these protections has been done yet.</p>
    </section>

    <section class="help-section" aria-labelledby="log-h">
      <h2 id="log-h">If something goes wrong</h2>
      <p>Folio keeps a log of technical details about problems, on this computer only. It never contains the text of your documents. When a message offers <strong>Copy details</strong>, the same details go to the clipboard so you can pass them on.</p>
      <div class="btn-row"><button class="btn" onclick={() => app.openLogFolder()}><Icon name="folder-open" />Open log folder</button></div>
    </section>

    <section class="help-section" aria-labelledby="keys-h">
      <h2 id="keys-h">Keyboard shortcuts</h2>
      <dl class="shortcuts">
        <dt><kbd>/</kbd> or <kbd>Ctrl</kbd> + <kbd>K</kbd></dt><dd>Search</dd>
        <dt><kbd>Alt</kbd> + <kbd>←</kbd> / <kbd>→</kbd></dt><dd>Back and forward in the current tab</dd>
        <dt><kbd>[</kbd> and <kbd>]</kbd></dt><dd>Show or hide the library panel and the contents panel</dd>
        <dt><kbd>\</kbd></dt><dd>Read side by side, or go back to one page</dd>
        <dt><kbd>Ctrl</kbd> + click a link</dt><dd>Open the page in a new tab</dd>
        <dt><kbd>Shift</kbd> + click a link</dt><dd>Open the page beside the current one</dd>
        <dt><kbd>←</kbd> / <kbd>→</kbd> on a tab</dt><dd>Move between open tabs</dd>
        <dt><kbd>Esc</kbd></dt><dd>Close a dialog, menu or search highlights</dd>
      </dl>
    </section>

    <section class="help-section faq" aria-labelledby="faq-h">
      <h2 id="faq-h">Common questions</h2>
      <details><summary>What kind of documents can Folio open?</summary><p>Plain-text documents written in Markdown, a simple way of adding headings, lists and links to text. Their names usually end in .md. You don't need to know Markdown to read them; Folio shows them formatted.</p></details>
      <details><summary>Why is a link shown in red with a dotted underline?</summary><p>It points to a page that isn't in this folder. The page may have been renamed, moved or not written yet. Selecting it explains what's missing.</p></details>
      <details><summary>Why does Folio ask before showing some pictures?</summary><p>Those pictures are stored on other websites. Showing them would tell those websites that you're reading the document. You decide whether that's acceptable.</p></details>
      <details><summary>Can I edit my documents in Folio?</summary><p>No. Folio is a reader. Keeping it read-only means it can never damage your files.</p></details>
      <details><summary>Where are my favorites and bookmarks stored?</summary><p>On this computer only, in Folio's own settings file. Use “Clear history” or “Reset workspace” above to remove them yourself.</p></details>
    </section>
  </div>
</section>

{#if confirming === 'history'}
  <Dialog title="Clear history?" onclose={() => (confirming = null)}>
    <p>This removes recent documents, recent searches and reading progress from this computer. Favorites, bookmarks and settings are kept.</p>
    <p>Your documents are not affected.</p>
    {#snippet actions()}
      <button class="btn" onclick={() => (confirming = null)}>Cancel</button>
      <button class="btn btn-primary" onclick={() => { app.clearHistory(); confirming = null; }}>Clear history</button>
    {/snippet}
  </Dialog>
{:else if confirming === 'reset'}
  <Dialog title="Reset the workspace?" onclose={() => (confirming = null)}>
    <p>This closes all tabs and removes favorites, bookmarks, history, allowed picture sites and settings from this computer. Your folders stay in the list.</p>
    <p>Your documents are not affected. This can't be undone.</p>
    {#snippet actions()}
      <button class="btn" onclick={() => (confirming = null)}>Cancel</button>
      <button class="btn btn-primary" onclick={() => { app.resetWorkspace(); confirming = null; }}>Reset workspace</button>
    {/snippet}
  </Dialog>
{/if}
```
- [ ] **Step 3: Check.** Run `npm run check`, `npx vitest run` and `npx tsc --noEmit -p .`. Expected: clean. Also grep `HelpView.svelte` for `secure` and `certified`. Expected: no match, apart from the `helpTitle` key name.
- [ ] **Step 4: Commit.** `feat(app): add the Privacy & Help screen`

---

### Task 9: Wiring: document links and pictures, app bar help, notices, folder removal, and the assembled app

**Files:**
- Modify: `app/src/DocumentView.svelte`, `app/src/AppBar.svelte`, `app/src/App.svelte` and `app/src/HomeView.svelte`

**Interfaces:**
- Consumes: everything above.
- Produces: the finished Plan 4 app.

- [ ] **Step 1: Document links and pictures** (`DocumentView.svelte`).
  1. Add `import { showRemoteImage } from './lib/remote';`.
  2. In `onClick`, before `const link = …`, handle the picture button:
```ts
    const review = (event.target as HTMLElement).closest<HTMLElement>('button[data-act="remote-img"]');
    if (review) {
      event.preventDefault();
      if (event.type === 'auxclick') return;
      const fig = review.closest<HTMLElement>('figure.remote-img');
      if (fig?.dataset.src) app.reviewImage(fig.dataset.src, fig.dataset.alt ?? '');
      return;
    }
```
     Change the comment on the link's `event.preventDefault();` to `// every link is handled here: pages, sections, websites and broken links`. Replace the last branch with:
```ts
    } else if (kind === 'anchor' && slug) scrollToSlug(slug);
    else if (kind === 'external' && link.dataset.url) app.followExternal(link.dataset.url);
    else if (kind === 'refused') app.notice = MESSAGES.LinkRefused;
    else if (kind === 'broken') app.showBroken(link.dataset.target ?? '', parseKey(key).collectionId);
```
  3. In the render call, pass the picture setting: `renderDocument(doc.text, { collectionId, path, files: …, assetUrl, remoteImages: app.library.prefs.remoteImages })`.
  4. Add this function:
```ts
  /** Pictures from the internet: show the ones already fetched, and fetch the ones from sites the reader always allows. */
  function syncRemoteImages() {
    if (!article) return;
    for (const fig of article.querySelectorAll<HTMLElement>('figure.remote-img')) {
      const src = fig.dataset.src ?? '';
      const shown = app.shownImages[src];
      if (shown) showRemoteImage(fig, shown);
      else if (app.isSiteAllowed(src)) void app.loadRemoteImage(src);
    }
  }
```
     Call it in the render `.then`, right after `stopDiagrams = observeDiagrams(article, app.dark);`. Add an effect:
```ts
  // A picture the reader approved (here or in another pane) arrives: swap it in.
  $effect(() => {
    void Object.keys(app.shownImages);
    untrack(syncRemoteImages);
  });
```
- [ ] **Step 2: App bar help** (`AppBar.svelte`). Before the Preferences button, add:
```svelte
    <button class="icon-btn" aria-label="Help for this screen" title="Help for this screen" onclick={() => (app.helpOpen = true)}><Icon name="help" /></button>
```
- [ ] **Step 3: Assemble** (`App.svelte`).
  1. Add the imports for `BrokenLinkDialog`, `ExternalLinkDialog`, `HelpDialog`, `HelpView` and `RemoteImageDialog`, plus `import { describeError } from './lib/core';`.
  2. Add `help: '#help-h'` to `FOCUS`.
  3. Add `{:else if app.view === 'help'}<HelpView />` to the view switch.
  4. Replace the notice paragraph with:
```svelte
          <p class="notice">{app.notice}
            {#if app.lastError && app.notice === describeError(app.lastError)}<button class="link-btn" onclick={() => app.copyDetails()}>Copy details</button>{/if}
            <button class="link-btn" onclick={() => app.dismissNotice()}>Dismiss</button></p>
```
  5. After the details dialog block, add:
```svelte
{#if app.externalUrl}{#key app.externalUrl}<ExternalLinkDialog url={app.externalUrl} />{/key}{/if}
{#if app.imageReview}{#key app.imageReview.url}<RemoteImageDialog url={app.imageReview.url} />{/key}{/if}
{#if app.brokenLink}<BrokenLinkDialog target={app.brokenLink.target} collectionId={app.brokenLink.collectionId} />{/if}
{#if app.helpOpen}<HelpDialog />{/if}
```
- [ ] **Step 4: Removing a folder** (`HomeView.svelte`).
  1. Add `import Dialog from './Dialog.svelte';` and `import type { Collection } from './lib/core';`.
  2. Add `let removing = $state<Collection | null>(null);`.
  3. In each folder row, after the `row-open` button, add:
```svelte
              {#if c.id !== 'sample'}<button class="icon-btn sm" aria-label="Remove {c.name} from your folders" title="Remove from your folders" onclick={() => (removing = c)}><Icon name="x" /></button>{/if}
```
  4. At the end of the component, add:
```svelte
{#if removing}
  {@const c = removing}
  <Dialog title="Remove “{c.name}” from your folders?" onclose={() => (removing = null)}>
    <p>Folio will stop listing this folder. The folder and its documents stay on your computer, and you can open it again at any time.</p>
    {#snippet actions()}
      <button class="btn" onclick={() => (removing = null)}>Cancel</button>
      <button class="btn btn-primary" onclick={() => { void app.forgetCollection(c.id); removing = null; }}>Remove from list</button>
    {/snippet}
  </Dialog>
{/if}
```
- [ ] **Step 5: Run every automated check.** In `app/`, with the cargo `PATH` and `CARGO_TARGET_DIR` exports:
  - `npx vitest run`
  - `npm run check`: 0 errors and 0 warnings
  - `npx tsc --noEmit -p .`
  - `npm run check:readonly`
  - `npm run build`
  - `cd src-tauri && cargo test && cargo build`: no warnings

  All must pass.
- [ ] **Step 6: Commit.** `feat(app): open website links, show approved internet pictures, and add Privacy & Help, help and folder removal`
- [ ] **Step 7: Product owner's manual check.** Run `npm run tauri dev`, then:
  1. **Website link.** In Getting Started (or any document with a website link), select the link.
     - "Open this website?" shows the full address.
     - Cancel does nothing.
     - "Open in browser" opens your default browser.
     - With "Don't ask again" ticked, the next link opens straight away. Privacy & Help shows "Open websites straight away" selected; switch it back.
  2. **Email and other links.** A `mailto:` link asks "Write an email?" and opens your mail app. A `file:` or `ftp:` link shows "Folio only opens web and email links."
  3. **Internet picture.** Guides › Introduction shows the picture placeholder.
     - "Review and show picture…" opens the dialog.
     - "Keep hidden" keeps the placeholder.
     - "Show this picture" with the network on: the picture appears, or "The picture couldn't be loaded." for this example's made-up address. Try a real public image address in a test document too.
     - "Always show pictures from …" adds the site to Privacy & Help, where Remove takes it off again.
  4. **Blocked pictures.** Choose "Never show pictures from the internet". The placeholder's button now reads "Change privacy settings" after reopening the document, and it opens Privacy & Help.
  5. **Broken link.** Guides › Troubleshooting › "Printer Manual" opens "This page can't be found". "Search for similar pages" runs a search in that folder.
  6. **Help.** The ? button shows help for the current screen (Home, reader, Search, Library, Preferences, Privacy & Help). "All help topics" opens Privacy & Help.
  7. **Privacy & Help.** All sections show and the radio choices save.
     - "Clear history" asks first, then empties Recent and search history but keeps favorites.
     - "Reset workspace" asks first, then returns to Home with default settings and keeps your folders.
  8. **Copy details.** Make an error appear, for example by deleting an open document's folder. "Copy details" puts one line on the clipboard (paste it into Notepad). "Open log folder" opens a folder containing `folio.log`.
  9. **Remove a folder.** On Home, the × on one of your folders asks first, then removes it. Its tabs close and the folder stays on disk. The sample library has no ×.
  10. **Preferences.** "Restore default settings" doesn't change the link or picture choices.
  11. **Offline.** With the network off, everything except showing an internet picture works, and that picture fails with the plain message.

---

## Self-review notes (completed while writing)

- **Spec coverage.**
  - §3.1 `net` (http/https, no cookies, 10 s, 5 MB, images only): Task 1, with a test for each limit.
  - §3.3 `fetch_remote_image`, `open_external`, `open_log_folder` and `forget_collection`: Tasks 1–2.
  - `allowedImageSites`: Tasks 3 and 6.
  - §4.3 approval "once" / "always allow this site", sites removable in Privacy & Help: Tasks 6–8.
  - §4.4 confirmation, or straight away if turned off: Tasks 6–7 and 9.
  - §5:
    - the codes ImageFailed, ImageRejected and LinkRefused: Tasks 1 and 3;
    - the log file and Copy details: Tasks 2, 3, 6 and 9;
    - "no raw error text": the screens show only `MESSAGES`, and details go only to the clipboard or the log.
  - §6:
    - network only in `net` (enforced by the check script): Task 1;
    - `open_external` schemes: Task 2;
    - writes only in `library.rs` and `log.rs` (A8): Task 2;
    - Privacy & Help wording and the stated limitation: Task 8.
  - Prototype screen 7 (Privacy, security and help) and its dialogs: Tasks 7–9.
  - Moved to Plan 5: the web view crash reload and command panic containment (§5).
- **Placeholders.** None. Each code step has its code, and each test step its assertions.
- **Type consistency.**
  - Rust `RemoteImage { mime, base64 }` matches TS `RemoteImage`.
  - The command argument names `url` and `collectionId` are pinned in Task 3's bridge test.
  - `Prefs.extLinks` and `remoteImages` are used the same way in Tasks 3, 4, 6, 8 and 9.
  - `EnhanceContext.remoteImages` (Task 4) is fed in Task 9.
  - `allowSite`, `forbidSite`, `clearHistory`, `resetLibrary` and `closeCollection` (Task 3) are used in Task 6.
- **Hygiene picked up in passing.**
  - Task 2 Step 4 replaces raw NUL bytes in a test literal in `indexer.rs`.
  - Task 4 adds `.remote-img` to the find-mark skip list, so swapping a picture never strands highlights.
