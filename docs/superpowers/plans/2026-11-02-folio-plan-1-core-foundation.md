# Folio Plan 1: Core Foundation and First Reading Slice

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Tauri 2 desktop app that opens a real folder, lists its documents, and shows any document formatted. Read-only access, the path guard, the library store and the document-formatting steps are all tested.

**Architecture:** A Rust core in `app/src-tauri/` owns every file access. All of it goes through one path guard, and the core exposes six commands plus a `folio://` image protocol. Svelte screens in `app/src/` turn Markdown into a safe, enhanced page with marked, DOMPurify and KaTeX. This plan builds a minimal one-window shell; Plans 2–5 replace it with the full prototype interface.

**Tech Stack:** Tauri 2, Rust (stable), tauri-plugin-dialog 2, serde, dunce, percent-encoding, tempfile (tests); Svelte 5, TypeScript, Vite 5, Vitest 2 with jsdom; marked 12, DOMPurify 3, KaTeX 0.16.

**Spec:** `docs/superpowers/specs/2026-11-02-folio-desktop-architecture-design.md` (approved 2026-11-02).

## Plan roadmap

The spec covers five subsystems, so it is built as five plans. Each plan ends with working, testable software.

| Plan | Delivers |
|---|---|
| **1 (this plan)** | Rust core (errors, path guard, reader, library store, tree, collections, commands, `folio://`), the read-only CI check, sample library files, the formatting steps, and a minimal shell that opens folders and documents |
| 2 | The full reading workspace from the prototype: app bar, sidebar (filter, favorites, recent), tabs and history, side-by-side panes, contents panel, progress, Home and session restore, Preferences with 7 themes and bundled fonts, lazy Mermaid |
| 3 | Search index in Rust, the file watcher, `collection-changed` and `index-progress` events, the Search and Library screens, bookmarks |
| 4 | Privacy and safety: `net.rs` remote images and allowed sites, `open_external` with the link dialog, Privacy & Help, error messages with Copy details, log file |
| 5 | Whole-app tests (WebdriverIO and Playwright), axe accessibility checks, speed benchmarks, the three-platform CI matrix, signed installers, UAT |

## Global Constraints

Every task's requirements include this section.

- Platforms: Windows, macOS and Linux. Nothing platform-specific outside `#[cfg]` blocks with a fallback.
- The screens get no file-system, shell, HTTP or dialog permissions. The capability file grants `core:default` only, plus the app's own commands.
- The core opens documents read-only. File-writing calls appear only in `library.rs` and in `#[cfg(test)]` modules; `npm run check:readonly` enforces this.
- Every file access goes through `paths::resolve`.
- The document size cap is 10 MB (`MAX_BYTES = 10 * 1024 * 1024`). The tree stops at 20,000 files (`MAX_FILES = 20_000`).
- The tree skips names starting with `.`, skips `node_modules`, and does not follow symlinks.
- Content security policy, exactly: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' folio: http://folio.localhost data:; font-src 'self'; connect-src ipc: http://ipc.localhost; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`
- No network code in Plan 1. No library loads from a CDN.
- `library.json` lives in the app data folder and has `"version": 1`. A damaged file is renamed to `library.json.bak` and a fresh library is started.
- Error codes are serialized as `{ "code": "<Code>", "details"?: string }`. The codes used in Plan 1 are `NotFound`, `CollectionUnavailable`, `AccessDenied`, `OutsideCollection`, `TooLarge`, `NotText` and `Internal`.
- User-facing text is plain language and never shows raw errors, paths or codes. Messages are copied verbatim from spec Section 5.
- Bundle identifier: `com.sainath.markvy`. **Product owner:** confirm this before the first public build. It sets the app data folder name, so it shouldn't change after release.
- The sample library ships as real files in `app/tests/fixtures/sample-wiki/`, the same files the tests use. Its images are `.svg`; the prototype labelled vector drawings as `.png`.

## Review Focus

These are the five inputs most likely to break for real users that the spec doesn't spell out. Each line names where its test lives.

1. **Folder and file names with spaces, accents or `#`** (the product owner's own OneDrive path has spaces). Reading and `folio://` image URLs must still work. Tests: Task 3 `resolves_names_with_spaces_and_accents`, Task 7 `parse_decodes_percent_encoding`, Task 12 `assetUrl encodes spaces, accents and #`.
2. **UTF-16 files with a byte-order mark**, which older Windows Notepad saves. They must display, not be rejected as "not text". Test: Task 4 `decodes_utf16le_with_bom`.
3. **Links written Windows-style (`Guides\Security.md`), in a different letter case, percent-encoded, without an extension, or pointing at a folder.** They must open the page, not show "missing". Tests: Task 11 `links.test.ts`.
4. **A remembered folder that has been deleted or is on an unplugged drive.** It must be listed as unavailable, and opening it must give `CollectionUnavailable`, not a crash. Tests: Task 6 `missing_root_is_unavailable`, Task 7 `root_of_unknown_id_is_unavailable`.
5. **Hostile HTML inside a Markdown file** (scripts, event handlers, `javascript:` links, frames, forms). It must be removed before display. Tests: Task 10 `sanitize.test.ts`, Task 11 `render.test.ts > neutralises javascript links`.

---

### Task 0: Development prerequisites (done by a person)

**Files:** none

These steps download and install system software, so a person must run them; the implementing agent shouldn't.

- [ ] **Step 1: Install Rust.** Install from https://rustup.rs using the default stable toolchain. On Windows the installer offers the Visual Studio C++ Build Tools ("Desktop development with C++"); accept them.
- [ ] **Step 2: Check Node.** Node 20 or newer is required. Node 24.19.0 is already present on the development machine.
- [ ] **Step 3: Check WebView2 (Windows).** It's already present (version 156). macOS needs nothing extra. On Linux, install the WebKitGTK packages from https://v2.tauri.app/start/prerequisites/.
- [ ] **Step 4: Verify.**

Run: `cargo --version && rustc --version && node --version`
Expected: three version lines, with no "command not found".

---

### Task 1: Scaffold the Tauri 2 + Svelte app

**Files:**
- Create: `app/package.json`, `app/vite.config.ts`, `app/svelte.config.js`, `app/tsconfig.json`, `app/index.html`, `app/src/main.ts`, `app/src/App.svelte`, `app/src/styles/base.css`, `app/src/smoke.test.ts`
- Create: `app/src-tauri/Cargo.toml`, `app/src-tauri/build.rs`, `app/src-tauri/src/main.rs`, `app/src-tauri/src/lib.rs`, `app/src-tauri/tauri.conf.json`, `app/src-tauri/capabilities/default.json`, `app/src-tauri/app-icon.svg`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `folio_lib::run()`; an npm scripts set (`dev`, `build`, `test`, `check`, `tauri`, `check:readonly`); a Vitest jsdom environment.

- [ ] **Step 1: Write the frontend project files**

`app/package.json`:
```json
{
  "name": "folio",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "check": "svelte-check --tsconfig ./tsconfig.json",
    "test": "vitest run",
    "tauri": "tauri",
    "check:readonly": "node scripts/check-readonly.mjs"
  }
}
```

`app/vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
  },
});
```

`app/svelte.config.js`:
```js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default { preprocess: vitePreprocess() };
```

`app/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "src/**/*.svelte"]
}
```

`app/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Folio</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`app/src/main.ts`:
```ts
import { mount } from 'svelte';
import App from './App.svelte';
import './styles/base.css';

export default mount(App, { target: document.getElementById('app')! });
```

`app/src/App.svelte` (placeholder; Task 12 replaces it):
```svelte
<main><h1>Folio</h1></main>
```

`app/src/styles/base.css` (placeholder; Task 12 replaces it):
```css
body { margin: 0; font-family: system-ui, sans-serif; }
```

`app/src/smoke.test.ts`:
```ts
import { describe, expect, it } from 'vitest';

describe('toolchain', () => {
  it('runs tests in a DOM environment', () => {
    expect(document.createElement('p').tagName).toBe('P');
  });
});
```

- [ ] **Step 2: Install frontend dependencies**

Run in `app/`:
```bash
npm install @tauri-apps/api@^2 marked@^12.0.2 dompurify@^3.1.6 katex@^0.16.11
npm install -D @tauri-apps/cli@^2 svelte@^5 @sveltejs/vite-plugin-svelte@^4 vite@^5 vitest@^2 jsdom@^25 typescript@^5 svelte-check@^4 @types/katex@^0.16
```
Expected: `package-lock.json` is created, with no `ERR!` lines.

- [ ] **Step 3: Write the Rust project files**

`app/src-tauri/Cargo.toml`:
```toml
[package]
name = "folio"
version = "0.1.0"
edition = "2021"

[lib]
name = "folio_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
dunce = "1"
percent-encoding = "2"

[dev-dependencies]
tempfile = "3"
```

`app/src-tauri/build.rs`:
```rust
fn main() {
    tauri_build::build()
}
```

`app/src-tauri/src/main.rs`:
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    folio_lib::run()
}
```

`app/src-tauri/src/lib.rs` (Task 7 extends this):
```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error while running Folio");
}
```

`app/src-tauri/tauri.conf.json`:
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Folio",
  "version": "0.1.0",
  "identifier": "com.sainath.markvy",
  "build": {
    "devUrl": "http://localhost:1420",
    "frontendDist": "../dist",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      { "label": "main", "title": "Folio", "width": 1280, "height": 820, "minWidth": 720, "minHeight": 480 }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' folio: http://folio.localhost data:; font-src 'self'; connect-src ipc: http://ipc.localhost; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"]
  }
}
```

`app/src-tauri/capabilities/default.json`:
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Folio main window: core events and Folio's own commands only. No fs, shell, http or dialog permissions.",
  "windows": ["main"],
  "permissions": ["core:default"]
}
```

`app/src-tauri/app-icon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="220" fill="#2E6A54"/><path d="M172 300c113-46 240-42 340 28 100-70 227-74 340-28v460c-113-46-240-42-340 28-100-70-227-74-340-28z" fill="#F7F8F4"/><path d="M512 328v460" stroke="#2E6A54" stroke-width="28"/></svg>
```

Append to the repository's `.gitignore`:
```
app/src-tauri/gen/schemas/
```

- [ ] **Step 4: Generate the icons**

Run in `app/`: `npx tauri icon src-tauri/app-icon.svg`
Expected: `src-tauri/icons/` contains `icon.ico`, `icon.icns`, `32x32.png`, `128x128.png` and `128x128@2x.png`.

- [ ] **Step 5: Verify that both halves build and the tests run**

Run in `app/`: `npm test && npm run build`
Expected: `1 passed`, and the Vite build writes `dist/index.html`.

Run in `app/src-tauri/`: `cargo check`
Expected: `Finished` with no errors. The first run downloads crates and takes several minutes.

- [ ] **Step 6: Commit**

```bash
git add .gitignore app
git commit -m "feat(app): scaffold Tauri 2 + Svelte project with strict CSP and minimal capability"
```

---

### Task 2: Error codes (`errors.rs`)

**Files:**
- Create: `app/src-tauri/src/errors.rs`
- Modify: `app/src-tauri/src/lib.rs` (add `pub mod errors;` at the top)

