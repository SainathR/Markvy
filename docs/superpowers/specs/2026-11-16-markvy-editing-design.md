# Markvy Editing: Design

- **Date:** 2026-11-16
- **Status:** Approved by the product owner on 2026-11-16. Production development may proceed once the implementation plan (Plan 6) is approved.
- **Builds on:** `docs/superpowers/specs/2026-11-02-folio-desktop-architecture-design.md` (the v1 spec, amendments A1–A15). Markvy was called Folio in that document (A15).
- **Changes to v1:** this spec replaces v1 §2 "Out of scope: Editing files" and narrows v1 §6 "Markvy never changes your files" as described in §6 below. Everything else in v1 still applies.
- **Follow-up:** a Confluence connection (read and edit Confluence pages in Markvy) is a separate spec that reuses this editor. It is not part of this one.

## 1. Intent

Let people who do not know Markdown or git edit the documents they read in Markvy, the way they would in Word, without making a mess of the files.

### Who it is for

Non-technical colleagues who maintain requirement pages and wiki folders that live in git repositories (for example `D:\Git\team-requirements`). They make quick fixes while reading and also write whole new pages. Someone technical still commits and pushes.

### Success criteria

1. A person who has never seen Markdown can fix a sentence, add a table row, write a new page, rename it and delete it, without help.
2. After an edit, `git diff` shows only the lines the person meant to change. Opening a page and saving it without changes leaves the file byte-identical.
3. No work is ever lost: not on a crash, a closed window, a failed save, or a file changed by someone else.
4. Markvy still writes nothing the person did not ask for. Reading remains the default.

### Decisions recorded

| Decision | Choice |
|---|---|
| Editing style | Word-like formatted editing with a toolbar. No Markdown symbols on screen. |
| How files are written | Block patching: only edited blocks are rewritten; untouched blocks keep their exact original text. |
| Saving | Automatic private drafts; the file changes only on Save. |
| File actions | Create page, create folder, rename (with link updates), delete (to the Recycle Bin). |
| Moving pages between folders | Out of scope for this version. |
| Order of work | This editor first; Confluence as its own spec afterwards. |

## 2. Scope

### In scope

- Edit mode for documents (`.md`, `.markdown`, `.txt`) in any collection except the Sample library.
- Formatted editing: headings 1–6, paragraphs, bold, italic, strikethrough, inline code, links, wiki links, bulleted, numbered and check lists (nested), block quotes, code blocks, tables (add and remove rows and columns, column alignment), horizontal rules, pictures.
- Cards for content the editor does not edit visually: Mermaid diagrams, maths (inline and block), callouts, frontmatter, raw HTML blocks, footnote definitions, and any block the editor cannot represent exactly. A card shows the rendered result and offers **Edit source**.
- Drafts, Save, conflict handling (§4).
- New page, new folder, rename page, rename folder, delete page, delete folder (§5).
- Pasting text from Word and web pages; pasting and dropping pictures.
- The **Allow editing** preference (§6).

### Out of scope

- Moving pages or folders between folders.
- Git operations (commit, pull, push, history).
- Real-time collaboration or locking between people.
- Editing pictures, PDFs or other non-document files.
- Version history inside Markvy beyond Ctrl+Z while editing.
- Spell checking beyond what the operating system's web view provides.
- Confluence (separate spec).

## 3. Architecture

### 3.1 Screens (`app/src/lib/editor/` and `app/src/EditorPane.svelte`)

| Unit | Responsibility |
|---|---|
| `blocks.ts` | Splits a file's text into top-level blocks with `marked`'s lexer (already a dependency). Each block keeps its exact original text, including the blank lines after it. Joining every block's original text reproduces the file byte for byte; a test enforces this. Also records the file's line ending, byte-order mark and final newline. |
| `style.ts` | Detects the file's Markdown style: bullet marker (`-`, `*`, `+`), emphasis and strong markers (`*` or `_`), heading style, table padding, code fence (backticks or tildes, length), ordered-list numbering (incrementing or all `1.`). Falls back to the dominant style in the folder, then to `-`, `*`, `**`, padded tables, backtick fences. |
| `serialize.ts` | Turns edited editor content back into Markdown in the detected style. Used only for blocks that changed or are new. |
| `model.ts` | Builds the editor document from blocks and back. Every editor node created from a block carries that block's index. A block is unchanged only if all of its nodes are untouched and still next to each other in the original order; then its original text is written. Anything else is serialized. |
| `cards.ts` | Decides which blocks become cards (the list in §2) and renders them with the existing reader pipeline (render, Mermaid, KaTeX). **Edit source** opens a plain text box for that block only. |
| `paste.ts` | Converts pasted HTML to Markdown blocks (headings, lists, tables, links, emphasis), dropping scripts, styles, classes and unknown tags. Pasted pictures go to `edit.rs` (§3.2). |
| `EditorPane.svelte` | The editor surface and toolbar, built on Milkdown 7 (ProseMirror with remark and its GFM preset). Wiki links are inline chips with a page picker. Shows the unsaved-draft dot and the Save button; Ctrl+S saves. |

