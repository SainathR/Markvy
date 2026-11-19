# Folio Desktop: Technical Architecture

> **Renamed:** the product is now called **Markvy** (amendment A15). This document keeps the name Folio as written at the time.

- **Date:** 2026-11-02
- **Status:** Approved by the product owner on 2026-11-02. Production development may proceed once the implementation plan is approved.
- **Prototype:** approved by the product owner on 2026-11-02. Source: `index.html` in this repository. Published at https://claude.ai/artifact/U8gcejKDZykSNqTFr9DyuQ.
- **Source brief:** "Prototype Design Brief: Local-First Markdown & Wiki Reader", v0.1.

## 1. Intent

Folio is a desktop app that lets ordinary computer users open, navigate and read Markdown documents and wiki collections without knowing Markdown. It should feel like reading a well-designed book, with the navigation of a documentation website, and it must never feel like a developer tool.

### Success criteria

1. Every screen and interaction in the approved prototype works in the desktop app with real files and folders.
2. Read-only access, no uploads, no telemetry and offline use are enforced by the platform, not only promised in text.
3. The app runs on Windows, macOS and Linux from the first release.
4. The 12 UAT scenarios in the brief pass with at least 5 real users on the desktop build before release.
5. Nothing in the app or its marketing claims more security than is technically enforced.

### Decisions recorded

| Decision | Choice | Decided by |
|---|---|---|
| Platforms for first release | Windows, macOS and Linux | Product owner |
| Technology | Tauri 2: a Rust core with TypeScript screens built in Svelte | Product owner, on recommendation |
| Rejected: Electron | Larger installers (about 100 MB), and read-only and no-network would rest on configuration only | |
| Rejected: Avalonia (.NET) | The approved prototype's screens would have to be rebuilt | |
| Automatic updates | None in v1, because an updater contacts a server | Product owner (Section 3 review) |
| Mac distribution | Developer ID with notarization, outside the Mac App Store | Architecture |

## 2. Scope

### In scope for v1

The prototype's seven screens:

1. Home
2. Main reading workspace (three panels, tabs, breadcrumbs, contents panel, reading progress)
3. Search
4. Side-by-side reading
5. Reading preferences (7 colour themes plus Automatic, font, size, width, line spacing, zoom, Lexend, high contrast, reduced motion, interface language)
6. Library and bookmarks
7. Privacy, security and help

All of them work with:

- real files and folders, remembered between sessions;
- live reload when files change on disk;
- the bundled sample library;
- the content features listed in the brief: GitHub-Flavored Markdown, frontmatter, wiki links, callouts, Mermaid diagrams, KaTeX maths, local and remote images, external links and broken-link detection.

### Out of scope for v1

- Editing files
- Automatic updates
- Mac App Store or Microsoft Store distribution
- Cloud sync
- Plugins
- Exporting to other formats
- Full translation of every interface string. The prototype's partial translation (English, Spanish, German for main navigation) carries over; complete translation is a follow-up.

## 3. Architecture

The app has two parts that communicate only through the commands and events listed in Section 3.3.

```
┌────────────────────────── Folio window ──────────────────────────┐
│  Svelte screens (system web view, no file or network permission)  │
│   screens/  components/  stores/  lib/markdown/                   │
└───────────────▲────────────────────────────────┬─────────────────┘
                │ events                         │ invoke(command)
┌───────────────┴────────────────────────────────▼─────────────────┐
│  Rust core                                                        │
│   paths (guard) · workspace · reader · search · library · net     │
│   folio:// asset protocol (same path guard)                       │
└───────────────────────────────────────────────────────────────────┘
```

### 3.1 Rust core modules

Each module has one purpose and is tested on its own.