**Interfaces:**
- Produces: `pub enum AppError { NotFound, CollectionUnavailable, AccessDenied, OutsideCollection, TooLarge, NotText, Internal(String) }`. It derives `Debug, Clone, PartialEq, Eq, Serialize` and has `AppError::from_io(std::io::Error) -> AppError` and `impl From<std::io::Error>`. JSON form: `{"code":"TooLarge"}` or `{"code":"Internal","details":"..."}`.

- [ ] **Step 1: Write the failing tests.** Create `app/src-tauri/src/errors.rs` with only the test module:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io;

    #[test]
    fn unit_variant_serializes_as_code_only() {
        assert_eq!(serde_json::to_value(AppError::TooLarge).unwrap(), json!({ "code": "TooLarge" }));
    }

    #[test]
    fn internal_carries_details() {
        assert_eq!(
            serde_json::to_value(AppError::Internal("disk unreadable".into())).unwrap(),
            json!({ "code": "Internal", "details": "disk unreadable" })
        );
    }

    #[test]
    fn io_errors_map_to_codes() {
        assert_eq!(AppError::from_io(io::Error::from(io::ErrorKind::NotFound)), AppError::NotFound);
        assert_eq!(AppError::from_io(io::Error::from(io::ErrorKind::PermissionDenied)), AppError::AccessDenied);
        assert!(matches!(AppError::from_io(io::Error::from(io::ErrorKind::Other)), AppError::Internal(_)));
    }
}
```

Add `pub mod errors;` as the first line of `lib.rs`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run in `app/src-tauri/`: `cargo test errors::`
Expected: compile error ``cannot find type `AppError` ``.

- [ ] **Step 3: Implement.** Put this above the test module:

```rust
use serde::Serialize;
use std::io;

/// Every failure the screens can receive. The screens map each code to a plain-language message.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "code", content = "details")]
pub enum AppError {
    NotFound,
    CollectionUnavailable,
    AccessDenied,
    OutsideCollection,
    TooLarge,
    NotText,
    /// Unexpected failure. The details go to the log and the Copy details button, never into the message.
    Internal(String),
}

impl AppError {
    pub fn from_io(e: io::Error) -> Self {
        match e.kind() {
            io::ErrorKind::NotFound => AppError::NotFound,
            io::ErrorKind::PermissionDenied => AppError::AccessDenied,
            _ => AppError::Internal(e.to_string()),
        }
    }
}

impl From<io::Error> for AppError {
    fn from(e: io::Error) -> Self {
        AppError::from_io(e)
    }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cargo test errors::`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri/src/errors.rs app/src-tauri/src/lib.rs
git commit -m "feat(core): add serializable error codes"
```

---

### Task 3: Path guard (`paths.rs`)

**Files:**
- Create: `app/src-tauri/src/paths.rs`
- Modify: `app/src-tauri/src/lib.rs` (add `pub mod paths;`)

**Interfaces:**
- Consumes: `AppError` (Task 2).
- Produces: `pub fn resolve(root: &Path, rel: &str) -> Result<PathBuf, AppError>`. It returns the canonical absolute path of an existing entry inside `root`. `rel` uses `/` separators and must already be normalized (the screens resolve `..` themselves before asking).

- [ ] **Step 1: Write the failing tests** in `app/src-tauri/src/paths.rs`:

```rust
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
        assert!(resolve(d.path(), "Café notes #1.md").is_ok());
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
}
```

Add `pub mod paths;` to `lib.rs`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cargo test paths::`
Expected: compile error ``cannot find function `resolve` ``.

- [ ] **Step 3: Implement.** Put this above the tests:

```rust
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
    let root = dunce::canonicalize(root).map_err(|_| AppError::CollectionUnavailable)?;
    let full = dunce::canonicalize(root.join(rel_path)).map_err(AppError::from_io)?;
    if !full.starts_with(&root) {
        return Err(AppError::OutsideCollection);
    }
    Ok(full)
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cargo test paths::`
Expected: `7 passed` on macOS and Linux, `6 passed` on Windows (the symlink test is Unix-only). Windows junctions are covered by the same `starts_with` check after canonicalization; a junction test needs administrator rights and is left to Plan 5's manual checklist.

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri/src/paths.rs app/src-tauri/src/lib.rs
git commit -m "feat(core): add path guard that keeps every access inside its collection"
```

---

### Task 4: Document reader (`reader.rs`)

**Files:**
- Create: `app/src-tauri/src/reader.rs`
- Modify: `app/src-tauri/src/lib.rs` (add `pub mod reader;`)

**Interfaces:**
- Consumes: `AppError` (Task 2).
- Produces:
  - `pub const MAX_BYTES: u64 = 10 * 1024 * 1024;`
  - `pub struct DocumentText { pub text: String, pub size: u64, pub modified_ms: Option<u64>, pub lossy: bool }`, serialized in camelCase as `text`, `size`, `modifiedMs`, `lossy`
  - `pub fn read_text(path: &Path) -> Result<DocumentText, AppError>`

- [ ] **Step 1: Write the failing tests** in `app/src-tauri/src/reader.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::errors::AppError;
    use std::fs;

    fn file_with(bytes: &[u8]) -> (tempfile::TempDir, std::path::PathBuf) {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("doc.md");
        fs::write(&p, bytes).unwrap();
        (d, p)
    }

    #[test]
    fn reads_utf8() {
        let (_d, p) = file_with(b"# Hello\n");
        let doc = read_text(&p).unwrap();
        assert_eq!(doc.text, "# Hello\n");
        assert_eq!(doc.size, 8);
        assert!(!doc.lossy);
        assert!(doc.modified_ms.is_some());
    }

    #[test]
    fn strips_utf8_bom() {
        let (_d, p) = file_with(b"\xEF\xBB\xBF# Hi");
        assert_eq!(read_text(&p).unwrap().text, "# Hi");
    }

    #[test]
    fn decodes_utf16le_with_bom() {
        let mut bytes = vec![0xFF, 0xFE];
        for unit in "# Hi".encode_utf16() {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        let (_d, p) = file_with(&bytes);
        let doc = read_text(&p).unwrap();
        assert_eq!(doc.text, "# Hi");
        assert!(!doc.lossy);
    }

    #[test]
    fn invalid_utf8_is_shown_lossy() {
        let (_d, p) = file_with(b"caf\xE9 au lait");
        let doc = read_text(&p).unwrap();
        assert!(doc.lossy);
        assert!(doc.text.starts_with("caf"));
    }

    #[test]
    fn nul_bytes_mean_not_text() {
        let (_d, p) = file_with(b"\x89PNG\r\n\x1a\n\0\0\0");
        assert_eq!(read_text(&p).unwrap_err(), AppError::NotText);
    }

    #[test]
    fn over_ten_megabytes_is_too_large() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("big.md");
        fs::File::create(&p).unwrap().set_len(MAX_BYTES + 1).unwrap();
        assert_eq!(read_text(&p).unwrap_err(), AppError::TooLarge);
    }

    #[test]
    fn directory_is_not_text() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(read_text(d.path()).unwrap_err(), AppError::NotText);
    }
}
```

Add `pub mod reader;` to `lib.rs`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cargo test reader::`
Expected: compile error ``cannot find function `read_text` ``.

- [ ] **Step 3: Implement.** Put this above the tests:

```rust
use crate::errors::AppError;
use serde::Serialize;
use std::{fs, path::Path, time::UNIX_EPOCH};

pub const MAX_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentText {
    pub text: String,
    pub size: u64,
    pub modified_ms: Option<u64>,
    /// True when some bytes couldn't be decoded and were replaced.
    pub lossy: bool,
}

/// Reads a document for display. Never writes: `fs::read` opens the file read-only.
pub fn read_text(path: &Path) -> Result<DocumentText, AppError> {
    let meta = fs::metadata(path)?;
    if meta.is_dir() {
        return Err(AppError::NotText);
    }
    if meta.len() > MAX_BYTES {
        return Err(AppError::TooLarge);
    }
    let bytes = fs::read(path)?;
    let (text, lossy) = decode(&bytes)?;
    let modified_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64);
    Ok(DocumentText { text, size: meta.len(), modified_ms, lossy })
}

fn decode(bytes: &[u8]) -> Result<(String, bool), AppError> {
    if let Some(rest) = bytes.strip_prefix(&[0xFF, 0xFE]) {
        return Ok(utf16(rest, u16::from_le_bytes));
    }
    if let Some(rest) = bytes.strip_prefix(&[0xFE, 0xFF]) {
        return Ok(utf16(rest, u16::from_be_bytes));
    }
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    if bytes.iter().take(8192).any(|&b| b == 0) {
        return Err(AppError::NotText);
    }
    Ok(match std::str::from_utf8(bytes) {
        Ok(s) => (s.to_owned(), false),
        Err(_) => (String::from_utf8_lossy(bytes).into_owned(), true),
    })
}

fn utf16(rest: &[u8], unit: fn([u8; 2]) -> u16) -> (String, bool) {
    let units: Vec<u16> = rest.chunks_exact(2).map(|c| unit([c[0], c[1]])).collect();
    let text = String::from_utf16_lossy(&units);
    let lossy = rest.len() % 2 != 0 || text.contains('\u{FFFD}');
    (text, lossy)
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cargo test reader::`
Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri/src/reader.rs app/src-tauri/src/lib.rs
git commit -m "feat(core): add read-only document reader with size cap and encoding detection"
```

---

### Task 5: Library store (`library.rs`)

**Files:**
- Create: `app/src-tauri/src/library.rs`
- Modify: `app/src-tauri/src/lib.rs` (add `pub mod library;`)

**Interfaces:**
- Consumes: `AppError` (Task 2).
- Produces:
  - `pub struct LoadResult { pub library: serde_json::Value, pub reset: bool }`. It derives `Debug, Clone, Serialize` (camelCase) and has `LoadResult::fresh()`.
  - `pub fn load(dir: &Path) -> Result<LoadResult, AppError>`
  - `pub fn save(dir: &Path, library: &Value) -> Result<(), AppError>`
  - The library is opaque JSON owned by the screens. The core only requires `"version": 1` and reads and writes the `"collections"` key (Task 6).

- [ ] **Step 1: Write the failing tests** in `app/src-tauri/src/library.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;

    #[test]
    fn missing_file_gives_fresh_library() {
        let d = tempfile::tempdir().unwrap();
        let r = load(d.path()).unwrap();
        assert_eq!(r.library["version"], json!(1));
        assert!(!r.reset);
    }

    #[test]
    fn save_then_load_round_trips() {
        let d = tempfile::tempdir().unwrap();
        let lib = json!({ "version": 1, "favorites": ["sample/README.md"] });
        save(d.path(), &lib).unwrap();
        assert_eq!(load(d.path()).unwrap().library, lib);
    }

    #[test]
    fn save_creates_missing_folder() {
        let d = tempfile::tempdir().unwrap();
        let nested = d.path().join("Folio");
        save(&nested, &json!({ "version": 1 })).unwrap();
        assert!(nested.join("library.json").is_file());
    }

    #[test]
    fn damaged_file_is_backed_up_and_reset() {
        let d = tempfile::tempdir().unwrap();
        fs::write(d.path().join("library.json"), "{not json").unwrap();
        let r = load(d.path()).unwrap();
        assert!(r.reset);
        assert_eq!(r.library["version"], json!(1));
        assert_eq!(fs::read_to_string(d.path().join("library.json.bak")).unwrap(), "{not json");
    }

    #[test]
    fn unknown_version_is_reset() {
        let d = tempfile::tempdir().unwrap();
        fs::write(d.path().join("library.json"), r#"{"version":99}"#).unwrap();
        assert!(load(d.path()).unwrap().reset);
    }
}
```

Add `pub mod library;` to `lib.rs`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cargo test library::`
Expected: compile error ``cannot find function `load` ``.

- [ ] **Step 3: Implement.** Put this above the tests:

```rust
use crate::errors::AppError;
use serde::Serialize;
use serde_json::{json, Value};
use std::{fs, io, path::Path};

const FILE: &str = "library.json";
const BACKUP: &str = "library.json.bak";
const TEMP: &str = "library.json.tmp";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadResult {
    pub library: Value,
    /// True when a damaged library was set aside and a fresh one started.
    pub reset: bool,
}

impl LoadResult {
    pub fn fresh() -> Self {
        LoadResult { library: json!({ "version": 1, "collections": [] }), reset: false }
    }
}

pub fn load(dir: &Path) -> Result<LoadResult, AppError> {
    let path = dir.join(FILE);
    let raw = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(LoadResult::fresh()),
        Err(e) => return Err(AppError::from_io(e)),
    };
    match serde_json::from_str::<Value>(&raw) {
        Ok(v) if v.get("version") == Some(&json!(1)) => Ok(LoadResult { library: v, reset: false }),
        _ => {
            fs::rename(&path, dir.join(BACKUP))?;
            Ok(LoadResult { reset: true, ..LoadResult::fresh() })
        }
    }
}

