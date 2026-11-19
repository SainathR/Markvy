# Folio Plan 2: The Reading Workspace

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Plan 1's minimal shell with the approved prototype's reading experience:
- app bar and sidebar (collections, folder tree, filter, favorites, recent);
- tabs with back and forward;
- side-by-side panes with a draggable divider;
- contents panel with the current section highlighted;
- reading progress;
- Home screen with session restore;
- Preferences with 8 theme options, bundled fonts and the reading controls;
- diagrams drawn by Mermaid.

**Architecture:**
- **Pure logic.** Small TypeScript modules with no Svelte or DOM state, each with unit tests. They cover the library data, preferences, the tab and pane model, the contents panel, the saver, translations and diagram drawing.
- **App store.** One Svelte 5 runes store (`state/app.svelte.ts`) ties the pure modules to the Rust bridge. It is unit-tested through an injected fake bridge.
- **Components.** Svelte components render the store using the prototype's own CSS, which is extracted from `index.html` by a script.
- **Rust core.** It gains `pick_file` and keeps every earlier settings backup.

**Tech Stack:**
- Plan 1's stack: Tauri 2, Svelte 5 runes, TypeScript, Vitest with jsdom, marked, DOMPurify, KaTeX.
- New: `mermaid` 11 (loaded on demand), `@fontsource/literata`, `@fontsource/figtree` and `@fontsource/lexend`.

**Spec:** `docs/superpowers/specs/2026-11-02-folio-desktop-architecture-design.md`. The approved prototype `index.html` is the visual reference. Plan 1's ledger, `docs/superpowers/plans/2026-11-02-folio-plan-1-ledger.md`, lists the deferred items this plan picks up.

## Spec amendments this plan proposes (needs the product owner's approval before execution)

| # | Spec says | This plan does | Why |
|---|---|---|---|
| A1 | `pick_files` returns an "Opened files" collection | `pick_file` opens one document and adds **its folder** as a collection | Links from that document to neighbouring pages keep working. A separate "opened files" list would show every such link as missing. The read scope stays the folder the person's chosen file sits in. |
| A2 | The prototype's Home has "previously opened workspaces" and a workspace selector | No workspace concept. Home lists **your folders** (collections) with stars. | One level of grouping is enough for v1, and the spec's command list has no workspaces. |
| A3 | Session saved "at most once per second and when the window closes" | Saved at most once per second, and also when the window is hidden or the page unloads (`pagehide`, `visibilitychange`) | Listening for the close request needs extra window permissions (`core:window:allow-destroy`). At most one second of scrolling can be lost. |

## Out of scope (later plans)

- **Plan 3:** search, the Library screen, bookmarks, the document details dialog, the find-in-document bar, and the file watcher with live reload.
- **Plan 4:** the website link dialog and `open_external`, approving remote pictures, Privacy & Help, Copy details, and logs.
- **Plan 5:** whole-app automation, CI and installers.

## Global Constraints

Every task's requirements include this section.

- **Plan 1 constraints still hold.** The read-only core, every access through `paths::resolve`, the CSP string (unchanged), no CDN or network code, error codes `{code, details?}`, and plain-language messages taken verbatim from spec §5 or `MESSAGES`.
- **Library shape.** Library JSON keeps `"version": 1`. The screens own the keys `prefs`, `favorites`, `favoriteCollections`, `recent`, `progress` and `session`. Keys they don't know, such as Plan 3's `bookmarks` and the core's `collections`, must survive a save untouched.
- **Document keys** are `` `${collectionId}/${path}` ``. Collection ids never contain `/`.
- **Saving.** At most one save per second (A3), and never after a failed start-up load (the core refuses anyway).
- **Fonts** are bundled through `@fontsource/*` and served from the app. Nothing loads from Google Fonts or any CDN (`font-src 'self'`).
- **Mermaid** runs with `securityLevel: 'strict'`, and only when a document contains a diagram, via a dynamic `import('mermaid')`.
- **Theme ids and preview colours** are exactly the prototype's `THEMES` list: `system`, `light`, `sepia`, `slate`, `rose`, `dark`, `dusk`, `ember`.
- **Reading limits:**

  | Setting | Range | Default |
  |---|---|---|
  | Text size | 14–28 px | 18 |
  | Width | 45–100 ch | 68 |
  | Line spacing | 1.3–2.2 | 1.7 |
  | Zoom | 80–150 % | 100 |

  Other defaults: Paper theme, serif font, no high contrast, reduced motion off, English.
- **Split ratio** is clamped to 0.25–0.75.
- **Keyboard:**
  - `Alt+←` and `Alt+→` go back and forward in the active pane.
  - `[` and `]` toggle the sidebar and the contents panel.
  - `\` toggles side by side.
  - None of these fire while typing in an input.
- **Links in documents.** Clicking an internal link navigates in the same pane. `Ctrl` or `Cmd` opens a new tab, and `Shift` opens the page in the other pane. Middle- and right-clicks do nothing, and website links stay inert (Plan 4).
- **Icon-only buttons** carry `aria-label` and `title`.
- **Builds.** Rust builds use `CARGO_TARGET_DIR="$LOCALAPPDATA/folio-target"`, which keeps them out of OneDrive.

## Review Focus

These are the five inputs most likely to bite real users that the spec doesn't spell out. Each line names the test that pins it.

1. **A library saved by Plan 1, or edited by hand.** It may have no `prefs`, wrong types or unknown keys. The app must open with defaults, without crashing, and keep the unknown keys on save. Tests: Task 2 `library.test.ts > tolerates missing and malformed fields` and `> keeps unknown keys`.
2. **A saved session pointing at a folder that's gone, or a file that was deleted.** Restore must skip those tabs, never open a blank or broken workspace, and never crash. Tests: Task 4 `fromSession drops tabs whose key is rejected`, and Task 8 `restoreSession skips unknown collections`.
3. **The settings file can't be read at start-up.** The sample library and the person's folders must still be listed, a message must be shown, and no save may be attempted. Test: Task 8 `init keeps folders and refuses saves when the library cannot be read`.
4. **A second damaged settings file.** The first backup must not be overwritten. Test: Task 1 `second_damage_keeps_first_backup`.
5. **Switching tabs quickly while a slow document read is pending.** The wrong document must never appear in a pane. This is covered by design: each document view is keyed by tab and document, and it ignores late results. Manual check: Task 13, step 3, item 6.

---

### Task 1: Rust core: open a single file, and keep every settings backup

**Files:**
- Modify: `app/src-tauri/src/library.rs`, `app/src-tauri/src/workspace.rs`, `app/src-tauri/src/commands.rs`, `app/src-tauri/src/lib.rs`

**Interfaces:**
- Produces:
  - `workspace::split_file(file: &Path) -> Result<(PathBuf, String), AppError>`
  - `commands::OpenedFile { collection: Collection, path: String }`, serialized as `{ collection, path }`
  - the Tauri command `pick_file() -> OpenedFile | null`
  - On damage, `library::load` now renames the file to `library.json.bak`, or to the first free `library.json.bak.N`.

- [ ] **Step 1: Write the failing tests.**

  In `library.rs` `mod tests`:
  ```rust
  #[test]
  fn second_damage_keeps_first_backup() {
      let d = tempfile::tempdir().unwrap();
      fs::write(d.path().join("library.json"), "first").unwrap();
      assert!(load(d.path()).unwrap().reset);
      fs::write(d.path().join("library.json"), "second").unwrap();
      assert!(load(d.path()).unwrap().reset);
      assert_eq!(fs::read_to_string(d.path().join("library.json.bak")).unwrap(), "first");
      assert_eq!(fs::read_to_string(d.path().join("library.json.bak.1")).unwrap(), "second");
  }
  ```

  In `workspace.rs` `mod tests`:
  ```rust
  #[test]
  fn split_file_gives_folder_and_name() {
      let (root, name) = split_file(Path::new("/docs/wiki/README.md")).unwrap();
      assert_eq!(root, PathBuf::from("/docs/wiki"));
      assert_eq!(name, "README.md");
  }

  #[test]
  fn split_file_rejects_a_bare_root() {
      assert_eq!(split_file(Path::new("/")).unwrap_err(), AppError::NotFound);
  }
  ```

- [ ] **Step 2: Run the tests and confirm they fail.**

  Run in `app/src-tauri`: `export PATH="$USERPROFILE/.cargo/bin:$PATH"; export CARGO_TARGET_DIR="$LOCALAPPDATA/folio-target"; cargo test library:: workspace::`

  Expected: the backup test fails with `left: "second"`, and `split_file` doesn't compile because it doesn't exist yet.

- [ ] **Step 3: Implement.**

  `library.rs`:
  - Import `path::{Path, PathBuf}`.
  - In `load`, replace `fs::rename(&path, dir.join(BACKUP))?;` with `fs::rename(&path, free_backup_path(dir))?;`.
  - Add:
  ```rust
  /// library.json.bak, then .bak.1, .bak.2 … so a later damaged file never overwrites an earlier copy.
  fn free_backup_path(dir: &Path) -> PathBuf {
      let first = dir.join(BACKUP);
      if !first.exists() {
          return first;
      }
      (1..).map(|n| dir.join(format!("{BACKUP}.{n}"))).find(|p| !p.exists()).expect("unbounded range")
  }
  ```

  `workspace.rs`:
  ```rust
  /// "C:\docs\wiki\README.md" -> ("C:\docs\wiki", "README.md")
  pub fn split_file(file: &Path) -> Result<(PathBuf, String), AppError> {
      let name = file.file_name().ok_or(AppError::NotFound)?.to_string_lossy().into_owned();
      let parent = file.parent().ok_or(AppError::NotFound)?;
      Ok((parent.to_path_buf(), name))
  }
  ```

  `commands.rs`: add `use serde::Serialize;` and `use std::path::Path;` if they're needed, then:
  ```rust
  #[derive(Debug, Serialize)]
  #[serde(rename_all = "camelCase")]
  pub struct OpenedFile {
      pub collection: Collection,
      pub path: String,
  }

  /// Opening one document adds its folder as a collection, so links to neighbouring pages keep working (spec amendment A1).
  #[tauri::command]
  pub async fn pick_file(app: AppHandle, state: State<'_, AppState>) -> Result<Option<OpenedFile>, AppError> {
      let Some(picked) = app
          .dialog()
          .file()
          .add_filter("Documents", &["md", "markdown", "txt"])
          .blocking_pick_file()
      else {
          return Ok(None);
      };
      let file = dunce::canonicalize(picked.into_path().map_err(|e| AppError::Internal(e.to_string()))?)?;
      let (root, path) = workspace::split_file(&file)?;
      let collection = state.add_collection(Collection::new(root));
      state.persist_collections()?;
      Ok(Some(OpenedFile { collection, path }))
  }
  ```

  `lib.rs`: add `commands::pick_file,` to `generate_handler!`.

- [ ] **Step 4: Run the tests and checks.**

  - `cargo test`: everything passes.
  - `cargo build`: no warnings.
  - In `app/`, `npm run check:readonly`: passes. `library.rs` is the only writer.

- [ ] **Step 5: Commit.** `feat(core): open a single document with its folder, keep every settings backup`

---

### Task 2: Library data model (`lib/library.ts`)

**Files:**
- Create: `app/src/lib/library.ts` and `app/src/lib/library.test.ts`

**Interfaces:**
- Consumes:
  - `normalizePrefs` and `Prefs` from Task 3. Implement Task 3 first if executing out of order, or temporarily stub `normalizePrefs = (r) => r`. The stub is not allowed in the commit.
  - `Session` from Task 4.
- Produces:
  - `LibraryData` and `RecentEntry`
  - `MAX_RECENT = 30`
  - `docKey(cid, path)` and `parseKey(key)`
  - `parseLibrary(raw)` and `toRaw(lib)`
  - `addRecent(lib, key, now?)`, `toggleFavorite(lib, key): boolean`, `toggleFavoriteCollection(lib, id): boolean` and `recordProgress(lib, key, pct): boolean`

**Execution order note:** Tasks 2–4 depend on each other's types. Implement them in the order **3, 4, 2**. The numbering follows the reading order.

- [ ] **Step 1: Write the failing tests.** Create `app/src/lib/library.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { addRecent, docKey, MAX_RECENT, parseKey, parseLibrary, recordProgress, toggleFavorite, toggleFavoriteCollection, toRaw } from './library';
import { DEFAULT_PREFS } from './prefs';