| Module | Purpose | Depends on |
|---|---|---|
| `paths` | Resolves a collection ID and relative path to an absolute path. Canonicalizes it and rejects anything outside the collection root, including `..`, shortcuts (symlinks and junctions) that point outside, and absolute paths. Every file access goes through this module. | none |
| `workspace` | Opens files and folders through the system picker, keeps the list of collections, builds the folder tree (documents and images only, skipping hidden folders and `node_modules`, stopping at 20,000 files), and watches for changes. | `paths`, `library` |
| `reader` | Reads a document as text, capped at 10 MB. Decodes UTF-8 and falls back to lossy decoding with a flag. Opens files read-only. | `paths` |
| `search` | In-memory index per collection, built in the background when a collection opens and updated from watcher events. Matches section headings and text. Scopes: all collections, one collection, one document; filters for headings only, whole words and folder. | `workspace`, `reader` |
| `library` | Loads and saves `library.json` in the app data folder. Writes atomically (temporary file, then rename). A damaged file is renamed to `library.json.bak` and a fresh one is started. | none |
| `net` | Fetches one approved remote image: http or https only, no cookies, 10-second timeout, 5 MB limit, image content types only. The only network code in the app. | none |
| `asset` | Serves `folio://<collection-id>/<relative-path>` for images in opened folders, through `paths`. | `paths` |
| `errors` | Defines the error codes shared with the screens (Section 5). | none |

### 3.2 Svelte screens

- **Screens:** `Home`, `Reader` (one or two `Pane`s), `Search`, `Library`, `Preferences`, `PrivacyHelp`.
- **Shared components:** `AppBar`, `Sidebar` (collections, tree, filter, favorites, bookmarks, recent), `Pane` (tabs, toolbar, breadcrumbs, progress, find bar, status bar), `Toc`, `Dialog`, `Toast`, `ThemeSwatches`.
- **Stores, one per feature:** `tabs` (panes, tabs, history, split ratio), `library` (favorites, bookmarks, recent, progress, search history, session), `prefs`, `search`, `collections`. These replace the prototype's single state object `S` and single click handler `act()`. Each store exposes named functions instead of string action codes.
- **`lib/markdown`:** the formatting steps, ported from the prototype:
  1. split off frontmatter;
  2. convert with marked, including the wiki-link and maths extensions;
  3. clean with DOMPurify;
  4. enhance: callouts, heading slugs, link classification, image rewriting to `folio://`, table wrappers and code-block labels;
  5. render KaTeX maths;
  6. render Mermaid diagrams lazily, when they scroll into view.

  These steps run without the window, so they can be unit-tested.
- **Bundled libraries:** marked, DOMPurify, KaTeX (including its stylesheet) and Mermaid, plus the fonts Literata, Figtree and Lexend. Nothing loads from the internet.
- **Look:** the prototype's colour tokens, themes and layout carry over unchanged.

### 3.3 Commands and events

Commands take and return JSON. Every error is one of the codes in Section 5.

| Command | Input | Returns |
|---|---|---|
| `pick_folder` | none | `Collection` or nothing if cancelled |
| `pick_file` | none | `{ collection, path }`: the chosen document's folder is added as a collection (amendment A1) |
| `list_collections` | none | `Collection[]`, each with an `available` flag |
| `forget_collection` | `collectionId` | nothing |
| `get_tree` | `collectionId` | `TreeNode` (name, path, kind, children) and a `truncated` flag |
| `read_document` | `collectionId`, `path` | `{ text, size, modifiedMs, lossy }` |
| `search` | `query`, `scope`, `filters` | `SearchResult[]` (document, section slug, heading, snippet ranges, heading-match flag) |
| `fetch_remote_image` | `url` | `{ mime, base64 }` |
| `open_external` | `url` | nothing. Only `http`, `https` and `mailto` are accepted. |
| `load_library` | none | `Library` |
| `save_library` | `Library` | nothing |
| `open_log_folder` | none | nothing |

| Event | Payload |
|---|---|
| `collection-changed` | `collectionId`, changed paths, kind (created, modified, removed, renamed) |
| `index-progress` | `collectionId`, files indexed, total, done |
| `collection-unavailable` | `collectionId` |

`Library` (schema version 1) contains:

- `prefs`
- `favorites`
- `favoriteCollections`
- `bookmarks` (document key, section slug, heading, time added)
- `recent`
- `progress`
- `searches`
- `session` (panes, tab keys, scroll positions, split ratio)
- `allowedImageSites`
- `collections` (ID, display name, root path)

### 3.4 Project layout

The prototype stays at the repository root as `index.html` for reference. The desktop app lives in `app/`.