/// Atomic save: write a temporary file, then rename it over the old one.
/// This is the only file the app ever writes.
pub fn save(dir: &Path, library: &Value) -> Result<(), AppError> {
    fs::create_dir_all(dir)?;
    let bytes = serde_json::to_vec_pretty(library).map_err(|e| AppError::Internal(e.to_string()))?;
    let temp = dir.join(TEMP);
    fs::write(&temp, bytes)?;
    fs::rename(&temp, dir.join(FILE))?;
    Ok(())
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cargo test library::`
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri/src/library.rs app/src-tauri/src/lib.rs
git commit -m "feat(core): add atomic library store with damaged-file recovery"
```

---

### Task 6: Folder tree and collections (`workspace.rs`)

**Files:**
- Create: `app/src-tauri/src/workspace.rs`
- Modify: `app/src-tauri/src/lib.rs` (add `pub mod workspace;`)

**Interfaces:**
- Consumes: `AppError` (Task 2).
- Produces:
  - `pub const MAX_FILES: usize = 20_000;` and `pub const SAMPLE_ID: &str = "sample";`
  - `pub enum NodeKind { Folder, Document, Image }`, serialized lowercase
  - `pub struct TreeNode { pub name: String, pub path: String, pub kind: NodeKind, pub children: Vec<TreeNode> }`. `path` is relative to the collection and uses `/`; the root's path is `""`.
  - `pub struct Tree { pub root: TreeNode, pub truncated: bool }`
  - `pub fn build_tree(root: &Path) -> Result<Tree, AppError>` and `pub fn build_tree_with_cap(root: &Path, cap: usize) -> Result<Tree, AppError>`
  - `pub struct Collection { pub id: String, pub name: String, pub root: PathBuf, pub available: bool }`, serialized camelCase, with `available` defaulting to `false` when deserialized
  - `Collection::new(root: PathBuf) -> Collection`, `pub fn collection_id(root: &Path) -> String`, `pub fn collections_from_library(lib: &Value) -> Vec<Collection>`, `pub fn collections_to_json(cols: &[Collection]) -> Value` (the sample collection is never saved)

- [ ] **Step 1: Write the failing tests** in `app/src-tauri/src/workspace.rs`:

```rust
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
}
```

Add `pub mod workspace;` to `lib.rs`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cargo test workspace::`
Expected: compile error ``cannot find function `build_tree` ``.

- [ ] **Step 3: Implement.** Put this above the tests:

```rust
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
    lib.get("collections")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default()
}

pub fn collections_to_json(cols: &[Collection]) -> Value {
    json!(cols
        .iter()
        .filter(|c| c.id != SAMPLE_ID)
        .map(|c| json!({ "id": c.id, "name": c.name, "root": c.root }))
        .collect::<Vec<_>>())
}