describe('library', () => {
  it('starts from defaults for an empty or Plan 1 library', () => {
    const lib = parseLibrary({ version: 1, collections: [] });
    expect(lib.prefs).toEqual(DEFAULT_PREFS);
    expect(lib.favorites).toEqual([]);
    expect(lib.recent).toEqual([]);
    expect(lib.session).toBeNull();
  });

  it('tolerates missing and malformed fields', () => {
    const lib = parseLibrary({
      favorites: ['sample/README.md', 7, null],
      recent: [{ key: 'sample/a.md', at: 5 }, { key: 3 }, 'x'],
      progress: { 'sample/a.md': 40, 'sample/b.md': 'lots', 'sample/c.md': 250 },
      session: { panes: 'nope' },
      prefs: { theme: 'neon', fontSize: 99 },
    });
    expect(lib.favorites).toEqual(['sample/README.md']);
    expect(lib.recent).toEqual([{ key: 'sample/a.md', at: 5 }]);
    expect(lib.progress).toEqual({ 'sample/a.md': 40 });
    expect(lib.session).toBeNull();
    expect(lib.prefs.theme).toBe('light');
    expect(lib.prefs.fontSize).toBe(28);
  });

  it('keeps unknown keys and leaves collections to the core', () => {
    const raw = toRaw(parseLibrary({ version: 1, collections: [{ id: 'x' }], bookmarks: [{ id: 'b1' }] }));
    expect(raw.bookmarks).toEqual([{ id: 'b1' }]);
    expect(raw.version).toBe(1);
    expect('collections' in raw).toBe(false);
  });

  it('records recent documents newest first, without duplicates, capped', () => {
    const lib = parseLibrary({});
    addRecent(lib, 'sample/a.md', 1);
    addRecent(lib, 'sample/b.md', 2);
    addRecent(lib, 'sample/a.md', 3);
    expect(lib.recent.map((r) => r.key)).toEqual(['sample/a.md', 'sample/b.md']);
    for (let i = 0; i < 40; i++) addRecent(lib, `sample/${i}.md`, 10 + i);
    expect(lib.recent).toHaveLength(MAX_RECENT);
  });

  it('toggles favorites and favorite collections', () => {
    const lib = parseLibrary({});
    expect(toggleFavorite(lib, 'sample/a.md')).toBe(true);
    expect(lib.favorites).toEqual(['sample/a.md']);
    expect(toggleFavorite(lib, 'sample/a.md')).toBe(false);
    expect(lib.favorites).toEqual([]);
    expect(toggleFavoriteCollection(lib, 'sample')).toBe(true);
    expect(lib.favoriteCollections).toEqual(['sample']);
  });

  it('keeps the furthest reading progress', () => {
    const lib = parseLibrary({});
    expect(recordProgress(lib, 'sample/a.md', 40.4)).toBe(true);
    expect(recordProgress(lib, 'sample/a.md', 10)).toBe(false);
    expect(lib.progress['sample/a.md']).toBe(40);
  });

  it('builds and splits document keys', () => {
    expect(docKey('abc', 'Guides/x.md')).toBe('abc/Guides/x.md');
    expect(parseKey('abc/Guides/x.md')).toEqual({ collectionId: 'abc', path: 'Guides/x.md' });
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail.**

  Run in `app/`: `npx vitest run src/lib/library.test.ts`

  Expected: FAIL, because `./library` can't be resolved.

- [ ] **Step 3: Implement.** Create `app/src/lib/library.ts`:
```ts
import { normalizePrefs, type Prefs } from './prefs';
import type { Session } from './workspace';

export interface RecentEntry { key: string; at: number }

export interface LibraryData {
  prefs: Prefs;
  favorites: string[];
  favoriteCollections: string[];
  recent: RecentEntry[];
  progress: Record<string, number>;
  session: Session | null;
  /** Keys this version doesn't manage (later plans' data), kept so a save never drops them. */
  extra: Record<string, unknown>;
}

export const MAX_RECENT = 30;
const OWNED = ['prefs', 'favorites', 'favoriteCollections', 'recent', 'progress', 'session', 'version', 'collections'];

export const docKey = (collectionId: string, path: string) => `${collectionId}/${path}`;

export function parseKey(key: string): { collectionId: string; path: string } {
  const i = key.indexOf('/');
  return { collectionId: key.slice(0, i), path: key.slice(i + 1) };
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

const isRecent = (r: unknown): r is RecentEntry =>
  !!r && typeof r === 'object' && typeof (r as RecentEntry).key === 'string' && typeof (r as RecentEntry).at === 'number';

const isSession = (v: unknown): v is Session => {
  const s = v as Session;
  return !!s && typeof s === 'object' && Array.isArray(s.panes) && typeof s.split === 'boolean' && typeof s.ratio === 'number';
};

export function parseLibrary(raw: Record<string, unknown>): LibraryData {
  const progress: Record<string, number> = {};
  if (raw.progress && typeof raw.progress === 'object') {
    for (const [k, v] of Object.entries(raw.progress)) if (typeof v === 'number' && v >= 0 && v <= 100) progress[k] = v;
  }
  return {
    prefs: normalizePrefs(raw.prefs),
    favorites: strings(raw.favorites),
    favoriteCollections: strings(raw.favoriteCollections),
    recent: (Array.isArray(raw.recent) ? raw.recent.filter(isRecent) : []).slice(0, MAX_RECENT),
    progress,
    session: isSession(raw.session) ? raw.session : null,
    extra: Object.fromEntries(Object.entries(raw).filter(([k]) => !OWNED.includes(k))),
  };
}

/** The JSON sent to `save_library`. The core adds `collections` itself. */
export function toRaw(lib: LibraryData): Record<string, unknown> {
  const { extra, ...owned } = lib;
  return { ...extra, ...owned, version: 1 };
}

export function addRecent(lib: LibraryData, key: string, now = Date.now()): void {
  lib.recent = [{ key, at: now }, ...lib.recent.filter((r) => r.key !== key)].slice(0, MAX_RECENT);
}

export function toggleFavorite(lib: LibraryData, key: string): boolean {
  const on = lib.favorites.includes(key);
  lib.favorites = on ? lib.favorites.filter((k) => k !== key) : [key, ...lib.favorites];
  return !on;
}

export function toggleFavoriteCollection(lib: LibraryData, id: string): boolean {
  const on = lib.favoriteCollections.includes(id);
  lib.favoriteCollections = on ? lib.favoriteCollections.filter((k) => k !== id) : [...lib.favoriteCollections, id];
  return !on;
}

/** Keeps the furthest point read. Returns true when it changed, so the caller knows to save. */
export function recordProgress(lib: LibraryData, key: string, pct: number): boolean {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  if (p <= (lib.progress[key] ?? 0)) return false;
  lib.progress[key] = p;
  return true;
}
```

- [ ] **Step 4: Run the tests and confirm they pass.** Run `npx vitest run src/lib/library.test.ts`. Expected: 7 passed.
- [ ] **Step 5: Commit.** `feat(app): add the library data model with tolerant parsing`

---

### Task 3: Preferences and themes (`lib/prefs.ts`)

**Files:**
- Create: `app/src/lib/prefs.ts` and `app/src/lib/prefs.test.ts`

**Interfaces:**
- Produces:
  - Types: `ThemeId`, `FontId`, `Lang`, `Prefs` and `Theme`.
  - Constants: `THEMES`, `DEFAULT_PREFS` and `LIMITS`.
  - Functions: `normalizePrefs(raw)`, `themeOf(id)`, `isDark(prefs, systemDark)` and `applyPrefs(prefs, root, systemDark)`.
  - `applyPrefs` writes the attributes and CSS variables that the prototype CSS reads: `data-theme`, `data-palette`, `data-contrast`, `data-motion`, `--read-size`, `--read-width`, `--read-lh`, `--read-font`, the root `font-size`, and `lang`.

- [ ] **Step 1: Write the failing tests.** Create `app/src/lib/prefs.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyPrefs, DEFAULT_PREFS, isDark, normalizePrefs, THEMES } from './prefs';

describe('prefs', () => {
  it('lists the eight prototype themes in order', () => {
    expect(THEMES.map((t) => t.id)).toEqual(['system', 'light', 'sepia', 'slate', 'rose', 'dark', 'dusk', 'ember']);
  });

  it('normalizes unknown input to defaults and clamps numbers', () => {
    expect(normalizePrefs(undefined)).toEqual(DEFAULT_PREFS);
    const p = normalizePrefs({ theme: 'dusk', fontSize: 2, width: 500, lineHeight: 'x', zoom: 120, font: 'comic', lang: 'fr', contrast: 1 });
    expect(p).toMatchObject({ theme: 'dusk', fontSize: 14, width: 100, lineHeight: 1.7, zoom: 120, font: 'serif', lang: 'en', contrast: false });
  });

  it('applies a palette theme on its light or dark base', () => {
    const root = document.createElement('html');
    applyPrefs({ ...DEFAULT_PREFS, theme: 'sepia', fontSize: 20, font: 'easy' }, root, false);
    expect(root.dataset.theme).toBe('light');
    expect(root.dataset.palette).toBe('sepia');
    expect(root.style.getPropertyValue('--read-size')).toBe('1.25rem');
    expect(root.style.getPropertyValue('--read-font')).toBe('var(--font-easy)');
    applyPrefs({ ...DEFAULT_PREFS, theme: 'dark' }, root, false);
    expect(root.dataset.theme).toBe('dark');
    expect(root.dataset.palette).toBeUndefined();
  });

  it('follows the system for Automatic', () => {
    const root = document.createElement('html');
    applyPrefs({ ...DEFAULT_PREFS, theme: 'system', contrast: true, reduceMotion: true }, root, true);
    expect(root.dataset.theme).toBeUndefined();
    expect(root.dataset.contrast).toBe('high');
    expect(root.dataset.motion).toBe('reduce');
    expect(isDark({ ...DEFAULT_PREFS, theme: 'system' }, true)).toBe(true);
    expect(isDark({ ...DEFAULT_PREFS, theme: 'ember' }, false)).toBe(true);
    expect(isDark({ ...DEFAULT_PREFS, theme: 'rose' }, true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx vitest run src/lib/prefs.test.ts`. Expected: FAIL, the module isn't found.

- [ ] **Step 3: Implement.** Create `app/src/lib/prefs.ts`:
```ts
export type ThemeId = 'system' | 'light' | 'sepia' | 'slate' | 'rose' | 'dark' | 'dusk' | 'ember';
export type FontId = 'serif' | 'sans' | 'easy';
export type Lang = 'en' | 'es' | 'de';

export interface Prefs {
  theme: ThemeId;
  contrast: boolean;
  fontSize: number;
  width: number;
  lineHeight: number;
  zoom: number;
  font: FontId;
  reduceMotion: boolean;
  lang: Lang;
}

export interface Theme {
  id: ThemeId;
  name: string;
  base: 'light' | 'dark' | null;
  preview: { page: string; text: string; accent: string };
}

/** Exactly the prototype's themes (index.html, const THEMES). */
export const THEMES: readonly Theme[] = [
  { id: 'system', name: 'Automatic', base: null, preview: { page: 'linear-gradient(135deg, #FFFFFF 50%, #181C19 50%)', text: '#7F8A83', accent: '#2E6A54' } },
  { id: 'light', name: 'Paper', base: 'light', preview: { page: '#FFFFFF', text: '#1C211E', accent: '#2E6A54' } },
  { id: 'sepia', name: 'Sepia', base: 'light', preview: { page: '#FBF5E9', text: '#3B2F22', accent: '#8A4B22' } },
  { id: 'slate', name: 'Slate', base: 'light', preview: { page: '#FFFFFF', text: '#1A2230', accent: '#2457A6' } },
  { id: 'rose', name: 'Rose', base: 'light', preview: { page: '#FFFFFF', text: '#2A1F22', accent: '#9C3554' } },
  { id: 'dark', name: 'Night', base: 'dark', preview: { page: '#181C19', text: '#E3E7E2', accent: '#7BC3A5' } },
  { id: 'dusk', name: 'Dusk', base: 'dark', preview: { page: '#161D2D', text: '#E2E7F0', accent: '#8FB4FF' } },
  { id: 'ember', name: 'Ember', base: 'dark', preview: { page: '#1C1815', text: '#ECE4DA', accent: '#E8A75A' } },
];

export const DEFAULT_PREFS: Prefs = {
  theme: 'light', contrast: false, fontSize: 18, width: 68, lineHeight: 1.7, zoom: 100, font: 'serif', reduceMotion: false, lang: 'en',
};

export const LIMITS = {
  fontSize: [14, 28],
  width: [45, 100],
  lineHeight: [1.3, 2.2],
  zoom: [80, 150],
} as const satisfies Record<string, readonly [number, number]>;

const FONTS: readonly FontId[] = ['serif', 'sans', 'easy'];
const LANGS: readonly Lang[] = ['en', 'es', 'de'];

const clamp = (v: unknown, [lo, hi]: readonly [number, number], fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

export function normalizePrefs(raw: unknown): Prefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_PREFS;
  return {
    theme: THEMES.some((t) => t.id === r.theme) ? (r.theme as ThemeId) : d.theme,
    contrast: typeof r.contrast === 'boolean' ? r.contrast : d.contrast,
    fontSize: clamp(r.fontSize, LIMITS.fontSize, d.fontSize),
    width: clamp(r.width, LIMITS.width, d.width),
    lineHeight: clamp(r.lineHeight, LIMITS.lineHeight, d.lineHeight),
    zoom: clamp(r.zoom, LIMITS.zoom, d.zoom),
    font: FONTS.includes(r.font as FontId) ? (r.font as FontId) : d.font,
    reduceMotion: typeof r.reduceMotion === 'boolean' ? r.reduceMotion : d.reduceMotion,
    lang: LANGS.includes(r.lang as Lang) ? (r.lang as Lang) : d.lang,
  };
}

export const themeOf = (id: ThemeId): Theme => THEMES.find((t) => t.id === id) ?? THEMES[1];

export function isDark(prefs: Prefs, systemDark: boolean): boolean {
  const base = themeOf(prefs.theme).base;
  return base ? base === 'dark' : systemDark;
}

/** Writes what the prototype CSS reads (tokens.css: data-theme, data-palette, data-contrast, data-motion, --read-*). */
export function applyPrefs(prefs: Prefs, root: HTMLElement, systemDark: boolean): void {
  void systemDark; // "Automatic" is resolved by the CSS media query; kept for symmetry with isDark
  const base = themeOf(prefs.theme).base;
  if (base) root.dataset.theme = base;
  else delete root.dataset.theme;
  if (base && prefs.theme !== base) root.dataset.palette = prefs.theme;
  else delete root.dataset.palette;
  root.dataset.contrast = prefs.contrast ? 'high' : 'normal';
  root.dataset.motion = prefs.reduceMotion ? 'reduce' : 'system';
  root.style.fontSize = `${prefs.zoom}%`;
  root.style.setProperty('--read-size', `${prefs.fontSize / 16}rem`);
  root.style.setProperty('--read-width', `${prefs.width}ch`);
  root.style.setProperty('--read-lh', String(prefs.lineHeight));
  root.style.setProperty('--read-font', `var(--font-${prefs.font})`);
  root.lang = prefs.lang;
}
```

- [ ] **Step 4: Run the tests and confirm they pass.** Run `npx vitest run src/lib/prefs.test.ts`. Expected: 4 passed.
- [ ] **Step 5: Commit.** `feat(app): add preferences with the eight prototype themes`

---

### Task 4: Tabs and panes model (`lib/workspace.ts`)

**Files:**
- Create: `app/src/lib/workspace.ts` and `app/src/lib/workspace.test.ts`

**Interfaces:**
- Produces:
  - **Types:** `Entry { key, scroll, slug }`, `Tab { id, history, index }`, `Pane { tabs, activeId }`, `PaneIndex`, `WorkspaceState { panes, split, ratio, activePane, nextId }`, `SessionPane`, `Session` and `OpenMode`.
  - **Functions:** `emptyWorkspace()`, `current(tab)`, `activeTab(ws, pane?)`, `activeKey(ws, pane?)`, `openDoc(ws, key, opts)`, `go(ws, pane, delta)`, `activateTab(ws, pane, id)`, `closeTab(ws, pane, id)`, `setSplit(ws, on, companionKey)`, `setRatio(ws, r)`, `toSession(ws, activeCollection, now?)` and `fromSession(session, keep)`.
  - Every function mutates the state it's given. That works on plain objects in tests and on Svelte `$state` proxies in the store.

- [ ] **Step 1: Write the failing tests.** Create `app/src/lib/workspace.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { activeKey, activeTab, closeTab, current, emptyWorkspace, fromSession, go, openDoc, setRatio, setSplit, toSession } from './workspace';

describe('workspace', () => {
  it('opens a document in a new tab, and re-activates an open one', () => {
    const ws = emptyWorkspace();
    openDoc(ws, 's/a.md');
    openDoc(ws, 's/b.md');
    openDoc(ws, 's/a.md', { slug: 'intro' });
    expect(ws.panes[0].tabs).toHaveLength(2);
    expect(activeKey(ws)).toBe('s/a.md');
    expect(current(activeTab(ws)!).slug).toBe('intro');
  });

  it('navigates inside a tab with back and forward history', () => {
    const ws = emptyWorkspace();
    openDoc(ws, 's/a.md');
    openDoc(ws, 's/b.md', { mode: 'navigate' });
    openDoc(ws, 's/c.md', { mode: 'navigate' });
    expect(ws.panes[0].tabs).toHaveLength(1);
    expect(go(ws, 0, -1)).toBe(true);
    expect(activeKey(ws)).toBe('s/b.md');
    openDoc(ws, 's/d.md', { mode: 'navigate' });
    expect(go(ws, 0, 1)).toBe(false); // forward history was replaced
    expect(activeTab(ws)!.history.map((e) => e.key)).toEqual(['s/a.md', 's/b.md', 's/d.md']);
  });

  it('closes a tab and activates its neighbour', () => {
    const ws = emptyWorkspace();
    ['s/a.md', 's/b.md', 's/c.md'].forEach((k) => openDoc(ws, k));
    openDoc(ws, 's/b.md');
    closeTab(ws, 0, activeTab(ws)!.id);
    expect(activeKey(ws)).toBe('s/c.md');
  });

  it('splits with a companion document and merges back without duplicates', () => {
    const ws = emptyWorkspace();
    openDoc(ws, 's/a.md');
    openDoc(ws, 's/b.md', { pane: 1 }); // not split yet: goes to pane 0
    expect(ws.panes[0].tabs).toHaveLength(2);
    setSplit(ws, true, 's/g.md');
    expect(ws.activePane).toBe(1);
    expect(activeKey(ws, 1)).toBe('s/g.md');
    openDoc(ws, 's/a.md', { pane: 1 });
    setSplit(ws, false, null);
    expect(ws.split).toBe(false);
    expect(ws.panes[1].tabs).toHaveLength(0);
    expect(ws.panes[0].tabs.map((t) => current(t).key)).toEqual(['s/a.md', 's/b.md', 's/g.md']);
  });

  it('clamps the split ratio', () => {
    const ws = emptyWorkspace();
    setRatio(ws, 0.1);
    expect(ws.ratio).toBe(0.25);
    setRatio(ws, 0.9);
    expect(ws.ratio).toBe(0.75);
  });

  it('round-trips a session', () => {
    const ws = emptyWorkspace();
    openDoc(ws, 's/a.md');
    openDoc(ws, 's/b.md');
    activeTab(ws)!.history[0].scroll = 420.6;
    setSplit(ws, true, 's/g.md');
    const back = fromSession(toSession(ws, 's', 7), () => true);
    expect(back.split).toBe(true);
    expect(back.panes[0].tabs.map((t) => current(t).key)).toEqual(['s/a.md', 's/b.md']);
    expect(current(activeTab(back, 0)!).key).toBe('s/b.md');
    expect(current(activeTab(back, 0)!).scroll).toBe(421);
    expect(activeKey(back, 1)).toBe('s/g.md');
  });

  it('fromSession drops tabs whose key is rejected', () => {
    const session = { split: true, ratio: 0.5, activeCollection: 'gone', at: 1, panes: [
      { tabs: [{ key: 'gone/a.md', scroll: 0 }, { key: 's/b.md', scroll: 0 }], active: 0 },
      { tabs: [{ key: 'gone/c.md', scroll: 0 }], active: 0 },
    ] };
    const ws = fromSession(session, (k) => !k.startsWith('gone/'));
    expect(ws.panes[0].tabs.map((t) => current(t).key)).toEqual(['s/b.md']);
    expect(activeKey(ws, 0)).toBe('s/b.md');
    expect(ws.split).toBe(false); // the right side had nothing left
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx vitest run src/lib/workspace.test.ts`. Expected: FAIL, the module isn't found.

- [ ] **Step 3: Implement.** Create `app/src/lib/workspace.ts`:
```ts
export interface Entry { key: string; scroll: number; slug: string | null }
export interface Tab { id: number; history: Entry[]; index: number }
export interface Pane { tabs: Tab[]; activeId: number | null }
export type PaneIndex = 0 | 1;
export interface WorkspaceState { panes: [Pane, Pane]; split: boolean; ratio: number; activePane: PaneIndex; nextId: number }
export interface SessionPane { tabs: { key: string; scroll: number }[]; active: number }
export interface Session { panes: SessionPane[]; split: boolean; ratio: number; activeCollection: string | null; at: number }
export type OpenMode = 'tab' | 'navigate';

export const emptyWorkspace = (): WorkspaceState => ({
  panes: [{ tabs: [], activeId: null }, { tabs: [], activeId: null }], split: false, ratio: 0.5, activePane: 0, nextId: 1,
});

export const current = (tab: Tab): Entry => tab.history[tab.index];

export const activeTab = (ws: WorkspaceState, pane: PaneIndex = ws.activePane): Tab | undefined =>
  ws.panes[pane].tabs.find((t) => t.id === ws.panes[pane].activeId);

export const activeKey = (ws: WorkspaceState, pane: PaneIndex = ws.activePane): string | null => {
  const t = activeTab(ws, pane);
  return t ? current(t).key : null;
};

const newTab = (ws: WorkspaceState, key: string, slug: string | null): Tab =>
  ({ id: ws.nextId++, history: [{ key, scroll: 0, slug }], index: 0 });

/** 'tab' reuses a tab already showing the document, else opens one; 'navigate' moves the active tab forward. */
export function openDoc(ws: WorkspaceState, key: string, opts: { mode?: OpenMode; pane?: PaneIndex; slug?: string | null } = {}): void {
  const { mode = 'tab', slug = null } = opts;
  const target: PaneIndex = ws.split ? (opts.pane ?? ws.activePane) : 0;
  const pane = ws.panes[target];
  let tab = mode === 'tab' ? pane.tabs.find((t) => current(t).key === key) : activeTab(ws, target);
  if (!tab) {
    tab = newTab(ws, key, slug);
    pane.tabs.push(tab);
  } else if (current(tab).key === key) {
    if (slug) current(tab).slug = slug;
  } else {
    tab.history = tab.history.slice(0, tab.index + 1);
    tab.history.push({ key, scroll: 0, slug });
    tab.index = tab.history.length - 1;
  }
  pane.activeId = tab.id;
  ws.activePane = target;
}

export function go(ws: WorkspaceState, pane: PaneIndex, delta: -1 | 1): boolean {
  const tab = activeTab(ws, pane);
  if (!tab) return false;
  const next = tab.index + delta;
  if (next < 0 || next >= tab.history.length) return false;
  tab.index = next;
  return true;
}

export function activateTab(ws: WorkspaceState, pane: PaneIndex, id: number): void {
  if (!ws.panes[pane].tabs.some((t) => t.id === id)) return;
  ws.panes[pane].activeId = id;
  ws.activePane = pane;
}

export function closeTab(ws: WorkspaceState, pane: PaneIndex, id: number): void {
  const p = ws.panes[pane];
  const i = p.tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  p.tabs.splice(i, 1);
  if (p.activeId === id) p.activeId = (p.tabs[i] ?? p.tabs[i - 1])?.id ?? null;
}

export function setSplit(ws: WorkspaceState, on: boolean, companionKey: string | null): void {
  if (on === ws.split) return;
  if (on) {
    ws.split = true;
    if (!ws.panes[1].tabs.length && companionKey) {
      const tab = newTab(ws, companionKey, null);
      ws.panes[1].tabs.push(tab);
      ws.panes[1].activeId = tab.id;
    }
    ws.activePane = 1;
    return;
  }
  const [left, right] = ws.panes;
  for (const tab of right.tabs) if (!left.tabs.some((t) => current(t).key === current(tab).key)) left.tabs.push(tab);
  if (left.activeId === null && left.tabs.length) left.activeId = left.tabs[0].id;
  ws.panes[1] = { tabs: [], activeId: null };
  ws.split = false;
  ws.activePane = 0;
}

export function setRatio(ws: WorkspaceState, r: number): void {
  ws.ratio = Math.min(0.75, Math.max(0.25, r));
}

export function toSession(ws: WorkspaceState, activeCollection: string | null, now = Date.now()): Session {
  return {
    split: ws.split,
    ratio: ws.ratio,
    activeCollection,
    at: now,
    panes: ws.panes.map((p) => ({
      tabs: p.tabs.map((t) => ({ key: current(t).key, scroll: Math.round(current(t).scroll) })),
      active: Math.max(0, p.tabs.findIndex((t) => t.id === p.activeId)),
    })),
  };
}

/** Rebuilds a workspace, dropping any tab whose key `keep` rejects (a removed folder, a deleted file). */
export function fromSession(session: Session, keep: (key: string) => boolean): WorkspaceState {
  const ws = emptyWorkspace();
  session.panes.slice(0, 2).forEach((sp, i) => {
    const pane = ws.panes[i as PaneIndex];
    const saved = Array.isArray(sp?.tabs) ? sp.tabs : [];
    for (const t of saved) {
      if (!t || typeof t.key !== 'string' || !keep(t.key)) continue;
      const tab = newTab(ws, t.key, null);
      tab.history[0].scroll = typeof t.scroll === 'number' ? t.scroll : 0;
      pane.tabs.push(tab);
    }
    const wanted = Math.min(Math.max(0, Number(sp?.active) || 0), pane.tabs.length - 1);
    pane.activeId = pane.tabs[wanted]?.id ?? null;
  });
  setRatio(ws, typeof session.ratio === 'number' ? session.ratio : 0.5);
  if (ws.panes[1].tabs.length) {
    ws.split = true;
    if (!session.split) setSplit(ws, false, null); // a stray right side merges into the left
  }
  ws.activePane = 0;
  return ws;
}
```

- [ ] **Step 4: Run the tests and confirm they pass.** Run `npx vitest run src/lib/workspace.test.ts`. Expected: 7 passed.
- [ ] **Step 5: Commit.** `feat(app): add the tabs and side-by-side model with session save and restore`

---

### Task 5: Contents panel, saver and translations (`lib/toc.ts`, `lib/saver.ts`, `lib/i18n.ts`)

**Files:**
- Create: `app/src/lib/toc.ts`, `app/src/lib/toc.test.ts`, `app/src/lib/saver.ts`, `app/src/lib/saver.test.ts`, `app/src/lib/i18n.ts` and `app/src/lib/i18n.test.ts`

**Interfaces:**
- **Contents panel:**
  - Types: `HeadingInfo { slug, text, level, top }` and `TocNode { slug, text, level, children }`.
  - `buildToc(headings)` excludes level 1.
  - `currentSlug(headings, scrollTop, clientHeight, scrollHeight, offset = 90)`
  - `readingPercent(scrollTop, scrollHeight, clientHeight)`
- **Saver:**
  - `Saver { schedule(): void; flush(): Promise<void> }`
  - `createSaver(save, delayMs, onError)`: saves at most once per `delayMs`. `flush` saves at once if anything is pending.
- **Translations:** `Key` and `t(lang, key)`. English is complete; Spanish and German cover the main navigation and headings and fall back to English.

- [ ] **Step 1: Write the failing tests.**

`app/src/lib/toc.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildToc, currentSlug, readingPercent } from './toc';

const h = (slug: string, level: number, top: number) => ({ slug, text: slug, level, top });

describe('toc', () => {
  it('nests h3 under h2 and leaves out the title', () => {
    const toc = buildToc([h('title', 1, 0), h('a', 2, 100), h('a1', 3, 200), h('b', 2, 300)]);
    expect(toc.map((n) => n.slug)).toEqual(['a', 'b']);
    expect(toc[0].children.map((n) => n.slug)).toEqual(['a1']);
  });

  it('finds the section being read, and the last one at the bottom', () => {
    const hs = [h('title', 1, 0), h('a', 2, 500), h('b', 2, 1500)];
    expect(currentSlug(hs, 0, 800, 3000)).toBe('title');
    expect(currentSlug(hs, 1450, 800, 3000)).toBe('b');
    expect(currentSlug(hs, 2200, 800, 3000)).toBe('b');
    expect(currentSlug([], 0, 800, 3000)).toBeNull();
  });

  it('computes reading progress, treating short pages as read', () => {
    expect(readingPercent(0, 3000, 1000)).toBe(0);
    expect(readingPercent(1000, 3000, 1000)).toBe(50);
    expect(readingPercent(0, 900, 1000)).toBe(100);
  });
});
```

`app/src/lib/saver.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaver } from './saver';

describe('saver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('saves at most once per interval', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const s = createSaver(save, 1000, vi.fn());
    s.schedule(); s.schedule(); s.schedule();
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flushes pending work at once, and does nothing when idle', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const s = createSaver(save, 1000, vi.fn());
    await s.flush();
    expect(save).not.toHaveBeenCalled();
    s.schedule();
    await s.flush();
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('reports a failed save', async () => {
    const onError = vi.fn();
    const s = createSaver(() => Promise.reject({ code: 'Internal' }), 1000, onError);
    s.schedule();
    await s.flush();
    expect(onError).toHaveBeenCalledWith({ code: 'Internal' });
  });
});
```

`app/src/lib/i18n.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { t } from './i18n';

describe('i18n', () => {
  it('translates main navigation and falls back to English', () => {
    expect(t('es', 'favorites')).toBe('Favoritos');
    expect(t('de', 'contents')).toBe('Auf dieser Seite');
    expect(t('de', 'favoritesEmpty')).toBe(t('en', 'favoritesEmpty'));
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx vitest run src/lib/toc.test.ts src/lib/saver.test.ts src/lib/i18n.test.ts`. Expected: FAIL, the modules aren't found.

- [ ] **Step 3: Implement.**

`app/src/lib/toc.ts`:
```ts
export interface HeadingInfo { slug: string; text: string; level: number; top: number }
export interface TocNode { slug: string; text: string; level: number; children: TocNode[] }

export function buildToc(headings: HeadingInfo[]): TocNode[] {
  const roots: TocNode[] = [];
  const stack: TocNode[] = [];
  for (const h of headings) {
    if (h.level < 2) continue;
    const node: TocNode = { slug: h.slug, text: h.text, level: h.level, children: [] };
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
    (stack.length ? stack[stack.length - 1].children : roots).push(node);
    stack.push(node);
  }
  return roots;
}

export function currentSlug(headings: HeadingInfo[], scrollTop: number, clientHeight: number, scrollHeight: number, offset = 90): string | null {
  if (!headings.length) return null;
  if (scrollTop > 0 && scrollTop + clientHeight >= scrollHeight - 4) return headings[headings.length - 1].slug;
  let cur = headings[0];
  for (const h of headings) {
    if (h.top <= scrollTop + offset) cur = h;
    else break;
  }
  return cur.slug;
}

export function readingPercent(scrollTop: number, scrollHeight: number, clientHeight: number): number {
  const max = scrollHeight - clientHeight;
  return max <= 4 ? 100 : Math.min(100, Math.max(0, Math.round((scrollTop / max) * 100)));
}
```

`app/src/lib/saver.ts`:
```ts
export interface Saver { schedule(): void; flush(): Promise<void> }

/** Coalesces saves: the first schedule() starts the clock, later ones join it (at most one save per delayMs). */
export function createSaver(save: () => Promise<void>, delayMs: number, onError: (e: unknown) => void): Saver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;
  const run = async () => {
    timer = null;
    if (!pending) return;
    pending = false;
    try {
      await save();
    } catch (e) {
      onError(e);
    }
  };
  return {
    schedule() {
      pending = true;
      if (!timer) timer = setTimeout(run, delayMs);
    },
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await run();
    },
  };
}
```

`app/src/lib/i18n.ts`:
```ts
import type { Lang } from './prefs';

const en = {
  home: 'Home', appearance: 'Appearance', preferences: 'Preferences', toggleSidebar: 'Show or hide the library panel',
  toggleContents: 'Show or hide the contents panel', contents: 'On this page', library: 'Library',
  collections: 'Your folders', documents: 'Documents', filterDocs: 'Filter documents', favorites: 'Favorites',
  favoritesEmpty: 'Select the star on a document to keep it here.', recent: 'Recent', recentEmpty: 'Documents you open appear here.',
  unavailable: 'Unavailable', openFolder: 'Open a folder', openFolderHint: 'Browse a whole wiki or notes folder',
  openFile: 'Open a document', openFileHint: 'Read one file; its folder opens too', sample: 'Explore the sample library',
  sampleHint: 'A small handbook to try everything out', eyebrow: 'Local document reader', welcome: 'Welcome to Folio',
  welcomeSub: 'Open a document or a folder and read it like a book. Your files stay on your computer.',
  continue: 'Continue where you left off', restore: 'Restore previous session', fresh: 'Start fresh',
  noSession: 'No saved session yet.', recentDocs: 'Recent documents', suggested: 'Suggested to start with',
  noMatches: 'No documents match.', topLevel: 'Top level', loading: 'Loading…', prefsTitle: 'Reading preferences',
  noDocument: 'No document open', chooseDocument: 'Pick a page in the library panel, or start with one of these:',
};
export type Key = keyof typeof en;

const es: Partial<Record<Key, string>> = {
  home: 'Inicio', appearance: 'Apariencia', preferences: 'Preferencias', contents: 'En esta página', library: 'Biblioteca',
  collections: 'Tus carpetas', documents: 'Documentos', filterDocs: 'Filtrar documentos', favorites: 'Favoritos', recent: 'Recientes',
  openFolder: 'Abrir una carpeta', openFile: 'Abrir un documento', sample: 'Explorar la biblioteca de ejemplo',
  welcome: 'Te damos la bienvenida a Folio',
  welcomeSub: 'Abre un documento o una carpeta y léelo como un libro. Tus archivos se quedan en tu equipo.',
  restore: 'Restaurar la sesión anterior', fresh: 'Empezar de nuevo', prefsTitle: 'Preferencias de lectura',
};

const de: Partial<Record<Key, string>> = {
  home: 'Start', appearance: 'Darstellung', preferences: 'Einstellungen', contents: 'Auf dieser Seite', library: 'Bibliothek',
  collections: 'Ihre Ordner', documents: 'Dokumente', filterDocs: 'Dokumente filtern', favorites: 'Favoriten', recent: 'Zuletzt',
  openFolder: 'Ordner öffnen', openFile: 'Dokument öffnen', sample: 'Beispielbibliothek ansehen', welcome: 'Willkommen bei Folio',
  welcomeSub: 'Öffnen Sie ein Dokument oder einen Ordner und lesen Sie wie in einem Buch. Ihre Dateien bleiben auf Ihrem Computer.',
  restore: 'Letzte Sitzung wiederherstellen', fresh: 'Neu beginnen', prefsTitle: 'Leseeinstellungen',
};

export const t = (lang: Lang, key: Key): string => (lang === 'es' ? es[key] : lang === 'de' ? de[key] : undefined) ?? en[key];
```

- [ ] **Step 4: Run the tests and confirm they pass.** Run the same command as Step 2. Expected: 7 passed.
- [ ] **Step 5: Commit.** `feat(app): add contents-panel helpers, coalescing saver and interface translations`

---

### Task 6: Diagrams (`lib/mermaid.ts`)

**Files:**
- Create: `app/src/lib/mermaid.ts` and `app/src/lib/mermaid.test.ts`
- Modify: `app/package.json` (dependency)

**Interfaces:**
- Consumes: the `figure.diagram[data-src] > .diagram-body` markup from Plan 1's `enhance.ts`.
- Produces:
  - `drawDiagram(fig, dark, load?)`
  - `observeDiagrams(root, dark, load?) → stop()`. It draws each diagram the first time it scrolls into view. When `IntersectionObserver` is missing (jsdom), it draws them all straight away. Calling it again redraws, which is how theme changes reach diagrams.

- [ ] **Step 1: Install Mermaid.** Run in `app/`: `npm install mermaid@^11`

- [ ] **Step 2: Write the failing tests.** Create `app/src/lib/mermaid.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { drawDiagram, observeDiagrams } from './mermaid';

function figure(src: string): HTMLElement {
  const fig = document.createElement('figure');
  fig.className = 'diagram';
  fig.dataset.src = src;
  fig.innerHTML = '<div class="diagram-body"><pre><code>source</code></pre></div>';
  return fig;
}

describe('mermaid', () => {
  it('draws in strict mode with the matching theme', async () => {
    const api = { initialize: vi.fn(), render: vi.fn().mockResolvedValue({ svg: '<svg data-test="d"></svg>' }) };
    const fig = figure('flowchart TD\nA-->B');
    await drawDiagram(fig, true, async () => api);
    expect(api.initialize).toHaveBeenCalledWith(expect.objectContaining({ securityLevel: 'strict', theme: 'dark' }));
    expect(api.render.mock.calls[0][1]).toBe('flowchart TD\nA-->B');
    expect(fig.querySelector('svg[data-test="d"]')).not.toBeNull();
  });

  it('shows the description as text when drawing fails', async () => {
    const fig = figure('<img src=x onerror=alert(1)>');
    await drawDiagram(fig, false, async () => { throw new Error('boom'); });
    expect(fig.querySelector('pre')!.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(fig.querySelector('img')).toBeNull();
    expect(fig.textContent).toContain('couldn’t be drawn');
  });

  it('draws every diagram when there is no IntersectionObserver', async () => {
    const root = document.createElement('div');
    root.append(figure('a'), figure('b'));
    const api = { initialize: vi.fn(), render: vi.fn().mockResolvedValue({ svg: '<svg></svg>' }) };
    observeDiagrams(root, false, async () => api);
    await vi.waitFor(() => expect(api.render).toHaveBeenCalledTimes(2));
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail.** Run `npx vitest run src/lib/mermaid.test.ts`. Expected: FAIL, the module isn't found.

- [ ] **Step 4: Implement.** Create `app/src/lib/mermaid.ts`:
```ts
export interface MermaidApi {
  initialize(config: Record<string, unknown>): void;
  render(id: string, source: string): Promise<{ svg: string }>;
}

let cached: Promise<MermaidApi> | null = null;
/** Mermaid is large; it loads only when a document actually contains a diagram. */
const loadMermaid = (): Promise<MermaidApi> => (cached ??= import('mermaid').then((m) => m.default as unknown as MermaidApi));

let seq = 0;
const FAILED = 'This diagram couldn’t be drawn. Its description is shown instead.';

export async function drawDiagram(fig: HTMLElement, dark: boolean, load: () => Promise<MermaidApi> = loadMermaid): Promise<void> {
  const body = fig.querySelector<HTMLElement>('.diagram-body');
  if (!body) return;
  const source = fig.dataset.src ?? '';
  try {
    const mermaid = await load();
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'neutral', fontFamily: 'Figtree, system-ui, sans-serif' });
    const { svg } = await mermaid.render(`folio-diagram-${++seq}`, source);
    body.innerHTML = svg; // produced by Mermaid in strict mode, which sanitizes every label
  } catch {
    const doc = fig.ownerDocument;
    const note = doc.createElement('p');
    note.className = 'muted small';
    note.textContent = FAILED;
    const pre = doc.createElement('pre');
    pre.textContent = source;
    body.replaceChildren(note, pre);
  }
}

export function observeDiagrams(root: HTMLElement, dark: boolean, load: () => Promise<MermaidApi> = loadMermaid): () => void {
  const figures = [...root.querySelectorAll<HTMLElement>('figure.diagram')];
  if (!figures.length) return () => {};
  if (typeof IntersectionObserver === 'undefined') {
    for (const f of figures) void drawDiagram(f, dark, load);
    return () => {};
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      void drawDiagram(e.target as HTMLElement, dark, load);
    }
  }, { rootMargin: '200px' });
  for (const f of figures) io.observe(f);
  return () => io.disconnect();
}
```

- [ ] **Step 5: Run the tests, the type check and the build.** Run `npx vitest run src/lib/mermaid.test.ts`, then `npx tsc --noEmit -p tsconfig.json`, then `npm run build`. Expected: 3 passed and a clean type check. The build prints Mermaid as separate chunk files, not inside the main `index-*.js`.
- [ ] **Step 6: Commit.** `feat(app): draw diagrams with Mermaid in strict mode, on demand`

---

### Task 7: Prototype styles, icon sprite and bundled fonts

**Files:**
- Create:
  - `app/scripts/port-styles.mjs` and `app/scripts/port-styles.test.mjs`
  - Generated by the script: `app/src/styles/tokens.css`, `app/src/styles/app.css`, `app/src/styles/doc.css` and `app/src/IconSprite.svelte`
- Delete: `app/src/styles/base.css`
- Modify: `app/src/main.ts` and `app/package.json` (font dependencies)

**Interfaces:**
- Produces:
  - The prototype's colour tokens, all 8 themes and high contrast, plus its chrome, home, preferences and document CSS. Class names are unchanged, so the components in Tasks 9–12 use the prototype's class names.
  - An inline SVG sprite, so `<use href="#i-NAME">` works for every prototype icon.

- [ ] **Step 1: Write the failing test.** Create `app/scripts/port-styles.test.mjs`:
```js
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { splitPrototype } from './port-styles.mjs';