```
app/
  src-tauri/
    src/            main.rs, paths.rs, workspace.rs, reader.rs, search.rs,
                    library.rs, net.rs, asset.rs, errors.rs, commands.rs
    capabilities/   default.json
    tauri.conf.json
  src/
    screens/  components/  stores/  lib/markdown/  styles/
  tests/fixtures/sample-wiki/   (the prototype's sample library as real files)
  e2e/
```

The bundled sample library ships as real Markdown files from `tests/fixtures/sample-wiki/`, so the app and the tests use the same content.

## 4. Data flow

1. **Opening a folder.** The system picker returns a path. `workspace` adds a collection, saves it in `library`, starts the watcher and background indexing, and returns the collection. The screens request the tree.
2. **Reading a document.** The screens call `read_document`. `paths` checks the path, `reader` returns the text, and `lib/markdown` formats it. Links are checked against the tree: existing targets become internal links, missing targets get the broken-link style, and web addresses are marked external. Local images use `folio://`; remote images become a placeholder.
3. **Remote images.** The placeholder explains which site the picture comes from. On approval ("once" or "always allow this site"), the screens call `fetch_remote_image` and show the result as a data URL. Approved sites are saved in `allowedImageSites` and can be removed in Privacy & Help.
4. **Website links.** After confirmation (or straight away if the user turned the question off), the screens call `open_external`. The default browser opens the link.
5. **Changes on disk.** A `collection-changed` event updates the tree and the search index. An open document that changed reloads and keeps its scroll position. A removed document shows a banner and keeps the tab.
6. **Session.** The tabs and library stores save to `library.json` through `save_library`, at most once per second, and also when the window is hidden or the page unloads (amendment A3). On start, Home offers "Restore previous session".

## 5. Error handling

- Every failure reaches the screens as a code with optional details.
- The screens map each code to a plain-language message and one next step.
- Technical details go to a log file in the app data folder, and a **Copy details** button puts them on the clipboard.
- No raw error text, file system code or stack trace is ever shown.

| Code | Message | Next step |
|---|---|---|
| `NotFound` | This document was moved or deleted. | Find it in the folder / Close tab |
| `CollectionUnavailable` | This folder can't be reached. It may be on a drive that isn't connected. | Find folder again |
| `AccessDenied` | Folio isn't allowed to read this file. | Choose the folder again |
| `OutsideCollection` | This link points outside the folder you opened, so Folio won't open it. | OK |
| `TooLarge` | This file is too large to display. | Open in another app |
| `NotText` | This file isn't a text document. | Open in another app |
| `TreeTruncated` | Only the first 20,000 files are shown. | Open a smaller folder |
| `ImageFailed` | The picture couldn't be loaded. | Try again / Keep hidden |
| `ImageRejected` | That link isn't a picture, or it's larger than 5 MB. | OK |
| `LinkRefused` | Folio only opens web and email links. | OK |
| `LibraryReset` | Your saved settings couldn't be read, so Folio started fresh. A copy was kept. | Open folder |

Containment rules:

- A failed diagram or formula shows its source with a short note; the rest of the page still renders.
- A panic in a command is caught and returned as an error.
- If the web view crashes, the window reloads and restores the session.
- Folder listing and indexing never block the window. Search shows "still indexing" until the index is complete.

## 6. Security and privacy

### Enforced by the platform

1. **The screens have no file-system permission.** The Tauri capability file grants only the commands in Section 3.3. The `fs`, `shell` and `http` plugins are not included.
2. **The core opens documents read-only.** A CI check fails the build if write calls (`fs::write`, `File::create`, `OpenOptions` with write access, and similar) appear outside `library.rs`.
3. **Content security policy:**
   - `default-src 'self'`
   - `script-src 'self'`
   - `style-src 'self' 'unsafe-inline'`. Mermaid and KaTeX need inline styles.
   - `img-src 'self' folio: http://folio.localhost data:`. Windows serves custom protocols as `http://folio.localhost`.
   - `connect-src ipc: http://ipc.localhost`
   - `font-src 'self'`
   - `object-src 'none'`
   - `frame-src 'none'`
   - `base-uri 'none'`
   - `form-action 'none'`