Milkdown is chosen because its remark-based serializer can be configured to the detected style, and its GFM preset covers tables and task lists. It goes through the dependency review (v1 amendment A14) like any new package. If the review rejects it, the fallback is TipTap with the same block model; the rest of this design does not change.

Reading stays the default. A document shows an **Edit** button; edit mode replaces the reader view in the same tab. Leaving edit mode returns to the reader.

### 3.2 Rust core (`app/src-tauri/src/edit.rs`)

`edit.rs` is the only module, besides `library.rs` and `log.rs`, allowed to write. It owns all changes to documents, drafts and pasted pictures.

| Command | Does |
|---|---|
| `save_draft(collection, path, draft)` | Writes the draft to `<data>/drafts/<collection-id>/<sha256 of path>.json`. |
| `take_draft(collection, path)` | Returns the stored draft, if any. |
| `discard_draft(collection, path)` | Deletes the draft. |
| `list_drafts()` | Lists drafts, for "Restore unsaved changes" after a crash. |
| `save_document(collection, path, text, base_hash)` | Saves if the file still matches `base_hash`; otherwise returns `Conflict { current_text, current_hash }`. Returns the new hash. Deletes the draft after a successful save. |
| `create_page(collection, folder, file_name, title)` | Creates `# <title>\n` in the file's chosen name. |
| `create_folder(collection, parent, name)` | Creates a folder. |
| `plan_rename(collection, path, new_name)` | Returns every link that would change, per page, without writing. |
| `rename(collection, path, new_name, plan_hash)` | Applies a plan (§5) if nothing changed since it was made. |
| `plan_delete(collection, path)` | Returns what will be deleted and the pages whose links will break. |
| `delete(collection, path)` | Moves the page or folder to the Recycle Bin. |
| `save_picture(collection, page, bytes, kind)` | Saves a pasted or dropped picture to `images/` next to the page; returns its relative link. |

Every document path goes through the existing `paths::resolve` checks (inside the collection root, no symlink escape), and through a new check that the target is a document or, for `save_picture`, a picture.

The existing watcher and indexer pick up saved files as they do today. `edit.rs` records the hash of each file it writes for a few seconds, so the watcher's change for Markvy's own save does not show the "changed on disk" notice.

### 3.3 Existing parts that change

- `scripts/check-readonly.mjs`: `ALLOWED_FILES` gains `edit.rs`.
- `clippy.toml` comment and `edit.rs` header: `edit.rs` opts out of `disallowed-methods` the same way `library.rs` and `log.rs` do.
- `prefs.ts`: new `allowEditing: boolean`, default `true`.
- Tree view: right-click menu (New page, New folder, Rename, Delete) and a **+** button on folders, shown only when editing is allowed for that collection.
- `i18n.ts`: editor strings in English; Spanish and German follow the v1 rule (main navigation only).
- Privacy, Help, `tauri.conf.json` descriptions: new wording (§6).

## 4. Data flow: drafts, saving, conflicts

### Draft

1. Edit mode opens: Markvy reads the file, keeps its text and SHA-256 hash (`base_hash`), and builds the editor document.
2. About one second after typing stops, the screens send the current Markdown and `base_hash` to `save_draft`. The `.md` file is not touched.
3. The tab shows a dot while a draft exists.
4. After a crash or a closed window, opening the page (or Home, via `list_drafts`) offers "Restore unsaved changes from 14:32?" with **Restore** and **Discard**. This uses the crash recovery from v1 amendment A12.

### Save (button or Ctrl+S)