fn kind_of(name: &str) -> Option<NodeKind> {
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
    let children = walk(root, "", cap, &mut count, &mut truncated)?;
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
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cargo test workspace::`
Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri/src/workspace.rs app/src-tauri/src/lib.rs
git commit -m "feat(core): add folder tree with limits and persistent collection records"
```

---

### Task 7: State, commands, `folio://` images and wiring

**Files:**
- Create: `app/src-tauri/src/state.rs`, `app/src-tauri/src/commands.rs`, `app/src-tauri/src/asset.rs`
- Modify: `app/src-tauri/src/lib.rs` (full replacement below)
- Modify: `app/src-tauri/tauri.conf.json` (add `bundle.resources`)

**Interfaces:**
- Consumes: Tasks 2–6.
- Produces the Tauri commands, which the screens call through `invoke` with camelCase arguments:
  - `list_collections() -> Collection[]`
  - `pick_folder() -> Collection | null`
  - `get_tree({ collectionId }) -> Tree`
  - `read_document({ collectionId, path }) -> DocumentText`
  - `load_library() -> { library, reset }`
  - `save_library({ library }) -> null`
- Also produces image URLs: `http://folio.localhost/<id>/<percent-encoded path>` on Windows, `folio://localhost/<id>/<percent-encoded path>` elsewhere. Only image extensions are served.
- `pub struct AppState`, with `AppState::new(data_dir, collections, loaded)`, `root_of(&str)`, `add_collection(Collection)` and `persist_collections()`.

- [ ] **Step 1: Write the failing tests**

`app/src-tauri/src/state.rs`:
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::errors::AppError;

    fn state(dir: &std::path::Path) -> AppState {
        AppState::new(dir.to_path_buf(), vec![], LoadResult::fresh())
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
    fn persisted_collections_survive_a_reload() {
        let d = tempfile::tempdir().unwrap();
        let s = state(d.path());
        s.add_collection(Collection::new(d.path().join("wiki")));
        s.persist_collections().unwrap();
        let lib = crate::library::load(d.path()).unwrap().library;
        assert_eq!(crate::workspace::collections_from_library(&lib).len(), 1);
    }
}
```

`app/src-tauri/src/asset.rs`:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_splits_collection_and_path() {
        assert_eq!(
            parse_asset_path("/abc123/Images/a.svg"),
            Some(("abc123".to_string(), "Images/a.svg".to_string()))
        );
    }

    #[test]
    fn parse_decodes_percent_encoding() {
        assert_eq!(
            parse_asset_path("/abc/My%20Notes/Caf%C3%A9%20%231.png"),
            Some(("abc".to_string(), "My Notes/Café #1.png".to_string()))
        );
    }

    #[test]
    fn parse_rejects_missing_parts() {
        assert_eq!(parse_asset_path("/abc"), None);
        assert_eq!(parse_asset_path("/abc/"), None);
    }

    #[test]
    fn only_images_have_a_mime_type() {
        assert_eq!(mime_for("a/B.SVG"), Some("image/svg+xml"));
        assert_eq!(mime_for("a/b.jpeg"), Some("image/jpeg"));
        assert_eq!(mime_for("notes.md"), None);
    }
}
```

Replace `app/src-tauri/src/lib.rs` with:
```rust
pub mod asset;
pub mod commands;
pub mod errors;
pub mod library;
pub mod paths;
pub mod reader;
pub mod state;
pub mod workspace;

use tauri::{path::BaseDirectory, Manager};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let loaded = library::load(&data_dir).unwrap_or_else(|_| library::LoadResult::fresh());
            let mut collections = workspace::collections_from_library(&loaded.library);
            if let Ok(root) = app.path().resolve("sample-wiki", BaseDirectory::Resource) {
                collections.insert(0, workspace::Collection {
                    id: workspace::SAMPLE_ID.into(),
                    name: "Sample library".into(),
                    root,
                    available: true,
                });
            }
            app.manage(state::AppState::new(data_dir, collections, loaded));
            Ok(())
        })
        .register_uri_scheme_protocol("folio", |ctx, request| asset::respond(ctx.app_handle(), &request))
        .invoke_handler(tauri::generate_handler![
            commands::list_collections,
            commands::pick_folder,
            commands::get_tree,
            commands::read_document,
            commands::load_library,
            commands::save_library,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Folio");
}
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cargo test state:: asset::`
Expected: compile errors `cannot find type AppState` and `cannot find function parse_asset_path`. `commands.rs` doesn't exist yet either.

- [ ] **Step 3: Implement**

Put this above the tests in `app/src-tauri/src/state.rs`:
```rust
use crate::{
    errors::AppError,
    library::{self, LoadResult},
    workspace::{collections_to_json, Collection},
};
use std::{path::PathBuf, sync::Mutex};

pub struct AppState {
    pub data_dir: PathBuf,
    pub collections: Mutex<Vec<Collection>>,
    /// The library as read at start-up, handed to the screens once so a reset is reported exactly once.
    pub initial_load: Mutex<Option<LoadResult>>,
}

impl AppState {
    pub fn new(data_dir: PathBuf, collections: Vec<Collection>, loaded: LoadResult) -> Self {
        AppState { data_dir, collections: Mutex::new(collections), initial_load: Mutex::new(Some(loaded)) }
    }

    pub fn root_of(&self, id: &str) -> Result<PathBuf, AppError> {
        self.collections
            .lock()
            .unwrap()
            .iter()
            .find(|c| c.id == id)
            .map(|c| c.root.clone())
            .ok_or(AppError::CollectionUnavailable)
    }

    pub fn add_collection(&self, collection: Collection) -> Collection {
        let mut cols = self.collections.lock().unwrap();
        if let Some(existing) = cols.iter().find(|c| c.id == collection.id) {
            return existing.clone();
        }
        cols.push(collection.clone());
        collection
    }

    pub fn persist_collections(&self) -> Result<(), AppError> {
        let mut lib = library::load(&self.data_dir)?.library;
        lib["collections"] = collections_to_json(&self.collections.lock().unwrap());
        library::save(&self.data_dir, &lib)
    }
}
```

Put this above the tests in `app/src-tauri/src/asset.rs`:
```rust
use crate::{errors::AppError, paths, state::AppState};
use percent_encoding::percent_decode_str;
use std::borrow::Cow;
use tauri::{
    http::{header::CONTENT_TYPE, Request, Response, StatusCode},
    AppHandle, Manager, Runtime,
};

/// "/<collection-id>/<percent-encoded relative path>" -> (id, decoded path)
pub fn parse_asset_path(path: &str) -> Option<(String, String)> {
    let decoded = percent_decode_str(path.trim_start_matches('/')).decode_utf8().ok()?;
    let (id, rel) = decoded.split_once('/')?;
    if id.is_empty() || rel.is_empty() {
        return None;
    }
    Some((id.to_string(), rel.to_string()))
}

pub fn mime_for(path: &str) -> Option<&'static str> {
    let ext = path.rsplit_once('.')?.1.to_ascii_lowercase();
    match ext.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"),
        _ => None,
    }
}

/// Serves images from opened collections. Goes through the same path guard as documents.
pub fn respond<R: Runtime>(app: &AppHandle<R>, request: &Request<Vec<u8>>) -> Response<Cow<'static, [u8]>> {
    let not_found = || Response::builder().status(StatusCode::NOT_FOUND).body(Cow::Borrowed(&[][..])).unwrap();
    let Some((id, rel)) = parse_asset_path(request.uri().path()) else { return not_found() };
    let Some(mime) = mime_for(&rel) else { return not_found() };
    let state = app.state::<AppState>();
    let bytes = state
        .root_of(&id)
        .and_then(|root| paths::resolve(&root, &rel))
        .and_then(|full| std::fs::read(full).map_err(AppError::from_io));
    match bytes {
        Ok(b) => Response::builder().header(CONTENT_TYPE, mime).body(Cow::Owned(b)).unwrap(),
        Err(_) => not_found(),
    }
}
```

Create `app/src-tauri/src/commands.rs`:
```rust
use crate::{
    errors::AppError,
    library::{self, LoadResult},
    paths,
    reader::{self, DocumentText},
    state::AppState,
    workspace::{self, collections_to_json, Collection, Tree},
};
use serde_json::Value;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn list_collections(state: State<'_, AppState>) -> Vec<Collection> {
    state
        .collections
        .lock()
        .unwrap()
        .iter()
        .cloned()
        .map(|mut c| {
            c.available = c.root.is_dir();
            c
        })
        .collect()
}

/// Async so the blocking system dialog never runs on the main thread.
#[tauri::command]
pub async fn pick_folder(app: AppHandle, state: State<'_, AppState>) -> Result<Option<Collection>, AppError> {
    let Some(picked) = app.dialog().file().blocking_pick_folder() else { return Ok(None) };
    let root = picked.into_path().map_err(|e| AppError::Internal(e.to_string()))?;
    let root = dunce::canonicalize(root)?;
    let collection = state.add_collection(Collection::new(root));
    state.persist_collections()?;
    Ok(Some(collection))
}

#[tauri::command]
pub fn get_tree(state: State<'_, AppState>, collection_id: String) -> Result<Tree, AppError> {
    workspace::build_tree(&state.root_of(&collection_id)?)
}

#[tauri::command]
pub fn read_document(state: State<'_, AppState>, collection_id: String, path: String) -> Result<DocumentText, AppError> {
    let root = state.root_of(&collection_id)?;
    reader::read_text(&paths::resolve(&root, &path)?)
}

#[tauri::command]
pub fn load_library(state: State<'_, AppState>) -> Result<LoadResult, AppError> {
    if let Some(first) = state.initial_load.lock().unwrap().take() {
        return Ok(first);
    }
    library::load(&state.data_dir)
}

/// The core owns the `collections` key; whatever the screens send for it is replaced.
#[tauri::command]
pub fn save_library(state: State<'_, AppState>, library: Value) -> Result<(), AppError> {
    let mut lib = library;
    if !lib.is_object() {
        return Err(AppError::Internal("library must be a JSON object".into()));
    }
    lib["collections"] = collections_to_json(&state.collections.lock().unwrap());
    library::save(&state.data_dir, &lib)
}
```

In `app/src-tauri/tauri.conf.json`, add this inside `"bundle"`:
```json
"resources": { "../tests/fixtures/sample-wiki/": "sample-wiki/" }
```

Then create an empty placeholder so the build resolves the folder (Task 9 fills it):

Run in `app/`: `mkdir -p tests/fixtures/sample-wiki && touch tests/fixtures/sample-wiki/.keep`

- [ ] **Step 4: Run the tests and confirm everything passes**

Run in `app/src-tauri/`: `cargo test`
Expected: all tests pass: 35 on macOS and Linux (`errors` 3, `paths` 7, `reader` 7, `library` 5, `workspace` 6, `state` 3, `asset` 4), or 34 on Windows, where the symlink test doesn't run. Check the total in the actual output and make sure there are no failures.

- [ ] **Step 5: Smoke-run the app**

Run in `app/`: `npm run tauri dev`
Expected: a window titled "Folio" shows the placeholder heading, and the terminal shows no Rust panic. Close the window.

- [ ] **Step 6: Commit**

```bash
git add app
git commit -m "feat(core): wire commands, app state and folio:// image protocol"
```

---

### Task 8: Read-only build check

**Files:**
- Create: `app/scripts/check-readonly.mjs`, `app/scripts/check-readonly.test.mjs`

**Interfaces:**
- Produces: `findWrites(fileName: string, source: string): string[]`, exported from `check-readonly.mjs`. The script also runs as a CLI that exits with code 1 if any write call is found outside `library.rs`.

- [ ] **Step 1: Write the failing test.** Create `app/scripts/check-readonly.test.mjs`:

```js
import { describe, expect, it } from 'vitest';
import { findWrites } from './check-readonly.mjs';

describe('read-only check', () => {
  it('flags write calls in core modules', () => {
    const hits = findWrites('reader.rs', 'fn x() {\n    std::fs::write(p, b)?;\n}\n');
    expect(hits).toEqual(['reader.rs:2: std::fs::write(p, b)?;']);
  });

  it('flags OpenOptions, File::create, rename and remove', () => {
    const src = 'OpenOptions::new()\nFile::create(p)\nfs::rename(a, b)\nfs::remove_file(p)';
    expect(findWrites('paths.rs', src)).toHaveLength(4);
  });

  it('allows the library store', () => {
    expect(findWrites('library.rs', 'fs::write(&temp, bytes)?;')).toEqual([]);
  });

  it('ignores test modules', () => {
    const src = 'fn read() {}\n#[cfg(test)]\nmod tests { fn f() { fs::write(p, b).unwrap(); } }';
    expect(findWrites('reader.rs', src)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run in `app/`: `npx vitest run scripts`
Expected: FAIL, `Failed to load url ./check-readonly.mjs`.

- [ ] **Step 3: Implement.** Create `app/scripts/check-readonly.mjs`:

```js
// Fails the build if file-writing code appears outside the library store (spec §6.1.2).
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const WRITE_PATTERNS = [
  /\bfs::write\b/, /\bFile::create\b/, /\bOpenOptions\b/, /\bfs::rename\b/,
  /\bfs::remove_(file|dir|dir_all)\b/, /\bfs::create_dir(_all)?\b/, /\bfs::copy\b/,
  /\bset_permissions\b/, /\bset_len\b/,
];
export const ALLOWED_FILES = new Set(['library.rs']);

export function findWrites(fileName, source) {
  if (ALLOWED_FILES.has(fileName)) return [];
  const production = source.split(/^#\[cfg\(test\)\]/m)[0]; // test fixtures may write temp files
  return production.split('\n').flatMap((line, i) =>
    WRITE_PATTERNS.some((p) => p.test(line)) ? [`${fileName}:${i + 1}: ${line.trim()}`] : []);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = new URL('../src-tauri/src/', import.meta.url);
  const hits = readdirSync(dir)
    .filter((f) => f.endsWith('.rs'))
    .flatMap((f) => findWrites(f, readFileSync(new URL(f, dir), 'utf8')));
  if (hits.length) {
    console.error('Write calls found outside library.rs. Folio must stay read-only:\n' + hits.join('\n'));
    process.exit(1);
  }
  console.log('Read-only check passed.');
}
```

- [ ] **Step 4: Run the tests and the check against the real core**

Run in `app/`: `npx vitest run scripts && npm run check:readonly`
Expected: `4 passed`, then `Read-only check passed.`

- [ ] **Step 5: Commit**

```bash
git add app/scripts
git commit -m "feat(ci): add read-only enforcement check for the Rust core"
```

---

### Task 9: Sample library as real files

**Files:**
- Create: `app/scripts/extract-sample-wiki.mjs`
- Create (generated): `app/tests/fixtures/sample-wiki/**` (8 Markdown files and 2 SVG images)
- Delete: `app/tests/fixtures/sample-wiki/.keep`

**Interfaces:**
- Produces: `tests/fixtures/sample-wiki/` with `README.md`, `Getting-Started.md`, `Guides/{Introduction,Security,Troubleshooting}.md`, `Technical/{Architecture,Diagrams}.md`, `References/Glossary.md` and `Images/{architecture,workflow}.svg`. Image links in the Markdown point at `.svg`. Tasks 10, 11 and 12 read these files, and the app bundles them.

- [ ] **Step 1: Write the extraction script.** Create `app/scripts/extract-sample-wiki.mjs`:

```js
// One-off: copies the prototype's sample library out of /index.html into real files.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const outDir = new URL('../tests/fixtures/sample-wiki/', import.meta.url);
const write = (rel, body) => {
  const file = fileURLToPath(new URL(rel, outDir));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
};

const blocks = [...html.matchAll(/<script type="text\/markdown" data-col="sample" data-path="([^"]+)" data-modified="[^"]*">\r?\n([\s\S]*?)<\/script>/g)];
for (const [, path, body] of blocks) write(path, body.replace(/\.png\)/g, '.svg)').trimEnd() + '\n');

const TXT = 'font-family="Figtree, Segoe UI, sans-serif"';
for (const name of ['architecture', 'workflow']) {
  const m = html.match(new RegExp(`'Images/${name}\\.png': \`([\\s\\S]*?)\`,`));
  if (!m) throw new Error(`Image ${name} not found in index.html`);
  write(`Images/${name}.svg`, m[1].replaceAll('${TXT}', TXT) + '\n');
}
rmSync(new URL('.keep', outDir), { force: true });
console.log(`Wrote ${blocks.length} documents and 2 images.`);
```

- [ ] **Step 2: Run it**

Run in `app/`: `node scripts/extract-sample-wiki.mjs`
Expected: `Wrote 8 documents and 2 images.`

- [ ] **Step 3: Verify the output**

Run in `app/`: `grep -rn "\.png" tests/fixtures/sample-wiki || echo "no png references"` and `head -3 tests/fixtures/sample-wiki/Images/architecture.svg`
Expected: `no png references`, and the SVG starts with `<svg xmlns="http://www.w3.org/2000/svg"`. It must not contain `${TXT}`.

- [ ] **Step 4: Commit**

```bash
git add app/scripts/extract-sample-wiki.mjs app/tests/fixtures
git commit -m "feat(content): ship the prototype sample library as real Markdown and SVG files"
```

---

### Task 10: Formatting steps part 1 (frontmatter, slugs, parser, sanitizer)

**Files:**
- Create: `app/src/lib/markdown/frontmatter.ts`, `slug.ts`, `parser.ts`, `sanitize.ts`
- Test: `app/src/lib/markdown/frontmatter.test.ts`, `slug.test.ts`, `parser.test.ts`, `sanitize.test.ts`

**Interfaces:**
- Produces:
  - `type Frontmatter = Record<string, string | string[]>` and `splitFrontmatter(text: string): { frontmatter: Frontmatter; body: string }`
  - `slugify(text: string): string`, `uniqueSlugger(): (text: string) => string` and `friendlyName(path: string): string`
  - `toHtml(markdown: string): string`, which emits `<a href="#" data-wiki="Target#Section">label</a>`, `<span class="math" data-tex="…">` and `<div class="math math-block" data-tex="…">`
  - `sanitize(html: string): string`

- [ ] **Step 1: Write the failing tests**

`app/src/lib/markdown/frontmatter.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { splitFrontmatter } from './frontmatter';

describe('splitFrontmatter', () => {
  it('parses scalars and lists, and returns the body', () => {
    const { frontmatter, body } = splitFrontmatter('---\ntitle: "Hello"\ntags: [a, b]\n---\n# Body\n');
    expect(frontmatter).toEqual({ title: 'Hello', tags: ['a', 'b'] });
    expect(body).toBe('# Body\n');
  });

  it('handles Windows line endings', () => {
    expect(splitFrontmatter('---\r\nauthor: Priya\r\n---\r\nText').frontmatter).toEqual({ author: 'Priya' });
  });

  it('leaves documents without frontmatter untouched', () => {
    expect(splitFrontmatter('# Just text')).toEqual({ frontmatter: {}, body: '# Just text' });
  });
});
```

`app/src/lib/markdown/slug.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { friendlyName, slugify, uniqueSlugger } from './slug';

describe('slugs', () => {
  it('matches the prototype rules', () => {
    expect(slugify("Wi-Fi won't connect")).toBe('wi-fi-wont-connect');
    expect(slugify('Café & Co')).toBe('café-co');
  });

  it('numbers repeated headings', () => {
    const next = uniqueSlugger();
    expect([next('Notes'), next('Notes'), next('Notes')]).toEqual(['notes', 'notes-1', 'notes-2']);
  });

  it('turns file paths into readable names', () => {
    expect(friendlyName('Guides/Getting-Started.md')).toBe('Getting Started');
  });
});
```

`app/src/lib/markdown/parser.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { toHtml } from './parser';

describe('toHtml', () => {
  it('renders GitHub-flavored tables and task lists', () => {
    const html = toHtml('| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n');
    expect(html).toContain('<table>');
    expect(html).toContain('type="checkbox"');
  });

  it('renders wiki links with optional labels', () => {
    expect(toHtml('See [[Security]].')).toContain('<a href="#" data-wiki="Security">Security</a>');
    expect(toHtml('[[Troubleshooting#Wi-Fi|help]]')).toContain('data-wiki="Troubleshooting#Wi-Fi">help</a>');
  });

  it('marks inline and block maths without touching dollar amounts', () => {
    expect(toHtml('Area $a^2$ here.')).toContain('<span class="math" data-tex="a^2">');
    expect(toHtml('$$\nS = n \\times d\n$$\n')).toContain('class="math math-block" data-tex="S = n \\times d"');
    expect(toHtml('It costs $5 and $10.')).not.toContain('class="math"');
  });
});
```

`app/src/lib/markdown/sanitize.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { sanitize } from './sanitize';

describe('sanitize', () => {
  it.each([
    ['<p>a</p><script>alert(1)</script>', '<script'],
    ['<img src="x" onerror="alert(1)">', 'onerror'],
    ['<a href="javascript:alert(1)">x</a>', 'javascript:'],
    ['<iframe src="https://evil.example"></iframe>', '<iframe'],
    ['<form action="https://evil.example"><input></form>', '<form'],
    ['<svg><script>alert(1)</script></svg>', '<script'],
    ['<p style="position:fixed;inset:0">cover</p>', 'style='],
    ['<object data="x.swf"></object>', '<object'],
  ])('removes %s', (input, forbidden) => {
    expect(sanitize(input)).not.toContain(forbidden);
  });

  it('keeps safe formatting and data attributes', () => {
    const out = sanitize('<p><strong>b</strong> <kbd>L</kbd> <a href="#" data-wiki="X">x</a></p>');
    expect(out).toContain('<strong>b</strong>');
    expect(out).toContain('<kbd>L</kbd>');
    expect(out).toContain('data-wiki="X"');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run in `app/`: `npx vitest run src/lib/markdown`
Expected: FAIL. The four test files can't load their modules.

- [ ] **Step 3: Implement**

`app/src/lib/markdown/frontmatter.ts`:
```ts
export type Frontmatter = Record<string, string | string[]>;

const unquote = (s: string) => s.replace(/^["']|["']$/g, '');

export function splitFrontmatter(text: string): { frontmatter: Frontmatter; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { frontmatter: {}, body: text };
  const frontmatter: Frontmatter = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const raw = kv[2].trim();
    frontmatter[kv[1]] = /^\[.*\]$/.test(raw)
      ? raw.slice(1, -1).split(',').map((x) => unquote(x.trim())).filter(Boolean)
      : unquote(raw);
  }
  return { frontmatter, body: text.slice(m[0].length) };
}
```

`app/src/lib/markdown/slug.ts`:
```ts
export const slugify = (text: string) =>
  text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-');

export function uniqueSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text) => {
    const base = slugify(text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };
}

export const friendlyName = (path: string) =>
  (path.split('/').pop() ?? path).replace(/\.(md|markdown|txt)$/i, '').replace(/[-_]+/g, ' ');
```

`app/src/lib/markdown/parser.ts`:
```ts
import { Marked, type TokenizerAndRendererExtension } from 'marked';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const startAt = (needle: string) => (src: string) => {
  const i = src.indexOf(needle);
  return i < 0 ? undefined : i;
};

const wiki: TokenizerAndRendererExtension = {
  name: 'wiki',
  level: 'inline',
  start: startAt('[['),
  tokenizer(src) {
    const m = /^\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/.exec(src);
    return m ? { type: 'wiki', raw: m[0], target: m[1].trim(), label: (m[2] ?? m[1]).trim() } : undefined;
  },
  renderer: (t) => `<a href="#" data-wiki="${esc(t.target)}">${esc(t.label)}</a>`,
};

const mathBlock: TokenizerAndRendererExtension = {
  name: 'mathBlock',
  level: 'block',
  start: startAt('$$'),
  tokenizer(src) {
    const m = /^\$\$[^\S\n]*\n?([\s\S]+?)\n?[^\S\n]*\$\$[^\S\n]*(?:\n+|$)/.exec(src);
    return m ? { type: 'mathBlock', raw: m[0], text: m[1].trim() } : undefined;
  },
  renderer: (t) => `<div class="math math-block" data-tex="${esc(t.text)}">${esc(t.text)}</div>`,
};

const mathInline: TokenizerAndRendererExtension = {
  name: 'mathInline',
  level: 'inline',
  start: startAt('$'),
  tokenizer(src) {
    // No space just inside the dollars, and no digit right after the closing one: "$5 and $10" stays text.
    const m = /^\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/.exec(src);
    return m ? { type: 'mathInline', raw: m[0], text: m[1] } : undefined;
  },
  renderer: (t) => `<span class="math" data-tex="${esc(t.text)}">${esc(t.text)}</span>`,
};

const marked = new Marked({ gfm: true }, { extensions: [wiki, mathBlock, mathInline] });

export const toHtml = (markdown: string): string => marked.parse(markdown, { async: false }) as string;
```

`app/src/lib/markdown/sanitize.ts`:
```ts
import DOMPurify from 'dompurify';

/** Documents are untrusted. Removes scripts, event handlers, unsafe URLs, frames, forms and inline styles. */
export function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOW_DATA_ATTR: true,
    FORBID_TAGS: ['style', 'form', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['style'],
  });
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/lib/markdown`
Expected: all tests in the four files pass, 18 tests in total.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/markdown
git commit -m "feat(render): add frontmatter, slugs, Markdown parser with wiki/math, and sanitizer"
```

---

### Task 11: Formatting steps part 2 (links, enhancement, full render)

**Files:**
- Create: `app/src/lib/markdown/links.ts`, `enhance.ts`, `render.ts`
- Test: `app/src/lib/markdown/links.test.ts`, `app/src/lib/markdown/render.test.ts`

**Interfaces:**
- Consumes: Task 10 modules; KaTeX; the fixture files from Task 9.
- Produces:
  - `type LinkTarget = { kind: 'external'; url } | { kind: 'anchor'; slug } | { kind: 'internal'; path; slug } | { kind: 'broken'; target } | { kind: 'refused'; url }`
  - `fileIndex(paths: Iterable<string>): FileIndex`, where `has(path)` returns the real path, matched case-insensitively, or `null`
  - `resolvePath(from: string, rel: string): string`, `classifyLink(href, from, files): LinkTarget` and `resolveWiki(name, paths): string | null`
  - `interface EnhanceContext { collectionId: string; path: string; files: string[]; assetUrl(collectionId: string, path: string): string }` and `enhance(article: HTMLElement, ctx: EnhanceContext): void`
  - `renderDocument(text: string, ctx: EnhanceContext, doc?: Document): { article: HTMLElement; frontmatter: Frontmatter; title: string }`
  - Links in the output carry `data-kind` plus `data-path`/`data-slug`, `data-url` or `data-target`. Headings carry `data-slug`. Remote images become `figure.remote-img[data-src]`. Diagrams become `figure.diagram[data-src]`.

- [ ] **Step 1: Write the failing tests**

`app/src/lib/markdown/links.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { classifyLink, fileIndex, resolvePath, resolveWiki } from './links';

const paths = ['README.md', 'Getting-Started.md', 'Guides/Security.md', 'My Notes.md', 'Docs/README.md', 'Images/a.svg'];
const files = fileIndex(paths);

describe('resolvePath', () => {
  it('resolves relative to the current document', () => {
    expect(resolvePath('Guides/Security.md', '../Images/a.svg')).toBe('Images/a.svg');
    expect(resolvePath('Guides/Security.md', 'Troubleshooting.md')).toBe('Guides/Troubleshooting.md');
    expect(resolvePath('Guides/Security.md', '/README.md')).toBe('README.md');
  });
});

describe('classifyLink', () => {
  it('recognises website, email and in-page links', () => {
    expect(classifyLink('https://example.org', 'README.md', files)).toEqual({ kind: 'external', url: 'https://example.org' });
    expect(classifyLink('mailto:desk@example.org', 'README.md', files).kind).toBe('external');
    expect(classifyLink('#remote-images', 'README.md', files)).toEqual({ kind: 'anchor', slug: 'remote-images' });
  });

  it('opens pages linked Windows-style, in another case, encoded, or without an extension', () => {
    expect(classifyLink('Guides\\Security.md', 'README.md', files)).toEqual({ kind: 'internal', path: 'Guides/Security.md', slug: '' });
    expect(classifyLink('guides/security.md#passwords', 'README.md', files)).toEqual({ kind: 'internal', path: 'Guides/Security.md', slug: 'passwords' });
    expect(classifyLink('My%20Notes.md', 'README.md', files)).toEqual({ kind: 'internal', path: 'My Notes.md', slug: '' });
    expect(classifyLink('Getting-Started', 'README.md', files)).toEqual({ kind: 'internal', path: 'Getting-Started.md', slug: '' });
    expect(classifyLink('Docs/', 'README.md', files)).toEqual({ kind: 'internal', path: 'Docs/README.md', slug: '' });
  });

  it('marks missing pages and refuses other link types', () => {
    expect(classifyLink('Network-Setup.md', 'Guides/Security.md', files)).toEqual({ kind: 'broken', target: 'Network-Setup.md' });
    expect(classifyLink('file:///C:/secret.md', 'README.md', files)).toEqual({ kind: 'refused', url: 'file:///C:/secret.md' });
    expect(classifyLink('%E0%A4%A', 'README.md', files).kind).toBe('broken');
  });
});

describe('resolveWiki', () => {
  it('matches file names loosely', () => {
    expect(resolveWiki('getting started', paths)).toBe('Getting-Started.md');
    expect(resolveWiki('Security', paths)).toBe('Guides/Security.md');
    expect(resolveWiki('Printer Manual', paths)).toBeNull();
  });
});
```

`app/src/lib/markdown/render.test.ts`:
```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderDocument } from './render';

const root = fileURLToPath(new URL('../../../tests/fixtures/sample-wiki/', import.meta.url));
const list = (dir: string, prefix = ''): string[] =>
  readdirSync(dir).flatMap((name) => {
    const rel = prefix + name;
    return statSync(dir + name).isDirectory() ? list(`${dir}${name}/`, `${rel}/`) : [rel];
  });

let files: string[];
beforeAll(() => { files = list(root); });

const render = (path: string, assetUrl = (c: string, p: string) => `folio://localhost/${c}/${p}`) =>
  renderDocument(readFileSync(root + path, 'utf8'), { collectionId: 'sample', path, files, assetUrl });

describe('renderDocument on the sample library', () => {
  it('uses the frontmatter title and parses tags', () => {
    const r = render('README.md');
    expect(r.title).toBe('Welcome to the Library Handbook');
    expect(r.frontmatter.tags).toEqual(['handbook', 'start-here']);
  });

  it('resolves wiki links, including ones with a section', () => {
    const intro = render('README.md').article.querySelector('a[data-path="Guides/Introduction.md"]');
    expect(intro?.textContent).toBe('Introduction');
    const wifi = render('References/Glossary.md').article.querySelector('a[data-path="Guides/Troubleshooting.md"][data-slug="wi-fi-wont-connect"]');
    expect(wifi?.textContent).toContain('Wi-Fi troubleshooting');
  });

  it('flags exactly the two deliberately broken links', () => {
    const broken = [...render('Guides/Troubleshooting.md').article.querySelectorAll<HTMLElement>('a.broken')].map((a) => a.dataset.target);
    expect(broken).toEqual(['Network-Setup.md', 'Printer Manual']);
  });

  it('turns all five callout types into notes', () => {
    const kinds = [...render('Getting-Started.md').article.querySelectorAll('aside.callout')].map((a) => a.className);
    expect(kinds).toEqual(['callout callout-note', 'callout callout-tip', 'callout callout-important', 'callout callout-warning', 'callout callout-caution']);
  });

  it('gives headings stable slugs', () => {
    expect(render('README.md').article.querySelector('h2[data-slug="whats-inside"]')).not.toBeNull();
  });

  it('serves local images through the asset URL and renders maths', () => {
    const assetUrl = vi.fn((c: string, p: string) => `folio://localhost/${c}/${p}`);
    const { article } = render('Technical/Architecture.md', assetUrl);
    expect(assetUrl).toHaveBeenCalledWith('sample', 'Images/architecture.svg');
    expect(article.querySelectorAll('math').length).toBeGreaterThanOrEqual(4);
  });

  it('holds back internet pictures behind a placeholder', () => {
    const { article } = render('Guides/Introduction.md');
    const fig = article.querySelector<HTMLElement>('figure.remote-img');
    expect(fig?.dataset.src).toBe('https://images.example.org/elm-street/reading-room.jpg');
    expect(fig?.textContent).toContain('images.example.org');
    expect(article.querySelector('img[src^="http"]')).toBeNull();
  });

  it('keeps diagram source for later drawing', () => {
    const figs = render('Technical/Diagrams.md').article.querySelectorAll<HTMLElement>('figure.diagram');
    expect(figs).toHaveLength(2);
    expect(figs[0].dataset.src).toContain('flowchart TD');
  });

  it('marks website links as external', () => {
    const a = render('README.md').article.querySelector<HTMLElement>('a[data-kind="external"]');
    expect(a?.dataset.url).toBe('https://www.example.org/library');
  });

  it('neutralises javascript links and inline scripts', () => {
    const { article } = renderDocument('[x](javascript:alert(1)) <img src=x onerror=alert(1)>', { collectionId: 's', path: 'a.md', files: [], assetUrl: () => '' });
    expect(article.innerHTML).not.toContain('javascript:');
    expect(article.innerHTML).not.toContain('onerror');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/lib/markdown/links.test.ts src/lib/markdown/render.test.ts`
Expected: FAIL. The `./links` and `./render` modules can't be loaded.

- [ ] **Step 3: Implement**

`app/src/lib/markdown/links.ts`:
```ts
export type LinkTarget =
  | { kind: 'external'; url: string }
  | { kind: 'anchor'; slug: string }
  | { kind: 'internal'; path: string; slug: string }
  | { kind: 'broken'; target: string }
  | { kind: 'refused'; url: string };

export interface FileIndex { has(path: string): string | null }

export function fileIndex(paths: Iterable<string>): FileIndex {
  const byLower = new Map<string, string>();
  for (const p of paths) byLower.set(p.toLowerCase(), p);
  return { has: (p) => byLower.get(p.toLowerCase()) ?? null };
}

export const safeDecode = (s: string) => {
  try { return decodeURIComponent(s); } catch { return s; }
};

export function resolvePath(from: string, rel: string): string {
  const parts = rel.startsWith('/') ? [] : from.split('/').slice(0, -1);
  for (const seg of rel.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop(); else parts.push(seg);
  }
  return parts.join('/');
}

export function classifyLink(href: string, from: string, files: FileIndex): LinkTarget {
  if (/^(https?:|mailto:)/i.test(href)) return { kind: 'external', url: href };
  if (href.startsWith('#')) return { kind: 'anchor', slug: safeDecode(href.slice(1)) };
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { kind: 'refused', url: href };
  const [rawPath, hash = ''] = href.split('#');
  const rel = safeDecode(rawPath).replace(/\\/g, '/');
  const target = resolvePath(from, rel);
  const found = files.has(target) ?? files.has(`${target}.md`) ?? files.has(`${target}/README.md`) ?? files.has(`${target}/index.md`);
  return found ? { kind: 'internal', path: found, slug: safeDecode(hash) } : { kind: 'broken', target: rel || href };
}

const norm = (s: string) => s.toLowerCase().replace(/\.(md|markdown|txt)$/, '').replace(/[-_\s]+/g, ' ').trim();

/** Wiki names match a document's file name or path. Plan 3 adds matching by title once the search index knows titles. */
export function resolveWiki(name: string, paths: Iterable<string>): string | null {
  const wanted = norm(name);
  for (const p of paths) {
    if (!/\.(md|markdown|txt)$/i.test(p)) continue;
    if (norm(p.split('/').pop()!) === wanted || norm(p) === wanted) return p;
  }
  return null;
}
```

`app/src/lib/markdown/enhance.ts`:
```ts
import katex from 'katex';
import { classifyLink, fileIndex, resolvePath, resolveWiki, safeDecode, type LinkTarget } from './links';
import { slugify, uniqueSlugger } from './slug';

export interface EnhanceContext {
  collectionId: string;
  path: string;
  files: string[];
  assetUrl(collectionId: string, path: string): string;
}

const CALLOUTS: Record<string, string> = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' };

export function enhance(article: HTMLElement, ctx: EnhanceContext): void {
  callouts(article);
  headings(article);
  links(article, ctx);
  images(article, ctx);
  tables(article);
  codeBlocks(article);
  maths(article);
}

function el<K extends keyof HTMLElementTagNameMap>(article: HTMLElement, tag: K, className = '', text = '') {
  const node = article.ownerDocument.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function callouts(article: HTMLElement) {
  for (const quote of [...article.querySelectorAll('blockquote')]) {
    const p = quote.firstElementChild;
    const first = p?.tagName === 'P' ? p.firstChild : null;
    const m = first?.nodeType === Node.TEXT_NODE ? /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i.exec(first.textContent ?? '') : null;
    if (!p || !first || !m) continue;
    const type = m[1].toLowerCase();
    first.textContent = (first.textContent ?? '').slice(m[0].length);
    if (!p.textContent?.trim() && !p.querySelector('*')) p.remove();
    const box = el(article, 'aside', `callout callout-${type}`);
    box.setAttribute('role', 'note');
    box.append(el(article, 'p', 'callout-title', CALLOUTS[type]), ...quote.childNodes);
    quote.replaceWith(box);
  }
}

function headings(article: HTMLElement) {
  const next = uniqueSlugger();
  for (const h of article.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')) {
    h.dataset.slug = next(h.textContent ?? '');
    h.tabIndex = -1;
  }
}

function hidden(article: HTMLElement, text: string) {
  return el(article, 'span', 'vh', text);
}

function applyLink(a: HTMLAnchorElement, t: LinkTarget, article: HTMLElement) {
  a.dataset.kind = t.kind;
  a.setAttribute('href', '#');
  switch (t.kind) {
    case 'external':
      a.dataset.url = t.url;
      a.setAttribute('href', t.url);
      a.rel = 'noopener noreferrer';
      a.append(hidden(article, ' (opens in your web browser)'));
      break;
    case 'anchor':
      a.dataset.slug = t.slug;
      break;
    case 'internal':
      a.dataset.path = t.path;
      a.dataset.slug = t.slug;
      break;
    case 'broken':
      a.dataset.target = t.target;
      a.classList.add('broken');
      a.title = 'This page can’t be found';
      a.append(hidden(article, ' (missing page)'));
      break;
    case 'refused':
      a.dataset.url = t.url;
      a.title = 'Folio only opens web and email links';
      break;
  }
}

function links(article: HTMLElement, ctx: EnhanceContext) {
  const index = fileIndex(ctx.files);
  for (const a of article.querySelectorAll('a')) {
    const wiki = a.dataset.wiki;
    const href = a.getAttribute('href');
    let target: LinkTarget;
    if (wiki) {
      const [name, section = ''] = wiki.split('#');
      const found = resolveWiki(name, ctx.files);
      target = found ? { kind: 'internal', path: found, slug: section ? slugify(section) : '' } : { kind: 'broken', target: name };
    } else if (href !== null) {
      target = classifyLink(href, ctx.path, index);
    } else {
      continue; // the sanitizer removed an unsafe href; the text stays, the link does nothing
    }
    applyLink(a, target, article);
  }
}

function images(article: HTMLElement, ctx: EnhanceContext) {
  const index = fileIndex(ctx.files);
  for (const img of [...article.querySelectorAll('img')]) {
    const src = img.getAttribute('src') ?? '';
    const alt = img.getAttribute('alt') ?? '';
    const fig = el(article, 'figure');
    if (/^https?:/i.test(src)) {
      let host = src;
      try { host = new URL(src).host; } catch { /* keep the raw address */ }
      fig.className = 'remote-img';
      fig.dataset.src = src;
      fig.dataset.alt = alt;
      fig.append(
        el(article, 'p', 'remote-title', 'Picture from the internet not shown'),
        el(article, 'p', '', alt),
        el(article, 'p', '', `It's stored on ${host}. Loading it would let that website know you are reading this page.`),
      );
    } else if (src.startsWith('data:image/')) {
      fig.append(img.cloneNode());
    } else {
      const found = index.has(resolvePath(ctx.path, safeDecode(src).replace(/\\/g, '/')));
      if (found) {
        const copy = img.cloneNode() as HTMLImageElement;
        copy.src = ctx.assetUrl(ctx.collectionId, found);
        copy.loading = 'lazy';
        fig.append(copy);
        if (alt) fig.append(el(article, 'figcaption', '', alt));
      } else {
        fig.className = 'missing-img';
        fig.append(el(article, 'p', '', `Picture not found: “${src}” isn't in this collection.`));
      }
    }
    const parent = img.parentElement;
    if (parent?.tagName === 'P' && parent.childNodes.length === 1) parent.replaceWith(fig);
    else img.replaceWith(fig);
  }
}

function tables(article: HTMLElement) {
  for (const table of [...article.querySelectorAll('table')]) {
    const wrap = el(article, 'div', 'table-wrap');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', 'Table');
    table.replaceWith(wrap);
    wrap.append(table);
  }
}

const CODE_LABELS: Record<string, string> = { yaml: 'Settings file (YAML)', json: 'Data (JSON)', bash: 'Command', powershell: 'Command' };

function codeBlocks(article: HTMLElement) {
  for (const code of [...article.querySelectorAll('pre > code')]) {
    const pre = code.parentElement!;
    const lang = /language-(\S+)/.exec(code.className)?.[1];
    if (lang === 'mermaid') {
      const src = code.textContent ?? '';
      const label = /^%%\s*(.+)$/m.exec(src)?.[1] ?? 'Diagram';
      const fig = el(article, 'figure', 'diagram');
      fig.dataset.src = src;
      const body = el(article, 'div', 'diagram-body');
      body.setAttribute('role', 'img');
      body.setAttribute('aria-label', label);
      body.append(pre.cloneNode(true)); // drawn by Mermaid in Plan 2; readable source until then
      fig.append(body, el(article, 'figcaption', '', label));
      pre.replaceWith(fig);
      continue;
    }
    const box = el(article, 'div', 'code-block');
    box.append(el(article, 'div', 'code-head', CODE_LABELS[lang ?? ''] ?? (lang ? lang.toUpperCase() : 'Text')));
    pre.replaceWith(box);
    box.append(pre);
  }
}

function maths(article: HTMLElement) {
  for (const node of article.querySelectorAll<HTMLElement>('.math')) {
    try {
      // KaTeX's own output with trust off; MathML needs no stylesheet.
      node.innerHTML = katex.renderToString(node.dataset.tex ?? '', {
        displayMode: node.classList.contains('math-block'), output: 'mathml', throwOnError: false, trust: false,
      });
    } catch {
      node.classList.add('math-error'); // the TeX source stays visible
    }
  }
}
```

`app/src/lib/markdown/render.ts`:
```ts
import { enhance, type EnhanceContext } from './enhance';
import { splitFrontmatter, type Frontmatter } from './frontmatter';
import { toHtml } from './parser';
import { sanitize } from './sanitize';
import { friendlyName } from './slug';

export type { EnhanceContext } from './enhance';

export interface Rendered { article: HTMLElement; frontmatter: Frontmatter; title: string }

export function renderDocument(text: string, ctx: EnhanceContext, doc: Document = document): Rendered {
  const { frontmatter, body } = splitFrontmatter(text);
  const article = doc.createElement('article');
  article.className = 'doc';
  article.innerHTML = sanitize(toHtml(body));
  enhance(article, ctx);
  const fmTitle = typeof frontmatter.title === 'string' ? frontmatter.title : '';
  const title = fmTitle || article.querySelector('h1')?.textContent?.trim() || friendlyName(ctx.path);
  return { article, frontmatter, title };
}
```

- [ ] **Step 4: Run all the screen tests and confirm they pass**

Run in `app/`: `npm test`
Expected: everything passes. That is smoke 1, Task 8's 4, Task 10's 18, `links` 5 and `render` 10, for 38 in total.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/markdown
git commit -m "feat(render): resolve links and images, add callouts, maths and diagram placeholders"
```

---

### Task 12: Core bridge and minimal reading shell

**Files:**
- Create: `app/src/lib/core.ts`, `app/src/lib/core.test.ts`, `app/src/TreeView.svelte`
- Modify: `app/src/App.svelte` and `app/src/styles/base.css` (full replacements)

**Interfaces:**
- Consumes: the Task 7 commands and Task 11's `renderDocument`.
- Produces, in `core.ts`, the types `Collection`, `TreeNode`, `Tree`, `DocumentText`, `LoadResult`, `AppError` and `ErrorCode`, plus:
  - `core.listCollections()`, `core.pickFolder()`, `core.getTree(id)`, `core.readDocument(id, path)`, `core.loadLibrary()`, `core.saveLibrary(lib)`
  - `assetUrl(collectionId, path, windows?)`
  - `filesOf(node): string[]`
  - `MESSAGES` and `describeError(e): string`

  Plans 2–4 build their screens on this module.

- [ ] **Step 1: Write the failing test.** Create `app/src/lib/core.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { assetUrl, describeError, filesOf, type TreeNode } from './core';

describe('assetUrl', () => {
  it('encodes spaces, accents and # per path segment', () => {
    expect(assetUrl('abc', 'My Notes/Café #1.png', false)).toBe('folio://localhost/abc/My%20Notes/Caf%C3%A9%20%231.png');
  });

  it('uses the Windows form of custom protocols', () => {
    expect(assetUrl('abc', 'Images/a.svg', true)).toBe('http://folio.localhost/abc/Images/a.svg');
  });
});

describe('describeError', () => {
  it('turns codes into the spec wording', () => {
    expect(describeError({ code: 'TooLarge' })).toBe('This file is too large to display.');
    expect(describeError({ code: 'CollectionUnavailable' })).toBe('This folder can’t be reached. It may be on a drive that isn’t connected.');
  });

  it('never shows raw error text', () => {
    expect(describeError(new Error('ENOENT: /secret/path'))).toBe('Something went wrong. Copy the details and send them to support.');
  });
});

describe('filesOf', () => {
  it('lists every file path in a tree', () => {
    const tree: TreeNode = { name: '', path: '', kind: 'folder', children: [
      { name: 'README.md', path: 'README.md', kind: 'document', children: [] },
      { name: 'Images', path: 'Images', kind: 'folder', children: [{ name: 'a.svg', path: 'Images/a.svg', kind: 'image', children: [] }] },
    ] };
    expect(filesOf(tree)).toEqual(['README.md', 'Images/a.svg']);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/lib/core.test.ts`
Expected: FAIL, `Failed to load url ./core`.

- [ ] **Step 3: Implement `core.ts`**

`app/src/lib/core.ts`:
```ts
import { invoke } from '@tauri-apps/api/core';

export type ErrorCode = 'NotFound' | 'CollectionUnavailable' | 'AccessDenied' | 'OutsideCollection' | 'TooLarge' | 'NotText' | 'Internal';
export interface AppError { code: ErrorCode; details?: string }
export interface Collection { id: string; name: string; root: string; available: boolean }
export interface TreeNode { name: string; path: string; kind: 'folder' | 'document' | 'image'; children: TreeNode[] }
export interface Tree { root: TreeNode; truncated: boolean }
export interface DocumentText { text: string; size: number; modifiedMs: number | null; lossy: boolean }
export interface LoadResult { library: Record<string, unknown>; reset: boolean }

export const core = {
  listCollections: () => invoke<Collection[]>('list_collections'),
  pickFolder: () => invoke<Collection | null>('pick_folder'),
  getTree: (collectionId: string) => invoke<Tree>('get_tree', { collectionId }),
  readDocument: (collectionId: string, path: string) => invoke<DocumentText>('read_document', { collectionId, path }),
  loadLibrary: () => invoke<LoadResult>('load_library'),
  saveLibrary: (library: Record<string, unknown>) => invoke<void>('save_library', { library }),
};

const isWindows = () => typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows');

export function assetUrl(collectionId: string, path: string, windows = isWindows()): string {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return windows ? `http://folio.localhost/${collectionId}/${encoded}` : `folio://localhost/${collectionId}/${encoded}`;
}

export function filesOf(node: TreeNode): string[] {
  return node.children.flatMap((c) => (c.kind === 'folder' ? filesOf(c) : [c.path]));
}

/** Spec §5 wording, verbatim. */
export const MESSAGES = {
  NotFound: 'This document was moved or deleted.',
  CollectionUnavailable: 'This folder can’t be reached. It may be on a drive that isn’t connected.',
  AccessDenied: 'Folio isn’t allowed to read this file.',
  OutsideCollection: 'This link points outside the folder you opened, so Folio won’t open it.',
  TooLarge: 'This file is too large to display.',
  NotText: 'This file isn’t a text document.',
  Internal: 'Something went wrong. Copy the details and send them to support.',
  TreeTruncated: 'Only the first 20,000 files are shown.',
  LibraryReset: 'Your saved settings couldn’t be read, so Folio started fresh. A copy was kept.',
  Lossy: 'Some characters in this document may not display correctly.',
} as const;

export function describeError(e: unknown): string {
  const code = (e as Partial<AppError> | null)?.code;
  return code && code in MESSAGES ? MESSAGES[code] : MESSAGES.Internal;
}
```

Run: `npx vitest run src/lib/core.test.ts`
Expected: `5 passed`.

- [ ] **Step 4: Build the shell**

`app/src/TreeView.svelte`:
```svelte
<script lang="ts">
  import type { TreeNode } from './lib/core';
  import Self from './TreeView.svelte';

  let { nodes, current, onopen }: { nodes: TreeNode[]; current: string | null; onopen: (path: string) => void } = $props();
</script>

<ul class="tree">
  {#each nodes as node (node.path)}
    {#if node.kind === 'folder'}
      <li><details open><summary>{node.name}</summary><Self nodes={node.children} {current} {onopen} /></details></li>
    {:else if node.kind === 'document'}
      <li>
        <button aria-current={node.path === current ? 'page' : undefined} onclick={() => onopen(node.path)}>
          {node.name.replace(/\.(md|markdown|txt)$/i, '')}
        </button>
      </li>
    {/if}
  {/each}
</ul>
```

`app/src/App.svelte`:
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { assetUrl, core, describeError, filesOf, MESSAGES, type Collection, type Tree } from './lib/core';
  import { renderDocument } from './lib/markdown/render';
  import TreeView from './TreeView.svelte';

  let collections = $state<Collection[]>([]);
  let active = $state<Collection | null>(null);
  let tree = $state<Tree | null>(null);
  let openPath = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let page = $state<HTMLElement>();

  onMount(async () => {
    try {
      if ((await core.loadLibrary()).reset) notice = MESSAGES.LibraryReset;
      collections = await core.listCollections();
      const first = collections.find((c) => c.available);
      if (first) await selectCollection(first);
    } catch (e) {
      notice = describeError(e);
    }
  });

  async function selectCollection(c: Collection) {
    active = c;
    tree = null;
    openPath = null;
    page?.replaceChildren();
    try {
      tree = await core.getTree(c.id);
      if (tree.truncated) notice = MESSAGES.TreeTruncated;
    } catch (e) {
      notice = describeError(e);
    }
  }

  async function addFolder() {
    try {
      const picked = await core.pickFolder();
      if (!picked) return;
      collections = await core.listCollections();
      await selectCollection(picked);
    } catch (e) {
      notice = describeError(e);
    }
  }

  const findSlug = (slug: string) => page?.querySelector<HTMLElement>(`[data-slug="${CSS.escape(slug)}"]`);

  async function openDocument(path: string, slug = '') {
    if (!active || !tree || !page) return;
    try {
      const doc = await core.readDocument(active.id, path);
      const { article } = renderDocument(doc.text, { collectionId: active.id, path, files: filesOf(tree.root), assetUrl });
      page.replaceChildren(article);
      openPath = path;
      notice = doc.lossy ? MESSAGES.Lossy : null;
      if (slug) findSlug(slug)?.scrollIntoView();
      else page.scrollTop = 0;
    } catch (e) {
      notice = describeError(e);
    }
  }

  function onPageClick(event: MouseEvent) {
    const link = (event.target as HTMLElement).closest('a');
    if (!link) return;
    event.preventDefault(); // website links get their confirmation dialog in Plan 4
    const { kind, path, slug, target } = link.dataset;
    if (kind === 'internal' && path) openDocument(path, slug);
    else if (kind === 'anchor' && slug) findSlug(slug)?.scrollIntoView();
    else if (kind === 'broken') notice = `“${target}” isn’t in this collection. It may have been renamed, moved or not written yet.`;
  }
</script>

<div class="shell">
  <aside class="side" aria-label="Library">
    <button class="btn" onclick={addFolder}>Open a folder</button>
    <h2 class="side-h">Collections</h2>
    <ul class="cols">
      {#each collections as c (c.id)}
        <li>
          <button aria-pressed={active?.id === c.id} disabled={!c.available} onclick={() => selectCollection(c)}>
            {c.name}{c.available ? '' : ' (unavailable)'}
          </button>
        </li>
      {/each}
    </ul>
    <h2 class="side-h">Documents</h2>
    {#if tree}<TreeView nodes={tree.root.children} current={openPath} onopen={(p) => openDocument(p)} />{/if}
  </aside>
  <main class="reader">
    {#if notice}
      <p class="notice" role="status">{notice} <button onclick={() => (notice = null)}>Dismiss</button></p>
    {/if}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="page" bind:this={page} onclick={onPageClick}></div>
  </main>
</div>
```

`app/src/styles/base.css`:
```css
/* Plan 1 shell: the prototype's light tokens and reading styles. Plan 2 brings the full theme set and fonts. */
:root {
  --paper: #F7F8F4; --page: #FFFFFF; --panel: #EEF0EA; --hover: #E4E7DF; --line: #D8DBD2;
  --ink: #1C211E; --ink-2: #4A524C; --ink-3: #646C66;
  --accent: #2E6A54; --accent-ink: #FFFFFF; --accent-soft: #DFEBE4;
  --info-soft: #E1EBF4; --tip-soft: #DFEBE4; --imp-soft: #ECE7F6; --warn-soft: #FAEFD9; --danger: #A3352A; --danger-soft: #F8E3E0;
  --code-bg: #F0F2EC; --focus: #1B5FD0;
  --font-ui: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --read-font: Georgia, "Times New Roman", serif;
  --mono: ui-monospace, "Cascadia Mono", Consolas, Menlo, monospace;
}
* { box-sizing: border-box; }
html, body, #app { height: 100%; margin: 0; }
body { background: var(--paper); color: var(--ink); font: 15px/1.45 var(--font-ui); }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.shell { height: 100%; display: grid; grid-template-columns: 17rem minmax(0, 1fr); }
.side { background: var(--panel); border-right: 1px solid var(--line); padding: .75rem; overflow-y: auto; }
.side-h { font-size: .7rem; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); margin: 1rem 0 .35rem; }
.btn { width: 100%; padding: .5rem; border-radius: 8px; border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); font: inherit; cursor: pointer; }
.cols, .tree { list-style: none; margin: 0; padding: 0; }
.tree .tree { padding-left: .9rem; }
.cols button, .tree button { width: 100%; text-align: left; border: 0; background: none; padding: .3rem .5rem; border-radius: 6px; font: inherit; color: inherit; cursor: pointer; }
.cols button[aria-pressed="true"], .tree button[aria-current="page"] { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
summary { cursor: pointer; padding: .3rem .25rem; color: var(--ink-2); }
.reader { display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0; background: var(--page); }
.notice { margin: 0; padding: .5rem 1rem; background: var(--info-soft); font-size: .875rem; }
.page { overflow-y: auto; padding: 2.25rem clamp(1rem, 4vw, 3rem) 5rem; }
.doc { font: 1.125rem/1.7 var(--read-font); max-width: 68ch; margin: 0 auto; overflow-wrap: break-word; }
.doc h1, .doc h2, .doc h3 { line-height: 1.25; font-weight: 600; }
.doc h1 { font-size: 2.15em; margin-top: 0; }
.doc a { color: var(--accent); text-underline-offset: .18em; }
.doc a.broken { color: var(--danger); text-decoration-style: dotted; }
.doc code { font-family: var(--mono); font-size: .86em; background: var(--code-bg); padding: .1em .35em; border-radius: 4px; }
.code-block { border: 1px solid var(--line); border-radius: 8px; background: var(--code-bg); overflow: hidden; }
.code-head { font: .75rem var(--font-ui); color: var(--ink-3); padding: .3rem .8rem; border-bottom: 1px solid var(--line); }
.code-block pre, .diagram pre { margin: 0; padding: .9em 1em; overflow-x: auto; font-size: .82em; }
.table-wrap { overflow-x: auto; }
.doc table { border-collapse: collapse; width: 100%; font: .86em/1.45 var(--font-ui); }
.doc th, .doc td { text-align: left; padding: .5em .75em; border-bottom: 1px solid var(--line); }
.doc img { max-width: 100%; height: auto; }
.callout { border-radius: 8px; padding: .75em 1em; margin: .9em 0; }
.callout-title { margin: 0; font: 700 .8em var(--font-ui); letter-spacing: .06em; text-transform: uppercase; }
.callout-note { background: var(--info-soft); } .callout-tip { background: var(--tip-soft); } .callout-important { background: var(--imp-soft); }
.callout-warning { background: var(--warn-soft); } .callout-caution { background: var(--danger-soft); }
.remote-img, .missing-img, .diagram { border: 1px dashed var(--ink-3); border-radius: 8px; padding: 1rem; font: .875rem/1.5 var(--font-ui); background: var(--panel); }
.remote-title { font-weight: 600; }
.math-block { overflow-x: auto; text-align: center; }
```

- [ ] **Step 5: Type-check and run every automated check**

Run in `app/`: `npm run check && npm test && npm run check:readonly`, then in `app/src-tauri/`: `cargo test`
Expected: `svelte-check` finds 0 errors, all Vitest and Cargo tests pass, and the read-only check passes.

- [ ] **Step 6: Verify by hand in the running app**

Run in `app/`: `npm run tauri dev`, then check each of these:
1. "Sample library" is selected and the tree lists Getting Started, README, Guides, Images (no documents shown), References and Technical.
2. README opens with its frontmatter title, a table and a ticked task list. Selecting **Introduction** in the table opens that page.
3. Technical › Architecture shows the systems drawing (served through `folio://`) and formatted maths.
4. Guides › Troubleshooting shows the Network Setup guide and Printer Manual links in red with a dotted underline. Selecting one shows the "isn't in this collection" notice.
5. Guides › Introduction shows the placeholder "Picture from the internet not shown … images.example.org". The browser developer tools Network tab shows no request to `images.example.org`.
6. Selecting the website link in README does nothing in Plan 1; it doesn't navigate the window.
7. **Open a folder** → choose a folder whose path contains spaces, such as this project's OneDrive folder. It appears under Collections and its documents open.
8. Close and run `npm run tauri dev` again. The folder from step 7 is still listed.
9. Rename that folder in File Explorer or Finder, then relaunch. It shows "(unavailable)" and can't be selected, and the app doesn't crash.

- [ ] **Step 7: Commit**

```bash
git add app/src
git commit -m "feat(app): add core bridge and minimal reading shell over real folders"
```

---

## Self-review notes (completed while writing the plan)

**Spec coverage for Plan 1:**

| Spec section | Where this plan covers it |
|---|---|
| §3.1 `paths` | Task 3 |
| §3.1 `reader` | Task 4 |
| §3.1 `library` | Task 5 |
| §3.1 `workspace`, tree only | Task 6 |
| §3.1 `asset` | Task 7 |
| §3.1 `errors` | Task 2 |
| §3.2 `lib/markdown`, without Mermaid drawing | Tasks 10–11 |
| §3.3 commands `pick_folder`, `list_collections`, `get_tree`, `read_document`, `load_library`, `save_library` | Task 7 |
| §3.4 layout | Task 1 |
| §6.1 items 1–4 and CSP | Tasks 1, 3 and 8 |
| §6.2 sanitizing | Task 10 |
| §7 Rust unit tests, read-only check, Vitest | Throughout |

**Deferred to later plans, as listed in the roadmap:**
- To Plan 3: the watcher and its events, search, and the `search` command.
- To Plan 4: `net`, `fetch_remote_image`, `open_external`, `forget_collection`, `open_log_folder`, logging, and Copy details.
- To Plan 2: `pick_files` (opening single files) and Mermaid drawing.

**Spec amendments made with this plan:**
- The CSP `img-src` gains `http://folio.localhost`, because Windows serves custom protocols that way.
- `read_document` returns `modifiedMs`.

Both are applied to the spec file.

**Consistency check:**
- `Collection`, `TreeNode`, `Tree`, `DocumentText` and `LoadResult` have the same field names in Rust (serde camelCase) and TypeScript.
- Error codes are identical in `errors.rs`, `core.ts` and the spec.
- `EnhanceContext` is the same in `enhance.ts`, `render.ts` and `App.svelte`.

**Test counts:** the per-task "N passed" numbers come from the test code in each task. Task 7 Step 4 asks the implementer to read the actual total from the output instead of trusting a precomputed figure.