4. **All file access goes through the `paths` guard,** including `folio://` requests.
5. **Network access exists only in `net`,** and only `fetch_remote_image` uses it.

### Enforced in code and tests

- Document HTML is cleaned by DOMPurify. Scripts, frames, forms, event handlers and `javascript:` URLs are removed.
- Mermaid runs with `securityLevel: 'strict'` and KaTeX with `trust: false`.
- `open_external` refuses every scheme except `http`, `https` and `mailto`.

### Stated limitation

The approval questions for remote images and for opening websites are shown by the screens. A flaw that bypassed DOMPurify and the content security policy could call `fetch_remote_image` or `open_external` without asking, so Folio could contact a website, or open one in the browser, without the person's approval. Privacy & Help says this plainly (A11).

### No telemetry

- No analytics, crash reporting or update checks.
- The CI dependency review flags any new dependency that makes network calls.

### Wording

Privacy & Help lists only what is enforced above. The words "secure" and "certified" are not used until an independent security review has been done. That review is recommended before public release.

## 7. Testing

| Layer | Tool | Covers |
|---|---|---|
| Rust unit tests | `cargo test` | `paths` (`..`, shortcuts, absolute paths, Unicode and Windows paths), tree limits, the search index, `library` recovery from a damaged file, `net` limits (size, MIME type, timeout, scheme), `open_external` schemes |
| Read-only check | CI script | No write calls outside `library.rs` |
| Screen unit tests | Vitest | The formatting steps against the sample wiki, link classification including the two deliberately broken links, a sanitizer suite of booby-trapped documents, and the stores (tabs, library, prefs) |
| Whole-app tests | WebdriverIO with `tauri-driver` | Windows and Linux: the 12 brief scenarios that can be automated |
| macOS | Playwright (WebKit) against the screens, plus a manual checklist on a real Mac | WebDriver isn't available for macOS web views. This gap is known and accepted. |
| Accessibility | axe-core on every screen | Automated checks; manual keyboard and screen-reader pass (NVDA, VoiceOver, Orca) before release |
| Speed | Benchmarks in CI | Start under 1.5 s; 1,000-file tree under 2 s; search across 5,000 documents under 200 ms |
| UAT | Brief section 12 | At least 5 users on the desktop build, findings logged, before release |

CI builds and tests on Windows, macOS and Linux for every change. This needs code hosting such as GitHub; see Section 9.

## 8. Packaging and distribution

| Platform | Package | Signing |
|---|---|---|
| Windows | MSI and NSIS installer | Code-signing certificate |
| macOS | DMG, universal (Apple Silicon and Intel) | Developer ID plus notarization |
| Linux | AppImage and .deb | Published SHA-256 checksums |

Updates are downloaded manually from the release page. Tauri's updater may be added later as an opt-in "Check for updates" setting, off by default; that would need a new privacy statement.

## 9. Dependencies on the product owner

1. Code hosting with CI for three platforms, such as GitHub Actions.
2. A Windows code-signing certificate.
3. An Apple Developer Program membership for Developer ID signing and notarization.
4. Five or more UAT participants before release.
5. A decision on the independent security review before public release.

## 10. Risks

| Risk | Mitigation |
|---|---|
| The three system web views (WebView2, WebKit, WebKitGTK) render differently | Whole-app tests on each platform; avoid very new CSS; the macOS manual checklist |
| Linux WebKitGTK versions vary between distributions | Support the current Ubuntu LTS and Fedora releases; AppImage bundles what it can |
| Mermaid is large and slow to start | Load it lazily, only for documents that contain diagrams |
| Very large wikis | 20,000-file cap, background indexing, and an on-disk index if the speed targets are missed |
| Remote-image and website approval rely on the screens | Stated limitation; sanitizing plus the content security policy; security review |
| Fewer maintainers know Rust | Keep the core small (about 8 modules) with thorough tests; the screens hold most of the logic |

## 11. Amendments

Approved by the product owner on 2026-11-03 with Plan 2.