1. `save_document` re-reads the file and hashes it.
2. Hash equals `base_hash`: write atomically (§6), keep the original line endings, byte-order mark and final newline, delete the draft, return the new hash, which becomes the new `base_hash`.
3. Hash differs: return `Conflict`. Nothing is written.

### Conflict

The screens split the current file into blocks and compare three versions block by block: the base (original text kept at edit start), the file now, and the person's edit.

- **Changes are in different blocks:** offer **Combine both** (recommended), which applies the person's changed blocks onto the current file, plus **Show both**.
- **Changes touch the same block:** show the two versions of each clashing block side by side, with **Keep mine**, **Keep theirs** and **Save mine as a copy** (`<name> (my copy).md`, numbered if taken).
- The draft is deleted only after the person has chosen and the save succeeded.

### Leaving edit mode

With an unsaved draft: **Save**, **Keep draft**, **Discard** (Discard asks for confirmation). Closing the window keeps drafts; nothing is lost.

## 5. Creating, renaming and deleting

### New page and new folder

- The person types a title. Markvy suggests a file name in the folder's existing style: hyphens or spaces, letter case, and a numeric prefix pattern if most siblings have one (`00-Module-Overview.md` suggests `Payment-Rules.md`). The name is editable.
- Refused, with a reason: characters invalid on any of Windows, macOS or Linux (`<>:"/\|?*`, control characters), reserved Windows names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`), names ending in a dot or space, a name already used in that folder ignoring letter case, and paths longer than the platform allows.
- A new page opens in edit mode.

### Rename (page or folder)

1. `plan_rename` finds every link to the renamed page (or to any page inside the renamed folder) across the collection, using the index: `[[Name]]`, `[[Name|label]]`, `[[Name#heading]]`, and relative Markdown links and picture links such as `[x](../Name.md)`, including encoded spaces.
2. The screens show "7 links in 4 pages will be updated" with the list. Links inside code blocks and inline code are never changed.
3. If any affected page has an unsaved draft, rename waits: "Save or discard edits in <page> first."
4. On confirm, `rename` writes every updated page to a temporary file first, then renames the target, then swaps the temporary files in. If any step fails, completed steps are undone in reverse order and the person sees which file failed and why. Only the link text changes in each page; all other bytes stay the same (block patching).

### Delete (page or folder)

- `plan_delete` lists what goes and warns: "3 pages link here; those links will break."
- `delete` moves it to the Recycle Bin (macOS Trash, Linux freedesktop trash) with the `trash` crate.
- If the location has no Recycle Bin (some network drives), Markvy refuses: "This folder has no Recycle Bin, so Markvy will not delete it. Delete it in File Explorer if you are sure." Markvy never deletes permanently.

### Pictures

Pasting or dropping a PNG, JPG, GIF or WebP (up to 20 MB) saves it as `images/<page-name>-<n>.<ext>` next to the page, creating `images/` if needed, and inserts a relative link. Other files are refused with a message.

## 5a. Error handling

| Situation | What the person sees | Data |
|---|---|---|
| File open in another program (Windows sharing violation) | Retried for up to 2 seconds, then "This file is in use by another program. Close it and press Save again." | Draft kept |
| No permission | "Markvy can't save here: no permission to change this file." | Draft kept |
| Disk full | "There isn't enough disk space to save." | Draft kept |
| Path too long, invalid name | The specific reason from §5 | Nothing written |
| Folder became unavailable | "This folder is no longer available." | Draft kept |
| Draft can't be written | Small notice "Unsaved changes are not being backed up" until a draft write succeeds again | Editor content kept in memory |
| Rename fails halfway | Changes undone; "Renaming stopped: <file> could not be changed (<reason>). Nothing was changed." | Original state |
| A panic inside a command | Contained by the v1 `guarded` wrapper and logged | Draft kept |

## 6. Safety, security and privacy

- **Write boundary.** Only `edit.rs`, `library.rs` and `log.rs` may write; `check:readonly` and clippy enforce it. `edit.rs` writes only inside a collection root, only to documents, pictures it saves, drafts and its own temporary files. The Sample library and unavailable collections always refuse.
- **Allow editing.** A preference, on by default. Off hides every editing control and makes all editing commands refuse.
- **Atomic writes.** Write to `.~markvy-<random>.tmp` in the same folder, flush to disk, then rename over the target. The tree, watcher and indexer ignore `.~markvy-*.tmp`. Leftover temporary files from a crash are removed the next time that folder is saved to.
- **Paste cleaning.** Pasted HTML is converted to Markdown; scripts, styles, event attributes and unknown tags are dropped. What is displayed still passes through DOMPurify and the v1 content security policy, unchanged.
- **New dependencies.** Milkdown (and its ProseMirror and remark packages) and the `trash` crate pass the dependency review (A14). None of them may use the network; the existing network check (`NETWORK_PATTERNS`) still applies.
- **Logging.** Every save, create, rename and delete is logged with its paths, never file contents.
- **Privacy wording.** "Markvy never changes your files" becomes "Markvy changes your files only when you press Save, rename or delete. Unsaved changes are kept in Markvy's own folder on this computer and are never sent anywhere." Updated in Privacy, Help, and the `tauri.conf.json` descriptions.
- **Undo.** Ctrl+Z and Ctrl+Y work while editing. After saving, recovery is through git or the Recycle Bin.

## 7. Testing

### Clean-diff guarantee

A fixture set under `app/tests/fixtures/editing/` covers CRLF and LF, a byte-order mark, tabs, no final newline, nested lists, every list marker, tables with and without padding and alignment, frontmatter, callouts, Mermaid, maths, every wiki-link form, raw HTML, footnotes, and the sample library.

- **No-op round trip:** for every fixture, open in the editor model and save without changes: the output is byte-identical.
- **One-block edit:** for every fixture, change one block: the line diff touches only that block's lines.
- **Style detection:** unit tests for each style rule and fallback in `style.ts`.

### Rust (`edit.rs`)

Atomic write and cleanup of temporary files; conflict detection by hash; refusal of `../`, absolute paths and symlinks pointing outside; reserved, invalid and duplicate names; rename undo after a write failure injected halfway; delete refusal without a Recycle Bin; draft save, list, take and discard; picture type and size limits; own-save suppression of the "changed on disk" notice.

### Conflicts

Different-block edits combine correctly; same-block edits are reported with both versions; "Save mine as a copy" picks a free name.

### Whole app (WebdriverIO on Windows, extending v1 Plan 5)

1. Edit, save, reopen: the change is there and nothing else changed.
2. Crash while editing: the draft is offered and restores.
3. File changed outside Markvy while editing: Combine both.
4. Rename: links in other pages are updated.
5. Delete: the page is in the Recycle Bin.
6. Paste a screenshot: it appears in `images/` and the page links to it.

### Screens (Playwright, Chromium and WebKit)

Axe scan of edit mode, the toolbar, cards and the dialogs from §4–5 with no violations; a complete edit (heading, list, table row, link, Save) using only the keyboard.

### Speed

- Entering edit mode: under 300 ms for a typical page, under 1 s for a 1 MB page.
- Save: under 200 ms for a typical page.
- Typing on a 1 MB page: no frame over 50 ms per keystroke.

### User test

`docs/release/uat-script.md` gains editing tasks: fix a sentence, add a table row, create, rename and delete a page, paste a screenshot. Pass: done without help, and `git diff` shows only the intended lines.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Serializer changes untouched text | Block patching writes untouched blocks verbatim; no-op round-trip tests on every fixture |
| `marked` and remark split blocks differently | The editor tracks blocks by `marked`'s split; a block whose content remark cannot represent exactly becomes a card |
| Milkdown fails the dependency review or is too large | TipTap fallback with the same block model |
| Rename misses a link form | Links are found through the index's link parser, which the broken-link check already uses; the preview shows every change before writing |
| Two people edit the same file | Conflict flow on Save; out-of-scope real-time locking stated plainly |
| Network drives without a Recycle Bin | Delete refuses instead of deleting permanently |
| Non-technical people lose track of unsaved work | Draft dot on the tab, prompt on leaving edit mode, restore after crashes |

## 9. Amendment to the v1 spec

v1 §11 gains (recorded there on approval):

| # | Change |
|---|---|
| A16 | Editing (`docs/superpowers/specs/2026-11-16-markvy-editing-design.md`) replaces §2 "Out of scope: Editing files". §6's write boundary widens from `library.rs` and `log.rs` to also include `edit.rs`, which writes only inside collection folders and Markvy's data folder. |