const html = readFileSync(resolve('..', 'index.html'), 'utf8'); // vitest runs from app/

describe('port-styles', () => {
  const out = splitPrototype(html);
  it('takes every theme and the font tokens', () => {
    expect(out.tokens).toContain(':root[data-palette="ember"]');
    expect(out.tokens).toContain(':root[data-theme="dark"][data-contrast="high"]');
    expect(out.tokens).toContain('--font-easy');
  });
  it('keeps chrome, home and preferences, but not the prototype strip or later screens', () => {
    for (const sel of ['.tab-main', '.swatch', '.home-hero', '.prefs-grid', '.toc-link', '.divider']) expect(out.app).toContain(sel);
    for (const sel of ['.proto-strip', '.lib-tabs', '.search-opts', '.promise']) expect(out.app).not.toContain(sel);
    expect(out.app).toContain('Desktop app overrides');
  });
  it('separates document styles and the icon sprite', () => {
    expect(out.doc).toContain('.callout-note');
    expect(out.doc).not.toContain('.tab-main');
    expect(out.sprite).toContain('id="i-logo"');
    expect(out.sprite).toContain('id="i-trash"');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails.** Run `npx vitest run scripts/port-styles.test.mjs`. Expected: FAIL, the module isn't found.

- [ ] **Step 3: Implement the script.** Create `app/scripts/port-styles.mjs`:
```js
// One-off: copies the approved prototype's CSS and icon sprite (index.html) into the app.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DROP = /^(Search|Library|Help)$/; // screens ported by Plans 3 and 4
const OVERRIDES = `
/* ---------- Desktop app overrides (no prototype strip; the window is the app) ---------- */
body { padding: 0; background: var(--paper); }
#app { height: 100%; }
.app { border: 0; border-radius: 0; box-shadow: none; grid-template-rows: auto minmax(0, 1fr); }
.pane { grid-template-rows: auto auto auto minmax(0, 1fr) auto; } /* the find bar row returns in Plan 3 */
main { position: relative; }
.notice { position: absolute; z-index: 15; top: .75rem; left: 50%; transform: translateX(-50%); max-width: min(40rem, 90%); display: flex; gap: .75rem; align-items: center; margin: 0; padding: .55rem .9rem; border-radius: 8px; background: var(--ink); color: var(--paper); box-shadow: var(--shadow); font-size: .875rem; }
.notice .link-btn { color: var(--paper); }
`;

export function splitPrototype(html) {
  const css = html.slice(html.indexOf('<style>') + '<style>'.length, html.indexOf('</style>'));
  const resetAt = css.indexOf('*, *::before, *::after { box-sizing');
  const tokens = css.slice(0, resetAt);
  const sections = css.slice(resetAt).split(/\n(?=\/\* [^\n]*\*\/\n)/);
  const app = [];
  const doc = [];
  for (const section of sections) {
    const title = (section.match(/^\/\* (.*?) \*\//)?.[1] ?? '').replace(/-+/g, '').trim();
    if (title === 'Rendered document') doc.push(section);
    else if (!DROP.test(title)) app.push(section);
  }
  const appCss = app.join('\n').split('\n').filter((line) => !line.startsWith('.proto-')).join('\n') + OVERRIDES;
  const spriteStart = html.indexOf('<svg width="0" height="0"');
  const sprite = html.slice(spriteStart, html.indexOf('</svg>', spriteStart) + '</svg>'.length);
  return { tokens, app: appCss, doc: doc.join('\n'), sprite };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const out = splitPrototype(html);
  const write = (rel, text) => writeFileSync(new URL(rel, import.meta.url), text.trimEnd() + '\n');
  write('../src/styles/tokens.css', out.tokens);
  write('../src/styles/app.css', out.app);
  write('../src/styles/doc.css', out.doc);
  write('../src/IconSprite.svelte', out.sprite);
  console.log('Wrote tokens.css, app.css, doc.css and IconSprite.svelte.');
}
```

- [ ] **Step 4: Generate the files, then wire in the fonts and styles.**
  1. Run in `app/`:
     - `node scripts/port-styles.mjs`
     - `npm install @fontsource/literata @fontsource/figtree @fontsource/lexend`
     - `git rm src/styles/base.css`
  2. Replace `app/src/main.ts` with:
```ts
import { mount } from 'svelte';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/500.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/700.css';
import '@fontsource/literata/400.css';
import '@fontsource/literata/400-italic.css';
import '@fontsource/literata/600.css';
import '@fontsource/lexend/400.css';
import '@fontsource/lexend/600.css';
import './styles/tokens.css';
import './styles/app.css';
import './styles/doc.css';
import App from './App.svelte';

export default mount(App, { target: document.getElementById('app')! });
```

- [ ] **Step 5: Verify.**
  - `npx vitest run scripts/port-styles.test.mjs` gives 3 passed.
  - `npm run build` succeeds.
  - Run `ls dist/assets | grep -c woff2`. Expected: at least 9.
  - Run `grep -rl "fonts.googleapis\|fonts.gstatic" dist || echo none`. Expected: `none`.
  - The Plan 1 `App.svelte` still renders, now with prototype styling.
- [ ] **Step 6: Commit.** `feat(app): port the prototype styles, themes and icons; bundle fonts locally`

---

### Task 8: App store (`state/app.svelte.ts`) and bridge additions

**Files:**
- Create: `app/src/state/app.svelte.ts` and `app/src/state/app.test.ts`
- Modify: `app/src/lib/core.ts`, adding `OpenedFile`, `pickFile` and `firstDocument`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces:
  - `class AppStore` and the singleton `app`.
  - **Fields (all `$state`):** `collections`, `trees`, `activeCollection`, `library`, `ws`, `view: 'home'|'reader'|'prefs'`, `sidebarOpen`, `tocOpen`, `notice`, `headings: [HeadingInfo[], HeadingInfo[]]`, `currentSlugs`, `liveProgress`, `savedSession`, `dark`, `reducedMotion`, `closedFolders` (a `SvelteSet`) and `scrollers`.
  - **Getter:** `currentKey`.
  - **Methods:**
    - start-up: `init()`;
    - folders and files: `ensureTree(cid)`, `selectCollection(cid)`, `addFolder()`, `openFile()`, `openSample()`, `openCollection(cid)`, `toggleFolder(cid, path)`, `revealFolder(cid, folder)`, `filesFor(cid)`;
    - documents: `loadDocument(key)`, `open(key, opts?)`, `openBeside(key, slug?)`, `toggleFavorite(key)`, `toggleFavoriteCollection(id)`;
    - tabs and panes: `goBack(pane)`, `goForward(pane)`, `activateTab(pane, id)`, `closeTab(pane, id)`, `activatePane(pane)`, `setSplit(on)`, `setRatio(r)`, `toggleSidebar()`, `toggleToc()`;
    - preferences: `setPref(key, value)`, `resetPrefs()`, `applyPrefs()`;
    - session: `restoreSession()`, `startFresh()`;
    - reading: `reportScroll(pane, key, pct, slug)`;
    - saving: `persist()`, `flush()`.

- [ ] **Step 1: Extend the bridge.** In `app/src/lib/core.ts`, add:
```ts
export interface OpenedFile { collection: Collection; path: string }
```
  Add `pickFile: () => invoke<OpenedFile | null>('pick_file'),` to `core`, and add:
```ts
/** README or index at the top level, else the first document in tree order. */
export function firstDocument(node: TreeNode): string | null {
  const docs = node.children.filter((c) => c.kind === 'document');
  const preferred = docs.find((d) => /^(readme|index)\.(md|markdown)$/i.test(d.name)) ?? docs[0];
  if (preferred) return preferred.path;
  for (const c of node.children) if (c.kind === 'folder') { const found = firstDocument(c); if (found) return found; }
  return null;
}
```

- [ ] **Step 2: Write the failing tests.** Create `app/src/state/app.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import type { Collection, Tree } from '../lib/core';
import { MESSAGES } from '../lib/core';
import { AppStore, type CoreApi } from './app.svelte';

const sample: Collection = { id: 'sample', name: 'Sample library', root: '/res/sample-wiki', available: true };
const tree: Tree = { truncated: false, root: { name: '', path: '', kind: 'folder', children: [
  { name: 'README.md', path: 'README.md', kind: 'document', children: [] },
  { name: 'Guide.md', path: 'Guide.md', kind: 'document', children: [] },
] } };

function fakeApi(over: Partial<CoreApi> = {}): CoreApi {
  return {
    listCollections: vi.fn().mockResolvedValue([sample]),
    pickFolder: vi.fn().mockResolvedValue(null),
    pickFile: vi.fn().mockResolvedValue(null),
    getTree: vi.fn().mockResolvedValue(tree),
    readDocument: vi.fn().mockResolvedValue({ text: '# Hi', size: 4, modifiedMs: null, lossy: false }),
    loadLibrary: vi.fn().mockResolvedValue({ library: { version: 1 }, reset: false }),
    saveLibrary: vi.fn().mockResolvedValue(undefined),
    ...over,
  } as CoreApi;
}

describe('AppStore', () => {
  it('init keeps folders and refuses saves when the library cannot be read', async () => {
    const api = fakeApi({ loadLibrary: vi.fn().mockRejectedValue({ code: 'AccessDenied' }) });
    const app = new AppStore(api);
    await app.init();
    expect(app.collections).toEqual([sample]);
    expect(app.notice).toBe(MESSAGES.AccessDenied);
    app.toggleFavorite('sample/README.md');
    await app.flush();
    expect(api.saveLibrary).not.toHaveBeenCalled();
  });

  it('reports a library that was reset', async () => {
    const app = new AppStore(fakeApi({ loadLibrary: vi.fn().mockResolvedValue({ library: { version: 1 }, reset: true }) }));
    await app.init();
    expect(app.notice).toBe(MESSAGES.LibraryReset);
  });

  it('opening a document records it as recent and saves', async () => {
    const api = fakeApi();
    const app = new AppStore(api);
    await app.init();
    app.open('sample/Guide.md');
    await app.flush();
    expect(app.view).toBe('reader');
    expect(app.currentKey).toBe('sample/Guide.md');
    const saved = (api.saveLibrary as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(saved.recent[0].key).toBe('sample/Guide.md');
    expect(saved.session.panes[0].tabs[0].key).toBe('sample/Guide.md');
  });

  it('restoreSession skips unknown collections', async () => {
    const session = { split: false, ratio: 0.5, activeCollection: 'sample', at: 1, panes: [
      { tabs: [{ key: 'gone/a.md', scroll: 0 }, { key: 'sample/README.md', scroll: 30 }], active: 0 }, { tabs: [], active: 0 },
    ] };
    const app = new AppStore(fakeApi({ loadLibrary: vi.fn().mockResolvedValue({ library: { version: 1, session }, reset: false }) }));
    await app.init();
    expect(app.savedSession).not.toBeNull();
    app.restoreSession();
    expect(app.ws.panes[0].tabs).toHaveLength(1);
    expect(app.currentKey).toBe('sample/README.md');
  });

  it('caches documents so switching tabs does not re-read them', async () => {
    const api = fakeApi();
    const app = new AppStore(api);
    await app.loadDocument('sample/README.md');
    await app.loadDocument('sample/README.md');
    expect(api.readDocument).toHaveBeenCalledTimes(1);
  });

  it('openFile opens the chosen document inside its folder', async () => {
    const folder: Collection = { id: 'f1', name: 'Notes', root: '/n', available: true };
    const api = fakeApi({
      pickFile: vi.fn().mockResolvedValue({ collection: folder, path: 'todo.md' }),
      listCollections: vi.fn().mockResolvedValueOnce([sample]).mockResolvedValueOnce([sample, folder]),
    });
    const app = new AppStore(api);
    await app.init();
    await app.openFile();
    expect(app.collections).toEqual([sample, folder]);
    expect(app.currentKey).toBe('f1/todo.md');
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail.** Run `npx vitest run src/state/app.test.ts`. Expected: FAIL, `./app.svelte` isn't found.

- [ ] **Step 4: Implement.** Create `app/src/state/app.svelte.ts`:
```ts
import { SvelteSet } from 'svelte/reactivity';
import { assetUrl, core as realCore, describeError, filesOf, firstDocument, MESSAGES, type Collection, type DocumentText, type Tree } from '../lib/core';
import { addRecent, docKey, parseKey, parseLibrary, recordProgress, toggleFavorite, toggleFavoriteCollection, toRaw, type LibraryData } from '../lib/library';
import { applyPrefs, DEFAULT_PREFS, isDark, normalizePrefs, type Prefs } from '../lib/prefs';
import { createSaver, type Saver } from '../lib/saver';
import type { HeadingInfo } from '../lib/toc';
import * as W from '../lib/workspace';

export type CoreApi = typeof realCore;
export type View = 'home' | 'reader' | 'prefs';
export { assetUrl };

const systemDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
const systemReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class AppStore {
  collections = $state<Collection[]>([]);
  trees = $state<Record<string, Tree>>({});
  activeCollection = $state<string | null>(null);
  library = $state<LibraryData>(parseLibrary({}));
  ws = $state<W.WorkspaceState>(W.emptyWorkspace());
  view = $state<View>('home');
  sidebarOpen = $state(true);
  tocOpen = $state(true);
  notice = $state<string | null>(null);
  headings = $state<[HeadingInfo[], HeadingInfo[]]>([[], []]);
  currentSlugs = $state<[string | null, string | null]>([null, null]);
  liveProgress = $state<[number, number]>([0, 0]);
  /** The session found at start-up, offered on Home. Later saves don't replace it. */
  savedSession = $state<W.Session | null>(null);
  dark = $state(false);
  reducedMotion = $state(false);
  closedFolders = new SvelteSet<string>();
  /** Each mounted document view registers how to scroll to a heading. */
  scrollers: [((slug: string) => void) | null, ((slug: string) => void) | null] = [null, null];

  private docs = new Map<string, Promise<DocumentText>>();
  private canSave = true;
  private saver: Saver;

  constructor(private api: CoreApi = realCore) {
    this.saver = createSaver(
      () => this.api.saveLibrary(toRaw($state.snapshot(this.snapshotLibrary()) as LibraryData)),
      1000,
      (e) => (this.notice = describeError(e)),
    );
  }

  get currentKey(): string | null {
    return W.activeKey(this.ws);
  }

  async init(): Promise<void> {
    try {
      const loaded = await this.api.loadLibrary();
      this.library = parseLibrary(loaded.library);
      this.savedSession = this.library.session;
      if (loaded.reset) this.notice = MESSAGES.LibraryReset;
    } catch (e) {
      this.canSave = false; // the core refuses too; don't nag with a failure on every change
      this.notice = describeError(e);
    }
    this.applyPrefs();
    try {
      this.collections = await this.api.listCollections();
    } catch (e) {
      this.notice = describeError(e);
    }
    const preferred = this.library.session?.activeCollection;
    const start = this.collections.find((c) => c.id === preferred && c.available) ?? this.collections.find((c) => c.available);
    this.activeCollection = start?.id ?? null;
    if (this.activeCollection) await this.ensureTree(this.activeCollection);
  }

  async ensureTree(cid: string): Promise<Tree | null> {
    if (this.trees[cid]) return this.trees[cid];
    try {
      const tree = await this.api.getTree(cid);
      this.trees[cid] = tree;
      if (tree.truncated) this.notice = MESSAGES.TreeTruncated;
      return tree;
    } catch (e) {
      this.notice = describeError(e);
      return null;
    }
  }

  filesFor(cid: string): string[] {
    const tree = this.trees[cid];
    return tree ? filesOf(tree.root) : [];
  }

  loadDocument(key: string): Promise<DocumentText> {
    let pending = this.docs.get(key);
    if (!pending) {
      const { collectionId, path } = parseKey(key);
      pending = this.api.readDocument(collectionId, path);
      pending.catch(() => this.docs.delete(key)); // a failed read is retried next time
      this.docs.set(key, pending);
    }
    return pending;
  }

  selectCollection(cid: string): void {
    this.activeCollection = cid;
    void this.ensureTree(cid);
  }

  async openCollection(cid: string): Promise<void> {
    this.activeCollection = cid;
    const tree = await this.ensureTree(cid);
    const first = tree ? firstDocument(tree.root) : null;
    if (first) this.open(docKey(cid, first));
  }

  async addFolder(): Promise<void> {
    try {
      const picked = await this.api.pickFolder();
      if (!picked) return;
      this.collections = await this.api.listCollections();
      await this.openCollection(picked.id);
    } catch (e) {
      this.notice = describeError(e);
    }
  }

  async openFile(): Promise<void> {
    try {
      const picked = await this.api.pickFile();
      if (!picked) return;
      this.collections = await this.api.listCollections();
      this.open(docKey(picked.collection.id, picked.path));
    } catch (e) {
      this.notice = describeError(e);
    }
  }

  openSample(): void {
    void this.openCollection('sample');
  }

  open(key: string, opts: { mode?: W.OpenMode; pane?: W.PaneIndex; slug?: string | null } = {}): void {
    const { collectionId } = parseKey(key);
    this.activeCollection = collectionId;
    void this.ensureTree(collectionId);
    W.openDoc(this.ws, key, { mode: opts.mode ?? 'tab', pane: opts.pane ?? this.ws.activePane, slug: opts.slug ?? null });
    addRecent(this.library, key);
    this.view = 'reader';
    this.persist();
  }

  openBeside(key: string, slug: string | null = null): void {
    const from = this.ws.split ? this.ws.activePane : 0;
    if (!this.ws.split) W.setSplit(this.ws, true, null);
    this.open(key, { mode: 'tab', pane: from === 0 ? 1 : 0, slug });
  }

  goBack(pane: W.PaneIndex): void {
    if (W.go(this.ws, pane, -1)) this.persist();
  }

  goForward(pane: W.PaneIndex): void {
    if (W.go(this.ws, pane, 1)) this.persist();
  }

  activateTab(pane: W.PaneIndex, id: number): void {
    W.activateTab(this.ws, pane, id);
    this.persist();
  }

  closeTab(pane: W.PaneIndex, id: number): void {
    W.closeTab(this.ws, pane, id);
    this.persist();
  }

  activatePane(pane: W.PaneIndex): void {
    if (this.ws.split) this.ws.activePane = pane;
  }

  setSplit(on: boolean): void {
    const cur = W.activeKey(this.ws, 0);
    const cid = cur ? parseKey(cur).collectionId : this.activeCollection;
    const companion = cid ? this.filesFor(cid).filter((p) => /\.(md|markdown|txt)$/i.test(p)).map((p) => docKey(cid, p)).find((k) => k !== cur) ?? null : null;
    W.setSplit(this.ws, on, companion);
    this.view = 'reader';
    this.persist();
  }

  setRatio(r: number): void {
    W.setRatio(this.ws, r);
    this.persist();
  }

  toggleSidebar(): void {
    if (this.view === 'home') {
      this.view = 'reader';
      this.sidebarOpen = true;
    } else this.sidebarOpen = !this.sidebarOpen;
  }

  toggleToc(): void {
    this.tocOpen = !this.tocOpen;
  }

  toggleFolder(cid: string, path: string): void {
    const id = `${cid}:${path}`;
    if (this.closedFolders.has(id)) this.closedFolders.delete(id);
    else this.closedFolders.add(id);
  }

  revealFolder(cid: string, folder: string): void {
    this.activeCollection = cid;
    this.sidebarOpen = true;
    const parts = folder ? folder.split('/') : [];
    parts.forEach((_, i) => this.closedFolders.delete(`${cid}:${parts.slice(0, i + 1).join('/')}`));
  }

  toggleFavorite(key: string): void {
    toggleFavorite(this.library, key);
    this.persist();
  }

  toggleFavoriteCollection(id: string): void {
    toggleFavoriteCollection(this.library, id);
    this.persist();
  }

  setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
    this.library.prefs = normalizePrefs({ ...this.library.prefs, [key]: value });
    this.applyPrefs();
    this.persist();
  }

  resetPrefs(): void {
    this.library.prefs = { ...DEFAULT_PREFS };
    this.applyPrefs();
    this.persist();
  }

  applyPrefs(): void {
    const prefs = this.library.prefs;
    if (typeof document !== 'undefined') applyPrefs(prefs, document.documentElement, systemDark());
    this.dark = isDark(prefs, systemDark());
    this.reducedMotion = prefs.reduceMotion || systemReducedMotion();
  }

  restoreSession(): void {
    const session = this.savedSession;
    if (!session) return;
    const known = (key: string) => this.collections.some((c) => c.available && c.id === parseKey(key).collectionId);
    this.ws = W.fromSession(session, known);
    for (const pane of this.ws.panes) for (const tab of pane.tabs) void this.ensureTree(parseKey(W.current(tab).key).collectionId);
    this.view = 'reader';
    this.persist();
  }

  startFresh(): void {
    this.ws = W.emptyWorkspace();
    const cid = this.activeCollection ?? this.collections.find((c) => c.available)?.id;
    if (cid) void this.openCollection(cid);
    else this.view = 'reader';
    this.persist();
  }

  reportScroll(pane: W.PaneIndex, key: string, pct: number, slug: string | null): void {
    this.liveProgress[pane] = pct;
    this.currentSlugs[pane] = slug;
    recordProgress(this.library, key, pct);
    this.persist(); // the scroll position is part of the session
  }

  persist(): void {
    if (this.canSave) this.saver.schedule();
  }

  flush(): Promise<void> {
    return this.saver.flush();
  }

  private snapshotLibrary(): LibraryData {
    return { ...this.library, session: W.toSession(this.ws, this.activeCollection) };
  }
}

export const app = new AppStore();
```

- [ ] **Step 5: Run the tests and confirm they pass.** Run `npx vitest run src/state/app.test.ts`, then `npm test`, then `npx tsc --noEmit -p tsconfig.json`. Expected: 6 passed in the new file, every other test passes, and the type check is clean.
- [ ] **Step 6: Commit.** `feat(app): add the app store that ties library, tabs, prefs and the core together`

---

### Task 9: App bar, appearance popover, theme swatches and icons

**Files:**
- Create: `app/src/Icon.svelte`, `app/src/ThemeSwatches.svelte`, `app/src/AppearancePopover.svelte` and `app/src/AppBar.svelte`

**Interfaces:**
- Consumes: the `app` store (Task 8), `t` (Task 5), `THEMES` (Task 3) and the CSS classes from Task 7.
- Produces:
  - `<Icon name cls?>`
  - `<ThemeSwatches mode="buttons"|"radios">`
  - `<AppearancePopover onclose>`
  - `<AppBar>`

**Testing:** these are presentational. They're verified by `npm run check` (0 errors and 0 warnings) and by the manual checklist in Task 13.

- [ ] **Step 1: Create the components.**

`app/src/Icon.svelte`:
```svelte
<script lang="ts">
  let { name, cls = '' }: { name: string; cls?: string } = $props();
</script>

<svg class="i {cls}" aria-hidden="true"><use href="#i-{name}" /></svg>
```

`app/src/ThemeSwatches.svelte`:
```svelte
<script lang="ts">
  import { THEMES } from './lib/prefs';
  import { app } from './state/app.svelte';

  let { mode }: { mode: 'buttons' | 'radios' } = $props();
  const selected = $derived(app.library.prefs.theme);
</script>

<div class="swatches" role={mode === 'buttons' ? 'group' : 'radiogroup'} aria-label="Colour theme">
  {#each THEMES as theme (theme.id)}
    {#if mode === 'buttons'}
      <button class="swatch" aria-pressed={selected === theme.id} onclick={() => app.setPref('theme', theme.id)}>
        <span class="sw-chip" style="--b:{theme.preview.page};--c:{theme.preview.text};--a:{theme.preview.accent}" aria-hidden="true"></span>{theme.name}
      </button>
    {:else}
      <label class="swatch">
        <input type="radio" name="theme" value={theme.id} checked={selected === theme.id} onchange={() => app.setPref('theme', theme.id)} />
        <span class="sw-chip" style="--b:{theme.preview.page};--c:{theme.preview.text};--a:{theme.preview.accent}" aria-hidden="true"></span>{theme.name}
      </label>
    {/if}
  {/each}
</div>
```

`app/src/AppearancePopover.svelte`:
```svelte
<script lang="ts">
  import { app } from './state/app.svelte';
  import ThemeSwatches from './ThemeSwatches.svelte';

  let { onclose }: { onclose: () => void } = $props();
  let box = $state<HTMLElement>();
  const size = $derived(app.library.prefs.fontSize);

  $effect(() => {
    const down = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (box && !box.contains(target) && !target.closest('[aria-controls="appearance-pop"]')) onclose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onclose();
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  });
</script>

<div class="popover" id="appearance-pop" role="dialog" aria-label="Appearance" bind:this={box}>
  <h2>Colour theme</h2>
  <ThemeSwatches mode="buttons" />
  <h2>Text size</h2>
  <div class="size-row">
    <button class="btn sm" aria-label="Smaller text" onclick={() => app.setPref('fontSize', size - 1)}>A−</button>
    <output aria-live="polite">{size} px</output>
    <button class="btn sm" aria-label="Larger text" onclick={() => app.setPref('fontSize', size + 1)}>A+</button>
  </div>
  <button class="link-btn" onclick={() => { app.view = 'prefs'; onclose(); }}>All reading preferences</button>
</div>
```

`app/src/AppBar.svelte`:
```svelte
<script lang="ts">
  import AppearancePopover from './AppearancePopover.svelte';
  import Icon from './Icon.svelte';
  import { t } from './lib/i18n';
  import { app } from './state/app.svelte';

  let popOpen = $state(false);
  const lang = $derived(app.library.prefs.lang);
</script>

<header class="appbar">
  <button class="icon-btn toggle" aria-expanded={app.sidebarOpen && app.view !== 'home'} aria-controls="sidebar" aria-label={t(lang, 'toggleSidebar')} title="{t(lang, 'toggleSidebar')} ( [ )" onclick={() => app.toggleSidebar()}><Icon name="sidebar" /></button>
  <button class="brand" aria-label="Folio — {t(lang, 'home')}" onclick={() => (app.view = 'home')}><Icon name="logo" /><span class="brand-name">Folio</span></button>
  <span class="grow"></span>
  <div class="bar-group" style="position:relative">
    <button class="icon-btn" aria-expanded={popOpen} aria-controls="appearance-pop" aria-label={t(lang, 'appearance')} title={t(lang, 'appearance')} onclick={() => (popOpen = !popOpen)}><Icon name={app.dark ? 'moon' : 'sun'} /></button>
    {#if popOpen}<AppearancePopover onclose={() => (popOpen = false)} />{/if}
    <button class="icon-btn" aria-label={t(lang, 'preferences')} title={t(lang, 'preferences')} onclick={() => (app.view = 'prefs')}><Icon name="gear" /></button>
    {#if app.view === 'reader'}
      <button class="icon-btn toggle" aria-expanded={app.tocOpen} aria-controls="toc" aria-label={t(lang, 'toggleContents')} title="{t(lang, 'toggleContents')} ( ] )" onclick={() => app.toggleToc()}><Icon name="toc" /></button>
    {/if}
  </div>
</header>
```

- [ ] **Step 2: Check.** Run `npm run check`. Expected: 0 errors and 0 warnings. If svelte-check warns about the `.swatch` label pattern, add the narrowest `svelte-ignore` comment on that line and say so in the report.
- [ ] **Step 3: Commit.** `feat(app): add the app bar, appearance popover and theme swatches`

---

### Task 10: Sidebar and folder tree

**Files:**
- Create: `app/src/Sidebar.svelte`
- Modify: `app/src/TreeView.svelte` (full replacement)

**Interfaces:**
- Produces:
  - `<Sidebar>`: folders (collections), "Open a folder", a document filter, the tree, favorites and recent.
  - `<TreeView collectionId nodes nested?>`: open and close folders, mark the current document, and open a document beside the current one with Shift-click.

- [ ] **Step 1: Create the components.**

`app/src/TreeView.svelte`:
```svelte
<script lang="ts">
  import Icon from './Icon.svelte';
  import type { TreeNode } from './lib/core';
  import { docKey } from './lib/library';
  import { friendlyName } from './lib/markdown/slug';
  import { app } from './state/app.svelte';
  import Self from './TreeView.svelte';

  let { collectionId, nodes, nested = false }: { collectionId: string; nodes: TreeNode[]; nested?: boolean } = $props();
  const current = $derived(app.view === 'reader' ? app.currentKey : null);
</script>

<ul class={nested ? 'tree-sub' : 'tree'}>
  {#each nodes as node (node.path)}
    {#if node.kind === 'folder'}
      {@const open = !app.closedFolders.has(`${collectionId}:${node.path}`)}
      <li>
        <button class="tree-item tree-dir" aria-expanded={open} onclick={() => app.toggleFolder(collectionId, node.path)}>
          <Icon name="chevron" cls="twisty" /><Icon name={open ? 'folder-open' : 'folder'} /><span class="ti-label">{node.name}</span>
        </button>
        {#if open}<Self {collectionId} nodes={node.children} nested />{/if}
      </li>
    {:else if node.kind === 'document'}
      {@const key = docKey(collectionId, node.path)}
      <li>
        <button class="tree-item" aria-current={key === current ? 'page' : undefined} title="{node.path} (Shift-click opens it beside)"
          onclick={(e) => (e.shiftKey ? app.openBeside(key) : app.open(key))}>
          <Icon name="file" /><span class="ti-label">{friendlyName(node.path)}</span>
          {#if app.library.favorites.includes(key)}<Icon name="star-fill" cls="ti-star" />{/if}
        </button>
      </li>
    {/if}
  {/each}
</ul>
```

`app/src/Sidebar.svelte`:
```svelte
<script lang="ts">
  import Icon from './Icon.svelte';
  import type { TreeNode } from './lib/core';
  import { t } from './lib/i18n';
  import { docKey, parseKey } from './lib/library';
  import { friendlyName } from './lib/markdown/slug';
  import { app } from './state/app.svelte';
  import TreeView from './TreeView.svelte';

  let filter = $state('');
  const lang = $derived(app.library.prefs.lang);
  const cid = $derived(app.activeCollection);
  const tree = $derived(cid ? app.trees[cid] : undefined);
  const query = $derived(filter.trim().toLowerCase());
  const known = (key: string) => app.collections.some((c) => c.id === parseKey(key).collectionId);

  function documents(node: TreeNode): string[] {
    return node.children.flatMap((c) => (c.kind === 'folder' ? documents(c) : c.kind === 'document' ? [c.path] : []));
  }
  const matches = $derived(tree && query ? documents(tree.root).filter((p) => friendlyName(p).toLowerCase().includes(query) || p.toLowerCase().includes(query)) : []);
  const folderOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : t(lang, 'topLevel'));
</script>

<aside class="sidebar" id="sidebar" aria-label={t(lang, 'library')}>
  <section aria-labelledby="col-h">
    <h2 class="side-h" id="col-h">{t(lang, 'collections')}</h2>
    <ul>
      {#each app.collections as c (c.id)}
        <li>
          <button class="col-btn" aria-pressed={c.id === cid} disabled={!c.available} onclick={() => app.selectCollection(c.id)}>
            <Icon name={c.id === 'sample' ? 'book' : 'folder'} /><span>{c.name}</span>
            {#if !c.available}<span class="badge">{t(lang, 'unavailable')}</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
    <div class="btn-row"><button class="btn sm" onclick={() => app.addFolder()}><Icon name="folder-open" />{t(lang, 'openFolder')}</button></div>
  </section>

  <section aria-labelledby="docs-h">
    <h2 class="side-h" id="docs-h">{t(lang, 'documents')}</h2>
    <div class="filter"><Icon name="search" /><input type="search" bind:value={filter} placeholder={t(lang, 'filterDocs')} aria-label={t(lang, 'filterDocs')} /></div>
    {#if cid && tree}
      {#if query}
        {#if matches.length}
          <ul class="side-list">
            {#each matches as p (p)}
              <li><button class="tree-item" onclick={() => app.open(docKey(cid, p))}><Icon name="file" /><span class="ti-label">{friendlyName(p)}<span class="ti-path">{folderOf(p)}</span></span></button></li>
            {/each}
          </ul>
        {:else}<p class="side-empty" aria-live="polite">{t(lang, 'noMatches')}</p>{/if}
      {:else}
        <TreeView collectionId={cid} nodes={tree.root.children} />
      {/if}
    {:else if cid}<p class="side-empty">{t(lang, 'loading')}</p>{/if}
  </section>

  <details open>
    <summary><Icon name="chevron" />{t(lang, 'favorites')}</summary>
    <ul class="side-list">
      {#each app.library.favorites.filter(known) as key (key)}
        <li><button class="tree-item" onclick={() => app.open(key)}><Icon name="file" /><span class="ti-label">{friendlyName(parseKey(key).path)}</span></button></li>
      {:else}<li><p class="side-empty">{t(lang, 'favoritesEmpty')}</p></li>{/each}
    </ul>
  </details>

  <details open>
    <summary><Icon name="chevron" />{t(lang, 'recent')}</summary>
    <ul class="side-list">
      {#each app.library.recent.filter((r) => known(r.key)).slice(0, 5) as r (r.key)}
        <li><button class="tree-item" onclick={() => app.open(r.key)}><Icon name="file" /><span class="ti-label">{friendlyName(parseKey(r.key).path)}</span></button></li>
      {:else}<li><p class="side-empty">{t(lang, 'recentEmpty')}</p></li>{/each}
    </ul>
  </details>
</aside>
```

- [ ] **Step 2: Check.** Run `npm run check`. Expected: 0 errors and 0 warnings.
- [ ] **Step 3: Commit.** `feat(app): add the sidebar with folders, tree, filter, favorites and recent`

---

### Task 11: Reading panes, document view, divider and contents panel

**Files:**
- Create: `app/src/DocumentView.svelte`, `app/src/ReaderPane.svelte`, `app/src/Divider.svelte` and `app/src/TocPanel.svelte`

**Interfaces:**
- Consumes:
  - `renderDocument` (Plan 1)
  - `observeDiagrams` (Task 6)
  - `currentSlug` and `readingPercent` (Task 5)
  - the store (Task 8)
- Produces:
  - `<ReaderPane pane>`: tabs, back and forward, location breadcrumbs, favorite, side by side, the progress bar, then the keyed `DocumentView`.
  - `<DocumentView pane docKey entry>`: renders the document, handles clicks on links, reports scrolling, and redraws diagrams when the theme changes. It also registers `app.scrollers[pane]`.
  - `<Divider>`
  - `<TocPanel>`

- [ ] **Step 1: Create the components.**

`app/src/DocumentView.svelte`:
```svelte
<script lang="ts">
  import Icon from './Icon.svelte';
  import { describeError, MESSAGES } from './lib/core';
  import { docKey as makeKey, parseKey } from './lib/library';
  import { renderDocument } from './lib/markdown/render';
  import { observeDiagrams } from './lib/mermaid';
  import { currentSlug, readingPercent, type HeadingInfo } from './lib/toc';
  import type { Entry, PaneIndex } from './lib/workspace';
  import { app, assetUrl } from './state/app.svelte';

  let { pane, docKey: key, entry }: { pane: PaneIndex; docKey: string; entry: Entry } = $props();
  let scroller = $state<HTMLElement>();
  let host = $state<HTMLElement>();
  let words = $state(0);
  let updated = $state<string | null>(null);
  let failed = $state<string | null>(null);
  let article: HTMLElement | null = null;
  let headingEls: HTMLElement[] = [];
  let stopDiagrams = () => {};

  const measure = (): HeadingInfo[] =>
    headingEls.map((h) => ({ slug: h.dataset.slug ?? '', text: h.textContent ?? '', level: Number(h.tagName[1]), top: h.offsetTop }));

  function scrollToSlug(slug: string) {
    const target = host?.querySelector<HTMLElement>(`[data-slug="${CSS.escape(slug)}"]`);
    if (!target || !scroller) {
      app.notice = 'That section couldn’t be found. It may have been renamed.';
      return;
    }
    scroller.scrollTo({ top: target.offsetTop - 12, behavior: app.reducedMotion ? 'auto' : 'smooth' });
    target.focus({ preventScroll: true });
  }

  function onScroll() {
    if (!scroller) return;
    entry.scroll = scroller.scrollTop;
    const pct = readingPercent(scroller.scrollTop, scroller.scrollHeight, scroller.clientHeight);
    app.reportScroll(pane, key, pct, currentSlug(measure(), scroller.scrollTop, scroller.clientHeight, scroller.scrollHeight));
  }

  function onClick(event: MouseEvent) {
    const link = (event.target as HTMLElement).closest('a');
    if (!link) return;
    event.preventDefault(); // website links get their confirmation dialog in Plan 4
    if (event.type === 'auxclick') return; // middle/right click: do nothing
    const { kind, path, slug } = link.dataset;
    if (kind === 'internal' && path) {
      const target = makeKey(parseKey(key).collectionId, path);
      if (event.shiftKey) app.openBeside(target, slug || null);
      else app.open(target, { mode: event.ctrlKey || event.metaKey ? 'tab' : 'navigate', pane, slug: slug || null });
    } else if (kind === 'anchor' && slug) scrollToSlug(slug);
    else if (kind === 'broken') app.notice = MESSAGES.BrokenLink;
  }

  // One run per mount: ReaderPane re-creates this component (keyed) for every tab or document change,
  // so a slow read for an earlier document can never land here (the `cancelled` flag covers unmounts).
  $effect(() => {
    let cancelled = false;
    const { collectionId, path } = parseKey(key);
    app.scrollers[pane] = scrollToSlug;
    app.loadDocument(key)
      .then((doc) => {
        if (cancelled || !host || !scroller) return;
        const rendered = renderDocument(doc.text, { collectionId, path, files: app.filesFor(collectionId), assetUrl });
        article = rendered.article;
        host.replaceChildren(article);
        headingEls = [...article.querySelectorAll<HTMLElement>('[data-slug]')].filter((h) => /^H[1-4]$/.test(h.tagName));
        words = (doc.text.match(/\S+/g) ?? []).length;
        const fm = rendered.frontmatter.updated;
        updated = typeof fm === 'string' ? fm : doc.modifiedMs ? new Date(doc.modifiedMs).toISOString().slice(0, 10) : null;
        if (doc.lossy) app.notice = MESSAGES.Lossy;
        stopDiagrams = observeDiagrams(article, app.dark);
        app.headings[pane] = measure();
        if (entry.slug) {
          scrollToSlug(entry.slug);
          entry.slug = null;
        } else scroller.scrollTop = entry.scroll;
        onScroll();
      })
      .catch((e) => {
        if (!cancelled) failed = describeError(e);
      });
    return () => {
      cancelled = true;
      stopDiagrams();
      if (app.scrollers[pane] === scrollToSlug) app.scrollers[pane] = null;
    };
  });

  // A link to a section of the document already open here.
  $effect(() => {
    const slug = entry.slug;
    if (slug && headingEls.length) {
      scrollToSlug(slug);
      entry.slug = null;
    }
  });

  // Theme change: draw the diagrams again in the new colours.
  $effect(() => {
    const dark = app.dark;
    if (!article) return;
    stopDiagrams();
    stopDiagrams = observeDiagrams(article, dark);
  });
</script>

<div class="scroller" role="region" tabindex="0" aria-label="Document" bind:this={scroller} onscroll={onScroll}>
  <div class="page">
    {#if failed}
      <div class="empty-pane"><Icon name="alert" cls="big" /><h2>{failed}</h2></div>
    {/if}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div bind:this={host} onclick={onClick} onauxclick={onClick}></div>
  </div>
</div>
<div class="statusbar">
  <span class="ro" title="Folio never changes your files"><Icon name="lock" />Read-only</span>
  {#if words}
    <span>{words.toLocaleString()} words · about {Math.max(1, Math.round(words / 200))} min</span>
    <span>{Math.round(app.liveProgress[pane])}% read</span>
  {/if}
  {#if updated}<span>Updated {updated}</span>{/if}
</div>
```

`app/src/ReaderPane.svelte`:
```svelte
<script lang="ts">
  import DocumentView from './DocumentView.svelte';
  import Icon from './Icon.svelte';
  import { t } from './lib/i18n';
  import { docKey, parseKey } from './lib/library';
  import { friendlyName } from './lib/markdown/slug';
  import { current, type PaneIndex } from './lib/workspace';
  import { app } from './state/app.svelte';

  let { pane }: { pane: PaneIndex } = $props();
  const lang = $derived(app.library.prefs.lang);
  const p = $derived(app.ws.panes[pane]);
  const tab = $derived(p.tabs.find((x) => x.id === p.activeId));
  const entry = $derived(tab ? current(tab) : undefined);
  const key = $derived(entry?.key ?? null);
  const loc = $derived(key ? parseKey(key) : null);
  const collectionName = $derived(loc ? (app.collections.find((c) => c.id === loc.collectionId)?.name ?? '') : '');
  const folders = $derived(loc && loc.path.includes('/') ? loc.path.split('/').slice(0, -1) : []);
  const isFav = $derived(key ? app.library.favorites.includes(key) : false);
  const pct = $derived(key ? Math.round(app.liveProgress[pane]) : 0);
  const suggestions = $derived(['README.md', 'Getting-Started.md', 'References/Glossary.md'].map((path) => docKey('sample', path)).filter(() => app.collections.some((c) => c.id === 'sample')));

  function onTabKey(e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const all = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.tab-main')];
    const i = all.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    all[(i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length].focus();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pane" class:is-active={app.ws.split && app.ws.activePane === pane} data-pane={pane} onpointerdown={() => app.activatePane(pane)} onfocusin={() => app.activatePane(pane)}>
  <div class="tabbar">
    <nav class="tabs" aria-label={pane ? 'Open documents, right side' : 'Open documents'} onkeydown={onTabKey}>
      {#each p.tabs as tb (tb.id)}
        {@const k = current(tb).key}
        {@const name = friendlyName(parseKey(k).path)}
        <div class="tab" class:is-active={tb.id === p.activeId}>
          <button class="tab-main" aria-current={tb.id === p.activeId ? 'true' : undefined} title={parseKey(k).path} onclick={() => app.activateTab(pane, tb.id)}><Icon name="file" /><span>{name}</span></button>
          <button class="tab-close" aria-label="Close {name}" title="Close" onclick={() => app.closeTab(pane, tb.id)}><Icon name="x" /></button>
        </div>
      {:else}
        <span class="tabs-empty">{t(lang, 'noDocument')}</span>
      {/each}
    </nav>
    {#if pane === 1}
      <div class="tabbar-end"><button class="icon-btn sm" aria-label="Close this side" title="Close this side" onclick={() => app.setSplit(false)}><Icon name="x" /></button></div>
    {/if}
  </div>
  <div class="toolbar">
    <button class="icon-btn sm" aria-label="Back (Alt + Left)" title="Back (Alt + Left)" disabled={!tab || tab.index <= 0} onclick={() => app.goBack(pane)}><Icon name="arrow-left" /></button>
    <button class="icon-btn sm" aria-label="Forward (Alt + Right)" title="Forward (Alt + Right)" disabled={!tab || tab.index >= tab.history.length - 1} onclick={() => app.goForward(pane)}><Icon name="arrow-right" /></button>
    <nav class="crumbs" aria-label="Location">
      {#if loc}
        <ol>
          <li><button title="Show this folder" onclick={() => app.revealFolder(loc.collectionId, '')}>{collectionName}</button></li>
          {#each folders as f, i (i)}
            <li><button title="Show this folder" onclick={() => app.revealFolder(loc.collectionId, folders.slice(0, i + 1).join('/'))}>{f}</button></li>
          {/each}
          <li aria-current="page"><span>{friendlyName(loc.path)}</span></li>
        </ol>
      {/if}
    </nav>
    <div class="tool-actions">
      <button class="icon-btn sm" aria-pressed={isFav} aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'} title={isFav ? 'Remove from favorites' : 'Add to favorites'} disabled={!key} onclick={() => key && app.toggleFavorite(key)}><Icon name="star" /></button>
      {#if pane === 0}
        <button class="icon-btn sm" aria-pressed={app.ws.split} aria-label={app.ws.split ? 'Back to single page' : 'Read side by side'} title="{app.ws.split ? 'Back to single page' : 'Read side by side'} ( \ )" onclick={() => app.setSplit(!app.ws.split)}><Icon name="columns" /></button>
      {/if}
    </div>
  </div>
  <div class="progress" role="progressbar" aria-label="Reading progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}><div class="progress-fill" style="width:{pct}%"></div></div>
  {#if key && entry && tab}
    {#key `${tab.id}:${key}`}
      <DocumentView {pane} docKey={key} {entry} />
    {/key}
  {:else}
    <div class="scroller"><div class="page"><div class="empty-pane">
      <Icon name="book" cls="big" />
      <h2>{t(lang, 'noDocument')}</h2>
      {#if suggestions.length}
        <p class="muted">{t(lang, 'chooseDocument')}</p>
        <ul>{#each suggestions as s (s)}<li><button class="link-btn" onclick={() => app.open(s, { pane })}>{friendlyName(parseKey(s).path)}</button></li>{/each}</ul>
      {/if}
      {#if pane === 1}<button class="btn" onclick={() => app.setSplit(false)}>Back to single page</button>{/if}
    </div></div></div>
    <div class="statusbar"></div>
  {/if}
</div>
```

`app/src/Divider.svelte`:
```svelte
<script lang="ts">
  import { app } from './state/app.svelte';

  let el = $state<HTMLElement>();

  function down(e: PointerEvent) {
    if (!el?.parentElement) return;
    el.setPointerCapture(e.pointerId);
    const box = el.parentElement.getBoundingClientRect();
    const move = (ev: PointerEvent) => app.setRatio((ev.clientX - box.left) / box.width);
    const up = () => {
      el?.removeEventListener('pointermove', move);
      el?.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }

  function key(e: KeyboardEvent) {
    const step = e.key === 'ArrowLeft' ? -0.05 : e.key === 'ArrowRight' ? 0.05 : 0;
    if (!step) return;
    e.preventDefault();
    app.setRatio(app.ws.ratio + step);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="divider" role="separator" aria-orientation="vertical" aria-label="Resize the two reading panes"
  aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(app.ws.ratio * 100)} tabindex="0"
  title="Drag to resize. Double-click to reset." bind:this={el} onpointerdown={down} onkeydown={key} ondblclick={() => app.setRatio(0.5)}></div>
```

`app/src/TocPanel.svelte`:
```svelte
<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import Icon from './Icon.svelte';
  import { t } from './lib/i18n';
  import { buildToc, type TocNode } from './lib/toc';
  import { app } from './state/app.svelte';

  const lang = $derived(app.library.prefs.lang);
  const pane = $derived(app.ws.activePane);
  const nodes = $derived(buildToc(app.headings[pane]));
  const now = $derived(app.currentSlugs[pane]);
  const title = $derived(app.headings[pane].find((h) => h.level === 1)?.text ?? '');
  const collapsed = new SvelteSet<string>();

  const withChildren = (list: TocNode[]): string[] => list.flatMap((n) => (n.children.length ? [n.slug, ...withChildren(n.children)] : []));
  const go = (e: MouseEvent, slug: string) => {
    e.preventDefault();
    app.scrollers[pane]?.(slug);
  };
</script>

{#snippet list(items: TocNode[])}
  <ol>
    {#each items as n (n.slug)}
      <li>
        <div class="toc-row">
          {#if n.children.length}
            <button class="toc-twisty" aria-expanded={!collapsed.has(n.slug)} aria-label="{collapsed.has(n.slug) ? 'Show' : 'Hide'} subsections of {n.text}"
              onclick={() => (collapsed.has(n.slug) ? collapsed.delete(n.slug) : collapsed.add(n.slug))}><Icon name="chevron" /></button>
          {:else}<span class="toc-spacer"></span>{/if}
          <a href="#{n.slug}" class="toc-link" class:current={n.slug === now} aria-current={n.slug === now ? 'location' : undefined} onclick={(e) => go(e, n.slug)}>{n.text}</a>
        </div>
        {#if n.children.length && !collapsed.has(n.slug)}{@render list(n.children)}{/if}
      </li>
    {/each}
  </ol>
{/snippet}

<aside class="toc" id="toc" aria-labelledby="toc-h">
  <div class="toc-head">
    <h2 id="toc-h">{t(lang, 'contents')}</h2>
    <div class="toc-tools">
      <button class="icon-btn sm" aria-label="Expand all sections" title="Expand all" onclick={() => collapsed.clear()}><Icon name="chev-down" /></button>
      <button class="icon-btn sm" aria-label="Collapse all sections" title="Collapse all" onclick={() => withChildren(nodes).forEach((s) => collapsed.add(s))}><Icon name="chev-up" /></button>
    </div>
  </div>
  <p class="toc-doc">{title}</p>
  <nav aria-label="Sections">
    {#if nodes.length}{@render list(nodes)}{:else}<p class="muted small">This document has no sections.</p>{/if}
  </nav>
</aside>
```

- [ ] **Step 2: Check.** Run `npm run check`. Expected: 0 errors and 0 warnings. Narrow `svelte-ignore` comments are allowed only where shown above.
- [ ] **Step 3: Commit.** `feat(app): add reading panes, tabs, history, side by side and the contents panel`

---

### Task 12: Home and Preferences screens

**Files:**
- Create: `app/src/HomeView.svelte` and `app/src/PrefsView.svelte`

**Interfaces:**
- Produces:
  - `<HomeView>`:
    - open a document, open a folder, or explore the sample library;
    - continue where you left off (restore the saved session, or start fresh);
    - recent documents with a progress bar;
    - your folders, with stars to favorite them.
  - `<PrefsView>`:
    - theme swatches (radios), reading font, text size, width, line spacing and zoom;
    - high contrast and reduced motion;
    - interface language;
    - restore defaults;
    - a live preview.

- [ ] **Step 1: Create the components.**

`app/src/HomeView.svelte`:
```svelte
<script lang="ts">
  import Icon from './Icon.svelte';
  import { t } from './lib/i18n';
  import { docKey, parseKey } from './lib/library';
  import { friendlyName } from './lib/markdown/slug';
  import { app } from './state/app.svelte';

  const lang = $derived(app.library.prefs.lang);
  const hasSample = $derived(app.collections.some((c) => c.id === 'sample'));
  const known = (key: string) => app.collections.some((c) => c.id === parseKey(key).collectionId);
  const sessionKeys = $derived(app.savedSession ? app.savedSession.panes.flatMap((p) => p.tabs.map((x) => x.key)).filter(known) : []);
  const recent = $derived(app.library.recent.filter((r) => known(r.key)).slice(0, 5));
  const suggested = $derived(hasSample ? ['README.md', 'Getting-Started.md', 'Guides/Introduction.md'].map((p) => docKey('sample', p)) : []);
  const folders = $derived([...app.collections].sort((a, b) => Number(app.library.favoriteCollections.includes(b.id)) - Number(app.library.favoriteCollections.includes(a.id))));
  const where = (key: string) => {
    const { collectionId, path } = parseKey(key);
    return `${app.collections.find((c) => c.id === collectionId)?.name ?? ''} › ${path}`;
  };
</script>

<section class="view" aria-labelledby="home-h">
  <div class="view-inner wide">
    <header class="home-hero">
      <p class="eyebrow">{t(lang, 'eyebrow')}</p>
      <h1 class="vt" id="home-h" tabindex="-1">{t(lang, 'welcome')}</h1>
      <p class="lede">{t(lang, 'welcomeSub')}</p>
      <div class="home-actions">
        <button class="action-card" onclick={() => app.openFile()}><Icon name="file-plus" /><span><strong>{t(lang, 'openFile')}</strong><small>{t(lang, 'openFileHint')}</small></span></button>
        <button class="action-card" onclick={() => app.addFolder()}><Icon name="folder-open" /><span><strong>{t(lang, 'openFolder')}</strong><small>{t(lang, 'openFolderHint')}</small></span></button>
        {#if hasSample}
          <button class="action-card primary" onclick={() => app.openSample()}><Icon name="book" /><span><strong>{t(lang, 'sample')}</strong><small>{t(lang, 'sampleHint')}</small></span></button>
        {/if}
      </div>
    </header>

    <div class="home-grid">
      <section aria-labelledby="hs-h">
        <h2 class="section-h" id="hs-h"><Icon name="restore" />{t(lang, 'continue')}</h2>
        {#if sessionKeys.length}
          <ul class="rows">{#each sessionKeys as k (k)}<li><Icon name="file" /><span class="row-main"><span class="row-title">{friendlyName(parseKey(k).path)}</span></span></li>{/each}</ul>
          <div class="btn-row">
            <button class="btn btn-primary" onclick={() => app.restoreSession()}>{t(lang, 'restore')}</button>
            <button class="btn" onclick={() => app.startFresh()}>{t(lang, 'fresh')}</button>
          </div>
        {:else}
          <p class="muted small">{t(lang, 'noSession')}</p>
          <div class="btn-row"><button class="btn" onclick={() => app.startFresh()}>{t(lang, 'fresh')}</button></div>
        {/if}
      </section>

      <section aria-labelledby="hr-h">
        <h2 class="section-h" id="hr-h"><Icon name="clock" />{recent.length ? t(lang, 'recentDocs') : t(lang, 'suggested')}</h2>
        <ul class="rows">
          {#each recent.length ? recent.map((r) => r.key) : suggested as k (k)}
            {@const pct = app.library.progress[k] ?? 0}
            <li>
              <Icon name="file" />
              <button class="row-open row-main" onclick={() => app.open(k)}><span class="row-title">{friendlyName(parseKey(k).path)}</span><span class="row-sub">{where(k)}</span></button>
              {#if recent.length}<span class="mini-bar" role="img" aria-label="{pct}% read" title="{pct}% read"><span style="width:{pct}%"></span></span>{/if}
            </li>
          {/each}
        </ul>
      </section>

      <section aria-labelledby="hc-h">
        <h2 class="section-h" id="hc-h"><Icon name="folder" />{t(lang, 'collections')}</h2>
        <ul class="rows">
          {#each folders as c (c.id)}
            {@const on = app.library.favoriteCollections.includes(c.id)}
            <li>
              <button class="star-btn" aria-pressed={on} aria-label="{on ? 'Remove' : 'Add'} {c.name} {on ? 'from' : 'to'} favorites" onclick={() => app.toggleFavoriteCollection(c.id)}><Icon name="star" /></button>
              <button class="row-open row-main" disabled={!c.available} onclick={() => app.openCollection(c.id)}>
                <span class="row-title">{c.name}</span><span class="row-sub">{c.available ? c.root : t(lang, 'unavailable')}</span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    </div>
  </div>
</section>
```

`app/src/PrefsView.svelte`:
```svelte
<script lang="ts">
  import { t } from './lib/i18n';
  import { LIMITS, type FontId, type Lang } from './lib/prefs';
  import { app } from './state/app.svelte';
  import ThemeSwatches from './ThemeSwatches.svelte';

  const prefs = $derived(app.library.prefs);
  const lang = $derived(prefs.lang);
  const widthLabel = $derived(prefs.width < 60 ? `Narrow (${prefs.width})` : prefs.width > 80 ? `Wide (${prefs.width})` : `Medium (${prefs.width})`);
  const num = (e: Event) => Number((e.currentTarget as HTMLInputElement).value);
</script>

<section class="view" aria-labelledby="prefs-h">
  <div class="view-inner wide">
    <h1 class="vt" id="prefs-h" tabindex="-1">{t(lang, 'prefsTitle')}</h1>
    <p class="lede">Changes apply straight away and are remembered on this computer.</p>
    <div class="prefs-grid">
      <form class="prefs" onsubmit={(e) => e.preventDefault()}>
        <fieldset>
          <legend>Colour theme</legend>
          <ThemeSwatches mode="radios" />
          <p class="hint">Automatic follows your computer: Paper by day, Night when it's set to dark. High contrast, below, replaces any theme's colours.</p>
        </fieldset>
        <div class="field">
          <label for="p-font">Reading font</label>
          <select id="p-font" value={prefs.font} onchange={(e) => app.setPref('font', (e.currentTarget as HTMLSelectElement).value as FontId)}>
            <option value="serif">Book serif (Literata)</option>
            <option value="sans">Clean sans-serif (Figtree)</option>
            <option value="easy">Easier-reading font (Lexend)</option>
          </select>
          <p class="hint">Lexend has wider letter shapes and spacing. Many readers with dyslexia find it easier to read.</p>
        </div>
        <div class="field"><label for="p-size">Text size</label><div class="range-row"><input type="range" id="p-size" min={LIMITS.fontSize[0]} max={LIMITS.fontSize[1]} step="1" value={prefs.fontSize} oninput={(e) => app.setPref('fontSize', num(e))} /><output for="p-size">{prefs.fontSize} px</output></div></div>
        <div class="field"><label for="p-width">Reading width</label><div class="range-row"><input type="range" id="p-width" min={LIMITS.width[0]} max={LIMITS.width[1]} step="1" value={prefs.width} oninput={(e) => app.setPref('width', num(e))} /><output for="p-width">{widthLabel}</output></div><p class="hint">Narrower lines are easier to follow. Wider lines fit more on screen.</p></div>
        <div class="field"><label for="p-lh">Line spacing</label><div class="range-row"><input type="range" id="p-lh" min={LIMITS.lineHeight[0]} max={LIMITS.lineHeight[1]} step="0.05" value={prefs.lineHeight} oninput={(e) => app.setPref('lineHeight', num(e))} /><output for="p-lh">{prefs.lineHeight.toFixed(2)}×</output></div></div>
        <div class="field"><label for="p-zoom">Interface zoom</label><div class="range-row"><input type="range" id="p-zoom" min={LIMITS.zoom[0]} max={LIMITS.zoom[1]} step="10" value={prefs.zoom} oninput={(e) => app.setPref('zoom', num(e))} /><output for="p-zoom">{prefs.zoom}%</output></div><p class="hint">Makes menus, buttons and text larger or smaller together.</p></div>
        <label class="switch"><input type="checkbox" checked={prefs.contrast} onchange={(e) => app.setPref('contrast', (e.currentTarget as HTMLInputElement).checked)} /><span><strong>High contrast</strong><span>Black and white with strong outlines.</span></span></label>
        <label class="switch"><input type="checkbox" checked={prefs.reduceMotion} onchange={(e) => app.setPref('reduceMotion', (e.currentTarget as HTMLInputElement).checked)} /><span><strong>Reduce motion</strong><span>Turns off scrolling and sliding animations. Your computer's own setting is always respected.</span></span></label>
        <div class="field">
          <label for="p-lang">Interface language</label>
          <select id="p-lang" value={prefs.lang} onchange={(e) => app.setPref('lang', (e.currentTarget as HTMLSelectElement).value as Lang)}>
            <option value="en">English</option><option value="es">Español</option><option value="de">Deutsch</option>
          </select>
          <p class="hint">Only the main menus and headings are translated so far. Your documents are never translated.</p>
        </div>
        <div><button class="btn" type="button" onclick={() => app.resetPrefs()}>Restore default settings</button></div>
      </form>
      <div class="preview-box" aria-label="Preview of your reading settings">
        <p class="eyebrow">Preview</p>
        <div class="doc">
          <h2>Public computers</h2>
          <p>There are 12 computers on the first floor. Patrons sign in with their library card number and get <strong>two hours</strong> per day. Sessions can be extended if nobody is waiting.</p>
          <p>Printing costs 10 cents per black-and-white page. Jobs wait in the print queue for 30 minutes before they're deleted.</p>
        </div>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Check.** Run `npm run check`. Expected: 0 errors and 0 warnings.
- [ ] **Step 3: Commit.** `feat(app): add the Home and Preferences screens`

---

### Task 13: Assemble the app and verify it end to end

**Files:**
- Modify: `app/src/App.svelte` (full replacement)

**Interfaces:**
- Consumes: every component above.
- Produces: the finished Plan 2 app, with global keyboard shortcuts, the theme and session listeners, and the divider grid.

- [ ] **Step 1: Replace `app/src/App.svelte`:**
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import AppBar from './AppBar.svelte';
  import Divider from './Divider.svelte';
  import HomeView from './HomeView.svelte';
  import IconSprite from './IconSprite.svelte';
  import PrefsView from './PrefsView.svelte';
  import ReaderPane from './ReaderPane.svelte';
  import Sidebar from './Sidebar.svelte';
  import TocPanel from './TocPanel.svelte';
  import { app } from './state/app.svelte';

  const columns = $derived(app.ws.split ? `minmax(0, ${app.ws.ratio}fr) .5rem minmax(0, ${1 - app.ws.ratio}fr)` : 'minmax(0, 1fr)');

  onMount(() => {
    void app.init();
    const scheme = matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => app.applyPrefs();
    scheme.addEventListener('change', onScheme);
    // A3: save when the window is hidden or the page goes away; otherwise at most once a second.
    const onHide = () => {
      if (document.visibilityState === 'hidden') void app.flush();
    };
    const onPageHide = () => void app.flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      scheme.removeEventListener('change', onScheme);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
    };
  });

  function onKey(e: KeyboardEvent) {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName);
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && app.view === 'reader') {
      e.preventDefault();
      if (e.key === 'ArrowLeft') app.goBack(app.ws.activePane);
      else app.goForward(app.ws.activePane);
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '[') app.toggleSidebar();
    else if (e.key === ']') app.toggleToc();
    else if (e.key === '\\') app.setSplit(!app.ws.split);
  }
</script>

<svelte:window onkeydown={onKey} />
<IconSprite />
<a class="skip" href="#main">Skip to the document</a>
<div class="app">
  <AppBar />
  <div class="workspace" data-view={app.view} data-sidebar={app.sidebarOpen ? 'open' : 'closed'} data-toc={app.tocOpen ? 'open' : 'closed'}>
    {#if app.view !== 'home'}<Sidebar />{/if}
    <main id="main" tabindex="-1">
      {#if app.notice}
        <p class="notice" role="status">{app.notice} <button class="link-btn" onclick={() => (app.notice = null)}>Dismiss</button></p>
      {/if}
      {#if app.view === 'home'}
        <HomeView />
      {:else if app.view === 'prefs'}
        <PrefsView />
      {:else}
        <section class="view" id="view-reader" aria-label="Reading">
          <div class="panes" class:is-split={app.ws.split} style:grid-template-columns={columns}>
            <ReaderPane pane={0} />
            {#if app.ws.split}<Divider /><ReaderPane pane={1} />{/if}
          </div>
        </section>
      {/if}
    </main>
    {#if app.view === 'reader'}<TocPanel />{/if}
  </div>
</div>
```

- [ ] **Step 2: Run every automated check.**

  In `app/`:
  - `npm test`: every test passes.
  - `npm run check`: 0 errors and 0 warnings.
  - `npx tsc --noEmit -p tsconfig.json`: clean.
  - `npm run check:readonly`: passes.
  - `npm run build`: succeeds.

  In `app/src-tauri`, with `CARGO_TARGET_DIR` set: `cargo test` passes.

  Paste the raw summary lines into the report.

- [ ] **Step 3: Verify by hand in the running app.**

  Start it in `app/` with `npm run tauri dev`, using `CARGO_TARGET_DIR` from the implementer rules.

  A subagent can't see the window. It runs this as a launch-and-log check: no panic and no Vite or Svelte error. The product owner then works through the checklist below.

  1. **Home.** Home opens first. **Explore the sample library** opens the README in a tab, with the sidebar on the left and the contents on the right.
  2. **Navigation.** A wiki link in the README opens in the same tab, and **Back** returns. **Ctrl-click** opens a new tab, and **Shift-click** opens it on the right side.
  3. **Side by side.** The `\` key splits the window, the divider drags between 25% and 75%, each side scrolls on its own, and **Close this side** merges the tabs back.
  4. **Contents panel.** Contents entries jump to their section. The highlighted entry follows scrolling. Collapse all and expand all work. `[` and `]` hide and show the panels.
  5. **Themes.** Changing the theme from the appearance button recolours everything. Diagrams in **Technical › Diagrams** draw, and redraw in the new colours. Maths renders.
  6. **Fast tab switching.** Click quickly between three tabs while one document is still loading. Each tab must show its own document.
  7. **Preferences.** Text size, width, line spacing, zoom, Lexend, high contrast and reduced motion each change the reading page or the interface. Spanish changes the main labels. **Restore default settings** undoes them all.
  8. **Favorites.** Star a document. It appears under Favorites, and its tree entry shows a star.
  9. **Restart.** Close and reopen the app. Home offers **Restore previous session** with the same tabs, and restoring brings back the scroll positions. Recent documents show progress bars.
  10. **Open a document.** Choose a single `.md` file in a folder whose path has spaces. Its folder appears under **Your folders**, and its links to neighbouring pages work.
  11. **Offline.** Turn off the network and restart. The fonts still look the same, because nothing is fetched.

- [ ] **Step 4: Commit.** `feat(app): assemble the full reading workspace`

---

## Self-review notes (completed while writing)

**Coverage of what Plan 2 promised:**

| Promised | Task |
|---|---|
| App bar | 9 |
| Sidebar (filter, favorites, recent) | 10 |
| Tabs and history | 4 and 11 |
| Side-by-side panes | 4 and 11 |
| Contents panel | 5 and 11 |
| Progress | 5 and 11 |
| Home and session restore | 4, 8 and 12 |
| Preferences with themes and bundled fonts | 3, 7 and 12 |
| Lazy Mermaid | 6 and 11 |

**Deferred items from Plan 1, now picked up:**

| Item | Task |
|---|---|
| Sample library and folders shown when the library fails to load | 8 (`init`) |
| Backups never overwritten | 1 |
| `pick_file` | 1 |

**Still deferred, as listed in the Plan 1 ledger:**
- Everything for Plans 3 and 4: search, bookmarks, the document details dialog, the watcher, the link dialog, remote pictures and Copy details.
- Crash-to-error handling, lock poisoning, and the non-UTF-8 path cases.

**Type consistency checked:**
- `Session`, `SessionPane`, `Entry` and `WorkspaceState` are the same in `workspace.ts`, `library.ts` and the store.
- `CoreApi` is the type of `core`. `pickFile` is added to `core` in Task 8, Step 1, before the store test uses it.
- `HeadingInfo` matches across `toc.ts`, `DocumentView` and `TocPanel`.
- The store re-exports `assetUrl`, which `DocumentView` imports from `./state/app.svelte`.

**Execution order:** 1, then 3 → 4 → 2 (the types depend on each other), then 5, 6, 7, 8, 9, 10, 11, 12, 13.