| # | Change |
|---|---|
| A1 | `pick_files` became `pick_file`. Opening one document adds its folder as a collection, so links to neighbouring pages keep working. |
| A2 | The prototype's workspaces are not part of the desktop app. Home lists the person's folders (collections) instead. |
| A3 | The session is saved at most once per second, and also when the window is hidden or the page unloads. The window close request is not used, because it needs extra window permissions. |

Approved by the product owner on 2026-11-03 with Plan 3.

| # | Change |
|---|---|
| A4 | `search` returns `{ results, indexing }`. Each result carries `title`, `titleMatch` and `total`, and each hit carries a plain-text `snippet` that the screens highlight themselves, instead of snippet ranges. `indexing` drives the "still indexing" message. |
| A5 | The Library list has no file-size or last-updated columns and no size sort, because the folder tree carries no sizes. The document details dialog shows both. |
| A6 | The app bar has a Library button, because the desktop app has no prototype navigation strip. |
| A7 | Wiki links match file names only. Matching page titles (a Plan 1 note) is dropped. |

Approved by the product owner on 2026-11-03 with Plan 4.

| # | Change |
|---|---|
| A8 | Besides `library.json` (written by `library.rs`), Folio writes one log file, `logs/folio.log` in its app data folder (renamed to `folio.log.1` at 1 MB), written only by `log.rs`. The read-only check allows exactly these two files. Documents are never written. |
| A9 | "Reset workspace" clears favorites, bookmarks, history, reading progress, the saved session, allowed picture sites and all settings, but keeps the list of folders. Each folder can be removed on its own. |
| A10 | Privacy & Help replaces the prototype's "prototype compared with the desktop app" table with "What Folio enforces": §6's enforced protections in plain language, followed by the stated limitation. |

Approved by the product owner on 2026-11-04 after Plan 4.

| # | Change |
|---|---|
| A11 | §6 "Stated limitation" covers both approval questions, for internet pictures and for opening websites: both are asked by the screens, so a bypass could make Folio contact or open a website without asking. This matches the Privacy & Help wording. |

Approved by the product owner on 2026-11-04 with Plan 5.

| # | Change |
|---|---|
| A12 | When the web view's content process crashes, the window reloads and the tabs come back with the notice "Folio had a problem and reloaded. Your tabs are back." A second crash within 60 seconds reloads without reopening the tabs, so a document that crashes the web view can't cause a loop; Home then offers "Restore previous session". On Windows, if the whole WebView2 engine stops, Folio restarts itself. The command `take_recovery` tells the screens what happened, and every crash is written to the log. |
| A13 | Builds with the Cargo feature `e2e` add test-only commands (`e2e_set_next_pick`, `e2e_crash_webview`, `e2e_uptime_ms`) and take the data folder from `FOLIO_DATA_DIR`. Release builds and `release.yml` never enable the feature; a test enforces this. |
| A14 | The CI dependency review (§6) fails on any crate in `Cargo.lock` or npm production package not in `scripts/reviewed-deps.json`. A person checks whether it uses the network, then adds it with `npm run check:deps -- --update`. |

Approved by the product owner on 2026-11-16.

| # | Change |
|---|---|
| A15 | The product is renamed from Folio to Markvy before its first release. The app ID changes (the current one is in A17), the internal scheme `markvy://`, the test settings `MARKVY_…`, and the Rust crate `markvy`. On first start, Markvy copies `library.json` from the old Folio data folder when it has none of its own; the old folder is left untouched. Earlier plans, specs and ledgers keep the name Folio as a record. |
| A16 | Editing (`docs/superpowers/specs/2026-11-16-markvy-editing-design.md`, approved 2026-11-16) replaces §2 "Out of scope: Editing files". §6's write boundary widens from `library.rs` and `log.rs` to also include `edit.rs`, which writes only inside collection folders and Markvy's data folder. |
| A17 | Markvy is a personal project of Sainath Racherla (2026-11-19). The publisher becomes "Sainath Racherla" and the app ID `com.sainath.markvy`. On first start Markvy copies `library.json` from the newest earlier pre-release data folder (the IDs are listed in `app_data_dir` in `lib.rs`) when it has none of its own. The Microsoft Store listing uses an individual Partner Center account (`docs/release/microsoft-store.md`). |
