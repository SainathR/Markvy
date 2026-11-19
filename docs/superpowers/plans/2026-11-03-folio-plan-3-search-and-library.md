# Folio Plan 3: Search, Library and Live Reload

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the prototype's remaining reading tools:
- search across every folder, one folder or one document, with a search box and suggestions in the app bar;
- the Search and Library screens;
- bookmarks;
- the find bar that highlights a search inside a document;
- the document details dialog;
- live reload when files change on disk.

**Architecture:**
- **Rust core.** A new `search` module turns each document into sections (heading plus text) and answers queries. A new `indexer` module builds one index per folder on a background thread, watches the folder, and sends the events `index-progress`, `collection-changed` and `collection-unavailable`. A new `search` command answers queries; `get_tree` starts indexing and watching.
- **Pure logic.** TypeScript modules with unit tests: bookmarks, search history and Library rows (`lib/library.ts`), highlighting (`lib/search.ts`), find marks (`lib/find.ts`), document details (`lib/details.ts`) and formatting (`lib/format.ts`).
- **App store and components.** The store gains the search form, results, find state, bookmarks and the event handlers. New components are the Search and Library screens, the app-bar search box, a shared dialog and the details dialog. The pane gains three toolbar buttons and the find bar.

**Tech Stack:**
- Plans 1 and 2: Tauri 2, Svelte 5 runes, TypeScript, Vitest with jsdom, marked, DOMPurify, KaTeX and Mermaid.
- New, Rust only:
  - `pulldown-cmark` 0.12 with default features off, to find headings and text.
  - `notify-debouncer-mini` 0.4, which brings `notify` 6, to watch folders.
  - Neither makes network calls.

**Spec:** `docs/superpowers/specs/2026-11-02-folio-desktop-architecture-design.md`. The approved prototype `index.html` is the visual reference. Its `searchDocs`, `renderResults`, `suggest`, `renderLibrary`, `infoDialog`, `toggleBookmark` and find functions are the behaviour this plan ports.

## Spec amendments this plan proposes (needs the product owner's approval before execution)

| # | Spec says | This plan does | Why |
|---|---|---|---|
| A4 | `search` returns `SearchResult[]` with "snippet ranges" | `search` returns `{ results, indexing }`. Each result has `title`, `titleMatch` and `total`. Each hit has a plain-text `snippet`, which the screens highlight themselves. | Rust and JavaScript count string positions differently (bytes vs UTF-16), and accented or Asian text would put highlights in the wrong place. The `indexing` flag drives "still indexing". |
| A5 | Library list shows file size and last-updated columns, and sorts by size | Those columns and the size sort are left out. The details dialog still shows size and date. | The folder tree carries no sizes, and reading them would mean a disk call per row. |
| A6 | (no app-bar entry for Library) | The app bar gains a Library button. | The prototype reached Library from its demo navigation strip, which the desktop app doesn't have. |
| A7 | Plan 1 note: "Plan 3 adds matching by title" for wiki links | Wiki links keep matching file names only. | The sample library and the usual wiki style (`[[Security]]`) link by file name. Matching titles would also mean redrawing open pages when indexing finishes. |

## Out of scope (later plans)

- **Plan 4:**
  - the website-link dialog and `open_external`;
  - approving remote pictures;
  - Privacy & Help;
  - Copy details and log files;
  - `forget_collection` (removing a folder from the list);
  - next-step buttons on the "moved or deleted" page.
- **Plan 5:** whole-app automation, CI (including the speed benchmarks) and installers.

## Global Constraints

Every task's requirements include this section.

- **Earlier constraints still hold.**
  - The core is read-only, and every file access goes through `paths::resolve`.
  - The CSP string is unchanged.
  - There is no CDN or network code.
  - Errors use `{code, details?}`.
  - Messages are plain language, taken verbatim from spec §5 or `MESSAGES`.
  - Rust builds use `CARGO_TARGET_DIR="$LOCALAPPDATA/folio-target"`.
- **Read-only, still enforced.** The indexer and the watcher only read. `npm run check:readonly` must pass.
- **New Rust dependencies, and no others:**
  - `pulldown-cmark = { version = "0.12", default-features = false }`
  - `notify-debouncer-mini = "0.4"`, using its re-exported `notify`.
- **Events.**
  - Names are exactly `index-progress`, `collection-changed` and `collection-unavailable`.
  - Payloads are camelCase:
    - `index-progress`: `{ collectionId, indexed, total, done }`
    - `collection-changed`: `{ collectionId, changes: [{ path, kind }] }`, where `kind` is `created`, `modified` or `removed`.
    - `collection-unavailable`: `{ collectionId }`
- **Search limits:**

  | Limit | Value |
  |---|---|
  | Query length | 200 characters |
  | Documents per search | 100 |
  | Sections shown per document | 3 |
  | Snippet length | about 200 characters |
  | Search history | 15 |
  | Search-box suggestions | 6, plus "Search all documents for …" |
  | Recent searches shown on the Search screen | 8 |
  | Bookmarks in the sidebar | 6 |
- **Ranking** follows the prototype's `searchDocs`:
  - a heading match scores 10;
  - the whole phrase in the text scores 5, and all the words anywhere in the section score 1;
  - a title match adds 20;
  - each matching section adds 0.1;
  - matching ignores case, and "Whole words" means no letter, digit or `_` on either side.
- **Heading slugs** follow one rule in both languages. `app/tests/fixtures/slug-cases.json` is read by both test suites.
- **Untrusted text.** Snippets, headings and titles are document text. They are rendered as Svelte text and `<mark>` elements, never with `{@html}`.
- **Library keys.**
  - The screens now also own `bookmarks` (`{ id, key, slug, heading, at }`) and `searches` (`{ q, at }`).
  - Unknown keys, such as Plan 4's `allowedImageSites`, still survive a save.
- **Keyboard:**
  - `/` (when not typing) and `Ctrl+K` / `Cmd+K` focus the search box.
  - In the search box, `↑` and `↓` move through suggestions, `Enter` chooses one, and `Esc` closes the list.
  - In the reader, `Esc` clears the find highlights.
  - Library tabs move with `←` and `→`.
- **Icon-only buttons** carry `aria-label` and `title`.

## Review Focus

These are the five inputs most likely to bite real users that the spec doesn't spell out. Each line names the test that pins it.

1. **An editor saves a file the usual way:** it writes a temporary or hidden file, then renames it over the original. The document must reload once, keep its place, and never show "moved or deleted" for a file that still exists. Test: Task 3 `editor_save_through_a_temporary_file_is_one_change`.
2. **The opened folder disappears:** the drive is unplugged, or the folder is renamed or deleted. The app must say the folder can't be reached, mark it unavailable, leave it out of search, and not crash. Tests: Task 8 `a folder that goes away is reported and the folder list refreshed`, and Task 3 `a_forgotten_folder_stops_quietly`.
3. **A query with symbols in it**, such as `C++ (beta)` or `$5`. It must match literally in the core and in the highlights, and never throw. Tests: Task 2 `special_characters_match_literally`, and Task 6 `matcher escapes regular-expression characters`.
4. **Non-English text:** accents, Cyrillic, Japanese or emoji, in long sections. There must be no panic at a character boundary, the snippet must contain the match, and the highlights must line up. Tests: Task 2 `snippets_show_the_match_in_long_text_without_splitting_characters` and `ignores_case_including_accented_letters`, and Task 6 `highlight` tests.
5. **Searching while a large folder is still being indexed.** It must give partial results, say "still indexing", and search again by itself when indexing finishes. Tests: Task 3 `reports_still_indexing`, and Task 8 `searches again when indexing finishes`.

---

### Task 1: Rust core: document sections and heading slugs (`search.rs`, part 1)

**Files:**
- Create: `app/src-tauri/src/search.rs`
- Create: `app/tests/fixtures/slug-cases.json`
- Modify: `app/src-tauri/Cargo.toml`
- Modify: `app/src-tauri/src/lib.rs`
- Modify: `app/src/lib/markdown/slug.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `search::Section { slug, heading, level: u8, text }`. Level 0 is the text before the first heading.
  - `search::DocEntry { title, sections }`.
  - `search::extract(text: &str, path: &str) -> DocEntry`.
  - `search::fold(&str) -> String`, which lower-cases one character for one character.
  - `search::slugify(&str) -> String`.
  - `search::Slugger::next(&mut self, &str) -> String`.
  - Private fields `heading_f`, `text_f` and `title_f` hold folded copies for Task 2.

- [ ] **Step 1: Add the dependency and the module.**

  In `app/src-tauri/Cargo.toml`, under `[dependencies]`, add:
  ```toml
  pulldown-cmark = { version = "0.12", default-features = false }
  ```
  In `app/src-tauri/src/lib.rs`, add `pub mod search;` after `pub mod reader;`.

- [ ] **Step 2: Write the shared slug cases.** Create `app/tests/fixtures/slug-cases.json`:
```json
{
  "single": [
    ["Hello World", "hello-world"],
    ["  Getting   Started  ", "getting-started"],
    ["What's new?", "whats-new"],
    ["Café & Crème", "café-crème"],
    ["Step 1: Install", "step-1-install"],
    ["already-hyphenated title", "already-hyphenated-title"],
    ["a - b", "a---b"],
    ["100% Done!", "100-done"],
    ["Привет мир", "привет-мир"],
    ["日本語の見出し", "日本語の見出し"],
    ["Emoji 🎉 Party", "emoji-party"],
    ["Trailing ?", "trailing-"],
    ["?Leading", "leading"],
    ["Wi-Fi & printing", "wi-fi-printing"],
    ["snake_case name", "snakecase-name"]
  ],
  "sequences": [
    { "in": ["Example", "Example", "Example 1"], "out": ["example", "example-1", "example-1-1"] },
    { "in": ["A", "A-1", "A"], "out": ["a", "a-1", "a-2"] }
  ]
}
```

- [ ] **Step 3: Pin the screens' slug rule to the cases.** In `app/src/lib/markdown/slug.test.ts`, add these imports below the existing ones:
```ts
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
```
and add at the end of the file:
```ts
// The core numbers headings for search results; both sides must agree (tests/fixtures/slug-cases.json).
const cases = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../tests/fixtures/slug-cases.json'), 'utf8')) as {
  single: [string, string][];
  sequences: { in: string[]; out: string[] }[];
};

describe('shared slug cases', () => {
  it('follows the slug cases shared with the core', () => {
    for (const [input, out] of cases.single) expect(slugify(input)).toBe(out);
    for (const seq of cases.sequences) {
      const next = uniqueSlugger();
      expect(seq.in.map((s) => next(s))).toEqual(seq.out);
    }
  });
});
```
Run in `app/`: `npx vitest run src/lib/markdown/slug.test.ts`. Expected: PASS. The cases describe the existing TypeScript rule; if one fails, fix the JSON, never `slug.ts`.

- [ ] **Step 4: Write the failing Rust tests.** Create `app/src-tauri/src/search.rs` containing only the test module below. Steps 5–6 add the code above it.
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn headings(doc: &DocEntry) -> Vec<(u8, &str, &str)> {
        doc.sections.iter().map(|s| (s.level, s.slug.as_str(), s.heading.as_str())).collect()
    }

    #[test]
    fn slugs_follow_the_shared_cases() {
        let cases: Value = serde_json::from_str(include_str!("../../tests/fixtures/slug-cases.json")).unwrap();
        for case in cases["single"].as_array().unwrap() {
            assert_eq!(slugify(case[0].as_str().unwrap()), case[1].as_str().unwrap(), "slug of {case}");
        }
        for case in cases["sequences"].as_array().unwrap() {
            let mut slugger = Slugger::default();
            let got: Vec<String> = case["in"].as_array().unwrap().iter().map(|t| slugger.next(t.as_str().unwrap())).collect();
            let want: Vec<&str> = case["out"].as_array().unwrap().iter().map(|t| t.as_str().unwrap()).collect();
            assert_eq!(got, want);
        }
    }

    #[test]
    fn splits_sections_and_numbers_repeated_headings() {
        let doc = extract("# Guide\nIntro text.\n\n## Setup\nStep one.\n\n## Setup\nAgain.\n", "Guide.md");
        assert_eq!(doc.title, "Guide");
        assert_eq!(headings(&doc), [(1, "guide", "Guide"), (2, "setup", "Setup"), (2, "setup-1", "Setup")]);
        assert_eq!(doc.sections[1].text, "Step one.");
    }

    #[test]
    fn keeps_text_before_the_first_heading() {
        let doc = extract("Opening words.\n\n# Title\nBody.", "a.md");
        let first = &doc.sections[0];
        assert_eq!((first.level, first.slug.as_str(), first.text.as_str()), (0, "", "Opening words."));
    }

    #[test]
    fn code_blocks_are_text_not_headings() {
        let doc = extract("```\n# not a heading\n```\n\n# Real\n", "a.md");
        assert_eq!(headings(&doc), [(0, "", ""), (1, "real", "Real")]);
        assert_eq!(doc.sections[0].text, "# not a heading");
    }

    #[test]
    fn underlined_headings_count() {
        let doc = extract("Title\n=====\n\nBody text.\n", "a.md");
        assert_eq!(headings(&doc), [(1, "title", "Title")]);
    }

    #[test]
    fn frontmatter_title_wins_and_is_not_searched() {
        let doc = extract("---\ntitle: \"Wi-Fi Guide\"\ntags: [net, help]\n---\n# Other\nBody.", "a.md");
        assert_eq!(doc.title, "Wi-Fi Guide");
        assert!(doc.sections.iter().all(|s| !s.text.contains("tags")));
    }

    #[test]
    fn a_leading_rule_is_not_frontmatter() {
        let doc = extract("---\n\nJust a rule above.\n\n# Heading\n", "a.md");
        assert_eq!(doc.title, "Heading");
        assert_eq!(doc.sections[0].text, "Just a rule above.");
    }

    #[test]
    fn wiki_links_show_their_label() {
        let doc = extract("# See [[Security|the guide]]\nRead [[Glossary]] and [[Guides/Intro#Wi-Fi]].", "a.md");
        assert_eq!((doc.sections[0].slug.as_str(), doc.sections[0].heading.as_str()), ("see-the-guide", "See the guide"));
        assert_eq!(doc.sections[0].text, "Read Glossary and Guides/Intro#Wi-Fi.");
    }

    #[test]
    fn callout_markers_are_dropped() {
        assert_eq!(extract("> [!NOTE]\n> Keep it short.\n", "a.md").sections[0].text, "Keep it short.");
    }

    #[test]
    fn title_falls_back_to_the_file_name() {
        assert_eq!(extract("No headings here.", "Guides/getting_started-now.md").title, "getting started now");
    }

    #[test]
    fn table_cells_and_list_items_stay_separate_words() {
        let doc = extract("| a | b |\n|---|---|\n| one | two |\n\n- first\n- second\n", "a.md");
        assert_eq!(doc.sections[0].text, "a b one two first second");
    }
}
```

- [ ] **Step 5: Run the tests and confirm they fail.**

  Run in `app/src-tauri/` (with the `PATH` and `CARGO_TARGET_DIR` exports): `cargo test search::`

  Expected: FAIL to compile, because `extract`, `slugify` and `Slugger` don't exist.

- [ ] **Step 6: Implement.** Put this above the test module in `search.rs`:
```rust
//! The search index: what each document says, section by section, and how a query finds it.
use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use std::collections::{HashMap, HashSet};

/// One heading and the text under it. Level 0 holds the text before the first heading.
#[derive(Debug, Clone)]
pub struct Section {
    pub slug: String,
    pub heading: String,
    pub level: u8,
    pub text: String,
    heading_f: String,
    text_f: String,
}

impl Section {
    fn new(slug: String, heading: String, level: u8, text: String) -> Self {
        Section { heading_f: fold(&heading), text_f: fold(&text), slug, heading, level, text }
    }
}

#[derive(Debug, Clone)]
pub struct DocEntry {
    pub title: String,
    title_f: String,
    pub sections: Vec<Section>,
}

/// Lower-cases one character for one character, so a position in the folded text is the same position in the original.
pub fn fold(s: &str) -> String {
    s.chars().map(|c| c.to_lowercase().next().unwrap_or(c)).collect()
}

/// The rules of `slugify` in src/lib/markdown/slug.ts. tests/fixtures/slug-cases.json keeps the two in step.
pub fn slugify(text: &str) -> String {
    let mut out = String::new();
    let mut in_space = false;
    for c in text.to_lowercase().trim().chars() {
        if c.is_whitespace() {
            if !in_space {
                out.push('-');
                in_space = true;
            }
        } else if c.is_alphanumeric() || c == '-' {
            out.push(c);
            in_space = false;
        } // other characters are dropped and don't end a run of spaces: "a & b" -> "a-b"
    }
    out
}

/// `uniqueSlugger` from slug.ts: repeated headings get -1, -2 … and an issued slug is never reused.
#[derive(Default)]
pub struct Slugger {
    seen: HashMap<String, usize>,
    issued: HashSet<String>,
}

impl Slugger {
    pub fn next(&mut self, text: &str) -> String {
        let base = slugify(text);
        let mut n = self.seen.get(&base).copied().unwrap_or(0);
        let mut slug = if n > 0 { format!("{base}-{n}") } else { base.clone() };
        while self.issued.contains(&slug) {
            n += 1;
            slug = format!("{base}-{n}");
        }
        self.seen.insert(base, n + 1);
        self.issued.insert(slug.clone());
        slug
    }
}

fn level_number(level: HeadingLevel) -> u8 {
    match level {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}

fn unquote(s: &str) -> String {
    let s = s.strip_prefix(['"', '\'']).unwrap_or(s);
    s.strip_suffix(['"', '\'']).unwrap_or(s).to_string()
}

/// The frontmatter's `title:` and the body after the frontmatter. Same rules as splitFrontmatter in frontmatter.ts.
fn split_frontmatter(text: &str) -> (Option<String>, &str) {
    let Some(rest) = text.strip_prefix("---\n").or_else(|| text.strip_prefix("---\r\n")) else {
        return (None, text);
    };
    let mut offset = 0;
    for line in rest.split_inclusive('\n') {
        if line.trim_end_matches(['\r', '\n']).trim_end_matches([' ', '\t']) == "---" {
            let block = &rest[..offset];
            let keyed = |l: &str| {
                l.split_once(':')
                    .is_some_and(|(k, _)| !k.is_empty() && k.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'))
            };
            if !block.is_empty() && !block.lines().any(keyed) {
                return (None, text); // a horizontal rule, not frontmatter
            }
            let title = block
                .lines()
                .find_map(|l| l.strip_prefix("title:"))
                .map(|v| unquote(v.trim()))
                .filter(|v| !v.is_empty() && !(v.starts_with('[') && v.ends_with(']')));
            return (title, &rest[offset + line.len()..]);
        }
        offset += line.len();
    }
    (None, text)
}

/// "[[Target|label]]" reads as "label" and "[[Target]]" as "Target", as the reader shows them.
fn strip_wiki(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(start) = rest.find("[[") {
        let Some(len) = rest[start + 2..].find("]]") else { break };
        let inner = &rest[start + 2..start + 2 + len];
        out.push_str(&rest[..start]);
        out.push_str(inner.split_once('|').map_or(inner, |(_, label)| label).trim());
        rest = &rest[start + 2 + len + 2..];
    }
    out.push_str(rest);
    out
}

/// What a reader sees: wiki links show their label, callout markers go, and runs of space become one.
fn tidy(raw: &str) -> String {
    let mut s = strip_wiki(raw);
    for kind in ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"] {
        s = s.replace(&format!("[!{kind}]"), "");
    }
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Same as friendlyName in slug.ts: "Guides/getting_started.md" -> "getting started".
fn friendly_name(path: &str) -> String {
    let name = path.rsplit('/').next().unwrap_or(path);
    let lower = name.to_ascii_lowercase();
    let stem = [".markdown", ".md", ".txt"]
        .iter()
        .find(|ext| lower.ends_with(**ext))
        .map_or(name, |ext| &name[..name.len() - ext.len()]);
    let mut out = String::new();
    let mut joined = false;
    for c in stem.chars() {
        if c == '-' || c == '_' {
            if !joined {
                out.push(' ');
                joined = true;
            }
        } else {
            out.push(c);
            joined = false;
        }
    }
    out
}

/// Splits a document into sections the way the reader shows it, with the same heading slugs.
pub fn extract(text: &str, path: &str) -> DocEntry {
    let (fm_title, body) = split_frontmatter(text);
    // (level, heading, text): the text before any heading, then one entry per heading in order.
    let mut drafts: Vec<(u8, String, String)> = vec![(0, String::new(), String::new())];
    let mut in_heading = false;
    let options = Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TASKLISTS;
    for event in Parser::new_ext(body, options) {
        match event {
            Event::Start(Tag::Heading { level, .. }) => {
                drafts.push((level_number(level), String::new(), String::new()));
                in_heading = true;
            }
            Event::End(TagEnd::Heading(_)) => in_heading = false,
            Event::Text(t) | Event::Code(t) => {
                let d = drafts.last_mut().expect("never empty");
                if in_heading { d.1.push_str(&t) } else { d.2.push_str(&t) }
            }
            // Line breaks and the ends of paragraphs, list items, table cells and code blocks separate words.
            Event::SoftBreak
            | Event::HardBreak
            | Event::End(TagEnd::Paragraph | TagEnd::Item | TagEnd::TableCell | TagEnd::CodeBlock) => {
                let d = drafts.last_mut().expect("never empty");
                if in_heading { d.1.push(' ') } else { d.2.push(' ') }
            }
            _ => {}
        }
    }
    let mut slugger = Slugger::default();
    let mut sections = Vec::new();
    for (level, heading, text) in drafts {
        let heading = tidy(&heading);
        let text = tidy(&text);
        if level == 0 {
            if !text.is_empty() {
                sections.push(Section::new(String::new(), heading, 0, text));
            }
        } else {
            sections.push(Section::new(slugger.next(&heading), heading, level, text));
        }
    }
    let title = fm_title
        .or_else(|| sections.iter().find(|s| s.level == 1 && !s.heading.is_empty()).map(|s| s.heading.clone()))
        .unwrap_or_else(|| friendly_name(path));
    DocEntry { title_f: fold(&title), title, sections }
}
```

- [ ] **Step 7: Run the tests and confirm they pass.** Run `cargo test search::`. Expected: 11 passed. If `a_leading_rule_is_not_frontmatter` or `wiki_links_show_their_label` disagrees with pulldown-cmark's event split, fix `extract`, not the test: the test describes what the reader shows.
- [ ] **Step 8: Commit.** `feat(core): split documents into searchable sections with the reader's heading slugs`

---

### Task 2: Rust core: answering a query (`search.rs`, part 2)

**Files:**
- Modify: `app/src-tauri/src/search.rs`

**Interfaces:**
- Consumes: Task 1's `DocEntry`, `Section` (with the folded fields) and `fold`.
- Produces:
  - `MAX_QUERY_CHARS = 200` and `MAX_RESULTS = 100`.
  - `Scope`, deserialized from `{"kind":"all"}`, `{"kind":"collection","collectionId"}` or `{"kind":"document","collectionId","path"}`.
  - `Filters { headings_only, whole_words, folder }`, from camelCase JSON, with every field optional.
  - `Hit { slug, heading, level, snippet, heading_match }`.
  - `SearchResult { collection_id, path, title, title_match, total, hits, score }`. `score` is not serialized.
  - `SearchResponse { results, indexing }`.
  - `search_docs<'a>(docs: impl IntoIterator<Item = (&'a str, &'a str, &'a DocEntry)>, query: &str, filters: &Filters) -> Vec<SearchResult>`. Each item is `(collection_id, path, doc)`.

- [ ] **Step 1: Write the failing tests.** Append inside `mod tests` in `search.rs`:
```rust
    fn doc(text: &str) -> DocEntry {
        extract(text, "doc.md")
    }

    fn run(docs: &[(&str, &str, &DocEntry)], q: &str, f: &Filters) -> Vec<SearchResult> {
        search_docs(docs.iter().map(|(c, p, d)| (*c, *p, *d)), q, f)
    }

    fn opts() -> Filters {
        Filters::default()
    }

    #[test]
    fn ranks_title_and_heading_matches_first() {
        let a = doc("# Printing\nHow to print a page.");
        let b = doc("# Welcome\nYou can find printing help later.");
        let res = run(&[("c", "b.md", &b), ("c", "a.md", &a)], "printing", &opts());
        assert_eq!(res.iter().map(|r| r.path.as_str()).collect::<Vec<_>>(), ["a.md", "b.md"]);
        assert!(res[0].title_match && res[0].hits[0].heading_match);
    }

    #[test]
    fn all_words_in_any_order_match() {
        let d = doc("# Network\nThe guest password changes weekly.");
        assert_eq!(run(&[("c", "d.md", &d)], "weekly password", &opts()).len(), 1);
        assert!(run(&[("c", "d.md", &d)], "weekly modem", &opts()).is_empty());
    }

    #[test]
    fn headings_only_ignores_body_text() {
        let d = doc("# Network\nPrinting is elsewhere.");
        let f = Filters { headings_only: true, ..opts() };
        assert!(run(&[("c", "d.md", &d)], "printing", &f).is_empty());
        assert_eq!(run(&[("c", "d.md", &d)], "network", &f).len(), 1);
    }

    #[test]
    fn whole_words_skip_longer_words() {
        let d = doc("# Help\nThe printer is upstairs.");
        assert_eq!(run(&[("c", "d.md", &d)], "print", &opts()).len(), 1);
        assert!(run(&[("c", "d.md", &d)], "print", &Filters { whole_words: true, ..opts() }).is_empty());
    }

    #[test]
    fn folder_filter_keeps_that_folder_only() {
        let d = doc("# Wi-Fi\nConnect here.");
        let f = Filters { folder: "Guides".into(), ..opts() };
        let res = run(&[("c", "Guides/a.md", &d), ("c", "Guidesx/b.md", &d), ("c", "c.md", &d)], "wi-fi", &f);
        assert_eq!(res.iter().map(|r| r.path.as_str()).collect::<Vec<_>>(), ["Guides/a.md"]);
    }

    #[test]
    fn ignores_case_including_accented_letters() {
        let d = doc("# Café\nOpen daily.");
        assert_eq!(run(&[("c", "d.md", &d)], "CAFÉ", &opts()).len(), 1);
    }

    #[test]
    fn special_characters_match_literally() {
        let d = doc("# Pricing\nC++ (beta) costs $5.");
        assert_eq!(run(&[("c", "d.md", &d)], "c++ (beta)", &opts()).len(), 1);
        assert_eq!(run(&[("c", "d.md", &d)], "$5", &opts()).len(), 1);
    }

    #[test]
    fn snippets_show_the_match_in_long_text_without_splitting_characters() {
        let long = format!("{} needle {}", "日本語 ".repeat(60), "émoji 🎉 ".repeat(60));
        let d = doc(&format!("# T\n{long}"));
        let res = run(&[("c", "d.md", &d)], "NEEDLE", &opts());
        let hit = &res[0].hits[0];
        assert!(hit.snippet.starts_with("… ") && hit.snippet.ends_with(" …"));
        assert!(hit.snippet.contains("needle"));
        assert!(hit.snippet.chars().count() <= 205);
    }

    #[test]
    fn title_alone_can_match() {
        let d = doc("---\ntitle: Wi-Fi Guide\n---\nNothing else.");
        let res = run(&[("c", "d.md", &d)], "wi-fi guide", &opts());
        assert_eq!((res.len(), res[0].title_match, res[0].hits.len()), (1, true, 0));
    }

    #[test]
    fn empty_and_space_only_queries_find_nothing() {
        let d = doc("# A\nB");
        assert!(run(&[("c", "d.md", &d)], "   ", &opts()).is_empty());
    }

    #[test]
    fn shows_three_hits_and_counts_the_rest() {
        let d = doc("# One\nlamp\n# Two\nlamp\n# Three\nlamp\n# Four\nlamp");
        let res = run(&[("c", "d.md", &d)], "lamp", &opts());
        assert_eq!((res[0].total, res[0].hits.len()), (4, 3));
        assert_eq!(res[0].hits[0].slug, "one"); // equal scores keep document order
    }

    #[test]
    fn caps_the_number_of_documents() {
        let d = doc("# Lamp\nlamp");
        let paths: Vec<String> = (0..150).map(|i| format!("{i}.md")).collect();
        let docs: Vec<(&str, &str, &DocEntry)> = paths.iter().map(|p| ("c", p.as_str(), &d)).collect();
        assert_eq!(search_docs(docs, "lamp", &opts()).len(), MAX_RESULTS);
    }

    #[test]
    fn scope_and_filters_arrive_from_the_screens() {
        let s: Scope = serde_json::from_str(r#"{"kind":"document","collectionId":"c1","path":"a.md"}"#).unwrap();
        assert_eq!(s, Scope::Document { collection_id: "c1".into(), path: "a.md".into() });
        let f: Filters = serde_json::from_str(r#"{"wholeWords":true}"#).unwrap();
        assert!(f.whole_words && !f.headings_only && f.folder.is_empty());
    }

    #[test]
    fn results_reach_the_screens_in_camel_case() {
        let d = doc("# Lamp\nlamp");
        let v = serde_json::to_value(&run(&[("c", "d.md", &d)], "lamp", &opts())[0]).unwrap();
        assert_eq!(v["collectionId"], "c");
        assert_eq!(v["titleMatch"], true);
        assert_eq!(v["hits"][0]["headingMatch"], true);
        assert!(v.get("score").is_none());
    }

    #[test]
    #[ignore = "speed check: cargo test --release search_speed -- --ignored"]
    fn search_speed_5000_documents() {
        let part = "words of plain text about the library and its many rooms ".repeat(8);
        let body: String = (0..10).map(|i| format!("## Part {i}\n{part}\n")).collect();
        let d = doc(&format!("# Handbook\n{body}"));
        let paths: Vec<String> = (0..5000).map(|i| format!("{i}.md")).collect();
        let docs: Vec<(&str, &str, &DocEntry)> = paths.iter().map(|p| ("c", p.as_str(), &d)).collect();
        let started = std::time::Instant::now();
        search_docs(docs, "many rooms", &opts());
        assert!(started.elapsed().as_millis() < 200, "took {:?}", started.elapsed());
    }
```

- [ ] **Step 2: Run the tests and confirm they fail.**

  Run `cargo test search::`.

  Expected: FAIL to compile, because `search_docs`, `Filters` and `Scope` don't exist.

- [ ] **Step 3: Implement.** Add to the `use` lines at the top of `search.rs`:
```rust
use serde::{Deserialize, Serialize};
```
and add below `extract`:
```rust
pub const MAX_QUERY_CHARS: usize = 200;
pub const MAX_RESULTS: usize = 100;
const HITS_SHOWN: usize = 3;

/// Where to search, as the Search screen sends it.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Scope {
    All,
    Collection {
        #[serde(rename = "collectionId")]
        collection_id: String,
    },
    Document {
        #[serde(rename = "collectionId")]
        collection_id: String,
        path: String,
    },
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Filters {
    pub headings_only: bool,
    pub whole_words: bool,
    /// A top-level folder of the collection, or "" for all of it.
    pub folder: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hit {
    pub slug: String,
    pub heading: String,
    pub level: u8,
    pub snippet: String,
    pub heading_match: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub collection_id: String,
    pub path: String,
    pub title: String,
    pub title_match: bool,
    /// Every matching section; `hits` holds the best three.
    pub total: usize,
    pub hits: Vec<Hit>,
    #[serde(skip)]
    pub score: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
    /// True while a folder in scope is still being indexed, so results may be incomplete.
    pub indexing: bool,
}

fn is_word(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

/// Byte offset of `needle` in `hay` (both folded). "Whole words" wants no letter, digit or _ on either side.
fn find(hay: &str, needle: &str, whole: bool) -> Option<usize> {
    if needle.is_empty() {
        return None;
    }
    if !whole {
        return hay.find(needle);
    }
    hay.match_indices(needle).map(|(i, _)| i).find(|&i| {
        let before = hay[..i].chars().next_back().map_or(true, |c| !is_word(c));
        let after = hay[i + needle.len()..].chars().next().map_or(true, |c| !is_word(c));
        before && after
    })
}

/// About 200 characters of the section around the first matching word, cut at a space.
fn snippet(text: &str, text_f: &str, words: &[&str], whole: bool) -> String {
    let at_byte = words.iter().filter_map(|w| find(text_f, w, whole)).min().unwrap_or(0);
    let at = text_f[..at_byte].chars().count(); // folding keeps character positions
    let chars: Vec<char> = text.chars().collect();
    let mut start = at.saturating_sub(70);
    if start > 0 {
        start = chars[start..].iter().position(|c| *c == ' ').map_or(start, |i| start + i + 1).min(at);
    }
    let end = (start + 200).min(chars.len());
    let body: String = chars[start..end].iter().collect();
    format!("{}{body}{}", if start > 0 { "… " } else { "" }, if end < chars.len() { " …" } else { "" })
}

/// The prototype's searchDocs: a section matches on the phrase or on all its words; headings and titles rank first.
pub fn search_docs<'a>(
    docs: impl IntoIterator<Item = (&'a str, &'a str, &'a DocEntry)>,
    query: &str,
    filters: &Filters,
) -> Vec<SearchResult> {
    let folded: String = fold(query.trim()).chars().take(MAX_QUERY_CHARS).collect();
    let phrase = folded.trim();
    if phrase.is_empty() {
        return Vec::new();
    }
    let words: Vec<&str> = phrase.split_whitespace().collect();
    let whole = filters.whole_words;
    let has = |hay: &str, needle: &str| find(hay, needle, whole).is_some();
    let folder = format!("{}/", filters.folder);
    let mut results = Vec::new();
    for (collection_id, path, doc) in docs {
        if !filters.folder.is_empty() && !path.starts_with(&folder) {
            continue;
        }
        let mut hits: Vec<(u32, &Section, bool)> = Vec::new();
        for s in &doc.sections {
            let in_head = !s.heading.is_empty() && (has(&s.heading_f, phrase) || words.iter().all(|w| has(&s.heading_f, w)));
            let score = if filters.headings_only {
                if in_head { 10 } else { 0 }
            } else {
                let in_text = has(&s.text_f, phrase);
                let all_words = words.iter().all(|w| has(&s.text_f, w) || has(&s.heading_f, w));
                if in_head || in_text || all_words {
                    (if in_head { 10 } else { 0 }) + (if in_text { 5 } else { 1 })
                } else {
                    0
                }
            };
            if score > 0 {
                hits.push((score, s, in_head));
            }
        }
        let title_match = has(&doc.title_f, phrase);
        if hits.is_empty() && (filters.headings_only || !title_match) {
            continue;
        }
        hits.sort_by(|a, b| b.0.cmp(&a.0)); // stable: equal scores keep document order
        let best = hits.first().map_or(0, |h| h.0);
        let score = (if title_match { 20.0 } else { 0.0 }) + f64::from(best) + hits.len() as f64 * 0.1;
        let total = hits.len();
        let hits = hits
            .into_iter()
            .take(HITS_SHOWN)
            .map(|(_, s, in_head)| Hit {
                slug: s.slug.clone(),
                heading: s.heading.clone(),
                level: s.level,
                snippet: snippet(&s.text, &s.text_f, &words, whole),
                heading_match: in_head,
            })
            .collect();
        results.push(SearchResult {
            collection_id: collection_id.to_string(),
            path: path.to_string(),
            title: doc.title.clone(),
            title_match,
            total,
            hits,
            score,
        });
    }
    results.sort_by(|a, b| b.score.total_cmp(&a.score).then_with(|| a.title.cmp(&b.title)));
    results.truncate(MAX_RESULTS);
    results
}
```

- [ ] **Step 4: Run the tests and confirm they pass.**
  - Run `cargo test search::`. Expected: all pass (25 in `search::`), and 1 is ignored.
  - Then run `cargo test --release search_speed -- --ignored`. Expected: PASS. If it fails, report the time; don't change the limit.
- [ ] **Step 5: Commit.** `feat(core): rank search results by heading, phrase and title, with snippets`

---

### Task 3: Rust core: background indexer and changes on disk (`indexer.rs`)

**Files:**
- Create: `app/src-tauri/src/indexer.rs`
- Modify: `app/src-tauri/src/lib.rs` (add `pub mod indexer;`)
- Modify: `app/src-tauri/src/workspace.rs` (make `kind_of` public)

**Interfaces:**
- Consumes:
  - From Task 2: `search::{extract, search_docs, DocEntry, Filters, Scope, SearchResponse}`.
  - `workspace::{build_tree, kind_of, NodeKind, TreeNode}`.
  - `paths::resolve` and `reader::read_text`.
- Produces:
  - `CollectionIndex { docs: BTreeMap<String, DocEntry>, done: bool }`.
  - `IndexProgress`, `ChangeKind`, `Change`, `CollectionChanged` and `Notice { Progress, Changed, Unavailable(String) }`.
  - `type Emit = Arc<dyn Fn(Notice) + Send + Sync>`.
  - `document_paths(root) -> Result<Vec<String>, AppError>`.
  - `index_document(root, rel) -> Option<DocEntry>`.
  - `build(indexes, id, root, emit: &dyn Fn(Notice))`.
  - `apply_changes(index, root, changed: &[PathBuf]) -> Vec<Change>`.
  - `Indexer::{start(&self, id, root, emit) -> bool, forget(&self, id), search(&self, scope, query, filters) -> SearchResponse}`.

- [ ] **Step 1: Make the tree's file-kind rule public.** In `workspace.rs`, change `fn kind_of(name: &str)` to `pub fn kind_of(name: &str)` and add the doc comment `/// Document, image, or None for a file the tree doesn't show. Works on a name or a relative path.` In `lib.rs`, add `pub mod indexer;` after `pub mod errors;`.

- [ ] **Step 2: Write the failing tests.** Create `app/src-tauri/src/indexer.rs` containing this test module. Step 4 adds the code above it.
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, thread, time::Duration};

    fn folder() -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        fs::create_dir_all(d.path().join("Guides")).unwrap();
        fs::create_dir_all(d.path().join(".git")).unwrap();
        fs::write(d.path().join("README.md"), "# Welcome\nStart here.").unwrap();
        fs::write(d.path().join("Guides/Wifi.md"), "# Wi-Fi\nThe guest network.").unwrap();
        fs::write(d.path().join("Guides/map.png"), "png").unwrap();
        fs::write(d.path().join(".git/x.md"), "# hidden").unwrap();
        d
    }

    fn built(root: &Path) -> CollectionIndex {
        let map = Mutex::new(HashMap::from([("c".to_string(), CollectionIndex::default())]));
        build(&map, "c", root, &|_| {});
        map.into_inner().unwrap().remove("c").unwrap()
    }

    fn kinds(changes: &[Change]) -> Vec<(&str, ChangeKind)> {
        changes.iter().map(|c| (c.path.as_str(), c.kind)).collect()
    }

    pub(super) fn wait_until(mut ready: impl FnMut() -> bool) {
        for _ in 0..1000 {
            if ready() {
                return;
            }
            thread::sleep(Duration::from_millis(10));
        }
        panic!("timed out");
    }

    #[test]
    fn lists_documents_only() {
        let d = folder();
        assert_eq!(document_paths(d.path()).unwrap(), ["README.md", "Guides/Wifi.md"]);
    }

    #[test]
    fn reads_documents_only_through_the_path_guard() {
        let d = folder();
        assert_eq!(index_document(d.path(), "Guides/Wifi.md").unwrap().title, "Wi-Fi");
        assert!(index_document(d.path(), "../outside.md").is_none());
    }

    #[test]
    fn builds_the_index_and_reports_when_done() {
        let d = folder();
        let map = Mutex::new(HashMap::from([("c".to_string(), CollectionIndex::default())]));
        let seen = Mutex::new(Vec::new());
        build(&map, "c", d.path(), &|n| seen.lock().unwrap().push(n));
        let guard = map.lock().unwrap();
        assert!(guard["c"].done);
        assert_eq!(guard["c"].docs.keys().collect::<Vec<_>>(), ["Guides/Wifi.md", "README.md"]);
        let done = IndexProgress { collection_id: "c".into(), indexed: 2, total: 2, done: true };
        assert_eq!(seen.lock().unwrap().last(), Some(&Notice::Progress(done)));
    }

    #[test]
    fn a_forgotten_folder_stops_quietly() {
        let d = folder();
        let map = Mutex::new(HashMap::new());
        build(&map, "c", d.path(), &|_| {});
        assert!(map.lock().unwrap().is_empty());
    }

    #[test]
    fn starts_each_folder_once_and_searches_in_scope() {
        let d = folder();
        let ix = Indexer::default();
        assert!(ix.start("c", d.path(), Arc::new(|_| {})));
        assert!(!ix.start("c", d.path(), Arc::new(|_| {})));
        wait_until(|| ix.indexes.lock().unwrap()["c"].done);
        let f = Filters::default();
        assert_eq!(ix.search(&Scope::All, "guest", &f).results.len(), 1);
        assert!(!ix.search(&Scope::All, "guest", &f).indexing);
        assert!(ix.search(&Scope::Collection { collection_id: "other".into() }, "guest", &f).results.is_empty());
        let readme = Scope::Document { collection_id: "c".into(), path: "README.md".into() };
        assert!(ix.search(&readme, "guest", &f).results.is_empty());
        ix.forget("c");
        assert!(ix.search(&Scope::All, "guest", &f).results.is_empty());
    }

    #[test]
    fn reports_still_indexing() {
        let ix = Indexer::default();
        ix.indexes.lock().unwrap().insert("c".into(), CollectionIndex::default());
        assert!(ix.search(&Scope::All, "x", &Filters::default()).indexing);
    }

    #[test]
    fn changes_update_the_index() {
        let d = folder();
        let root = d.path();
        let mut ix = built(root);
        fs::write(root.join("README.md"), "# Welcome\nNew opening hours.").unwrap();
        fs::write(root.join("Guides/Print.md"), "# Printing").unwrap();
        fs::remove_file(root.join("Guides/Wifi.md")).unwrap();
        let changed = [root.join("README.md"), root.join("Guides/Print.md"), root.join("Guides/Wifi.md")];
        let changes = apply_changes(&mut ix, root, &changed);
        assert_eq!(
            kinds(&changes),
            [("Guides/Print.md", ChangeKind::Created), ("Guides/Wifi.md", ChangeKind::Removed), ("README.md", ChangeKind::Modified)]
        );
        assert!(ix.docs["README.md"].sections[0].text.contains("opening hours"));
    }

    #[test]
    fn a_removed_folder_removes_its_documents() {
        let d = folder();
        let mut ix = built(d.path());
        fs::remove_dir_all(d.path().join("Guides")).unwrap();
        let changes = apply_changes(&mut ix, d.path(), &[d.path().join("Guides")]);
        assert_eq!(kinds(&changes), [("Guides/Wifi.md", ChangeKind::Removed)]);
        assert!(!ix.docs.contains_key("Guides/Wifi.md"));
    }

    #[test]
    fn a_new_folder_brings_its_documents() {
        let d = folder();
        let mut ix = built(d.path());
        fs::create_dir_all(d.path().join("New")).unwrap();
        fs::write(d.path().join("New/a.md"), "# A").unwrap();
        let changes = apply_changes(&mut ix, d.path(), &[d.path().join("New")]);
        assert_eq!(kinds(&changes), [("New/a.md", ChangeKind::Created), ("New", ChangeKind::Created)]);
    }

    #[test]
    fn editor_save_through_a_temporary_file_is_one_change() {
        let d = folder();
        let mut ix = built(d.path());
        // Editors write "README.md.tmp" (or a hidden swap file), then rename it over the original.
        fs::write(d.path().join("README.md"), "# Welcome\nSaved.").unwrap();
        let changed = [d.path().join("README.md.tmp"), d.path().join(".README.md.swp"), d.path().join("README.md")];
        assert_eq!(kinds(&apply_changes(&mut ix, d.path(), &changed)), [("README.md", ChangeKind::Modified)]);
    }

    #[test]
    fn ignores_hidden_unknown_and_outside_paths() {
        let d = folder();
        let mut ix = built(d.path());
        fs::write(d.path().join("notes.csv"), "a,b").unwrap();
        let outside = tempfile::tempdir().unwrap();
        let changed = [d.path().join(".git/x.md"), d.path().join("notes.csv"), outside.path().join("a.md")];
        assert!(apply_changes(&mut ix, d.path(), &changed).is_empty());
    }

    #[test]
    fn a_changed_picture_is_reported_for_the_tree() {
        let d = folder();
        let mut ix = built(d.path());
        let changes = apply_changes(&mut ix, d.path(), &[d.path().join("Guides/map.png")]);
        assert_eq!(kinds(&changes), [("Guides/map.png", ChangeKind::Modified)]);
    }

    #[test]
    fn event_payloads_use_the_screens_names() {
        let p = IndexProgress { collection_id: "c".into(), indexed: 1, total: 2, done: false };
        assert_eq!(serde_json::to_value(p).unwrap(), serde_json::json!({ "collectionId": "c", "indexed": 1, "total": 2, "done": false }));
        let c = CollectionChanged { collection_id: "c".into(), changes: vec![Change { path: "a.md".into(), kind: ChangeKind::Removed }] };
        assert_eq!(
            serde_json::to_value(c).unwrap(),
            serde_json::json!({ "collectionId": "c", "changes": [{ "path": "a.md", "kind": "removed" }] })
        );
    }
}
```

- [ ] **Step 3: Run the tests and confirm they fail.**

  Run `cargo test indexer::`.

  Expected: FAIL to compile.

- [ ] **Step 4: Implement.** Put this above the test module:
```rust
//! Builds each folder's search index in the background and keeps it in step with changes on disk.
use crate::{
    errors::AppError,
    paths, reader,
    search::{self, DocEntry, Filters, Scope, SearchResponse},
    workspace::{self, NodeKind, TreeNode},
};
use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

#[derive(Debug, Default)]
pub struct CollectionIndex {
    pub docs: BTreeMap<String, DocEntry>,
    pub done: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexProgress {
    pub collection_id: String,
    pub indexed: usize,
    pub total: usize,
    pub done: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeKind {
    Created,
    Modified,
    Removed,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Change {
    pub path: String,
    pub kind: ChangeKind,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionChanged {
    pub collection_id: String,
    pub changes: Vec<Change>,
}

/// What the indexer tells the screens. The commands turn each one into a window event.
#[derive(Debug, Clone, PartialEq)]
pub enum Notice {
    Progress(IndexProgress),
    Changed(CollectionChanged),
    Unavailable(String),
}

pub type Emit = Arc<dyn Fn(Notice) + Send + Sync>;

const PROGRESS_EVERY: usize = 50;

/// Every document in the folder tree, in tree order (same limits as the tree).
pub fn document_paths(root: &Path) -> Result<Vec<String>, AppError> {
    fn collect(node: &TreeNode, out: &mut Vec<String>) {
        for c in &node.children {
            match c.kind {
                NodeKind::Folder => collect(c, out),
                NodeKind::Document => out.push(c.path.clone()),
                NodeKind::Image => {}
            }
        }
    }
    let tree = workspace::build_tree(root)?;
    let mut out = Vec::new();
    collect(&tree.root, &mut out);
    Ok(out)
}

/// Reads one document through the path guard. An unreadable, too large or binary file is left out.
pub fn index_document(root: &Path, rel: &str) -> Option<DocEntry> {
    let doc = reader::read_text(&paths::resolve(root, rel).ok()?).ok()?;
    Some(search::extract(&doc.text, rel))
}

/// Indexes every document of one folder, reporting progress. Runs on a background thread.
/// Each file is read outside the lock, so searches are never held up by the disk.
pub fn build(indexes: &Mutex<HashMap<String, CollectionIndex>>, id: &str, root: &Path, emit: &dyn Fn(Notice)) {
    let paths = document_paths(root).unwrap_or_default();
    let total = paths.len();
    let progress = |indexed: usize, done: bool| {
        emit(Notice::Progress(IndexProgress { collection_id: id.to_string(), indexed, total, done }))
    };
    for (i, rel) in paths.iter().enumerate() {
        let entry = index_document(root, rel);
        {
            let mut map = indexes.lock().unwrap();
            let Some(index) = map.get_mut(id) else { return }; // forgotten meanwhile
            if let Some(entry) = entry {
                index.docs.insert(rel.clone(), entry);
            }
        }
        if (i + 1) % PROGRESS_EVERY == 0 && i + 1 < total {
            progress(i + 1, false);
        }
    }
    match indexes.lock().unwrap().get_mut(id) {
        Some(index) => index.done = true,
        None => return,
    }
    progress(total, true);
}

/// A watcher path as a folder-relative path, or None when the tree wouldn't show it.
fn relative(root: &Path, path: &Path) -> Option<String> {
    let parts: Vec<String> = path
        .strip_prefix(root)
        .ok()?
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect();
    let hidden = parts.iter().any(|p| p.starts_with('.') || p == "node_modules");
    (!parts.is_empty() && !hidden).then(|| parts.join("/"))
}

fn upsert(index: &mut CollectionIndex, root: &Path, rel: &str, changes: &mut Vec<Change>) {
    let existed = index.docs.contains_key(rel);
    match index_document(root, rel) {
        Some(entry) => {
            index.docs.insert(rel.to_string(), entry);
        }
        None => {
            index.docs.remove(rel);
        }
    }
    let kind = if existed { ChangeKind::Modified } else { ChangeKind::Created };
    changes.push(Change { path: rel.to_string(), kind });
}

/// Brings the index up to date with one batch of changed paths and says what changed, for the screens.
/// A rename arrives as the old path (now missing) and the new one.
pub fn apply_changes(index: &mut CollectionIndex, root: &Path, changed: &[PathBuf]) -> Vec<Change> {
    let mut changes = Vec::new();
    let rels: BTreeSet<String> = changed.iter().filter_map(|p| relative(root, p)).collect();
    for rel in rels {
        let full = root.join(&rel);
        if full.is_dir() {
            // A folder appeared or was renamed into place: take in what it holds.
            for inner in document_paths(&full).unwrap_or_default() {
                upsert(index, root, &format!("{rel}/{inner}"), &mut changes);
            }
            changes.push(Change { path: rel, kind: ChangeKind::Created });
        } else if !full.exists() {
            let prefix = format!("{rel}/");
            let gone: Vec<String> = index.docs.keys().filter(|k| **k == rel || k.starts_with(&prefix)).cloned().collect();
            for path in &gone {
                index.docs.remove(path);
            }
            // ponytail: a removed folder holding only pictures sends nothing; the tree catches up on the next change.
            if gone.is_empty() && workspace::kind_of(&rel).is_some() {
                changes.push(Change { path: rel, kind: ChangeKind::Removed }); // a picture, or a document that couldn't be read
            }
            changes.extend(gone.into_iter().map(|path| Change { path, kind: ChangeKind::Removed }));
        } else {
            match workspace::kind_of(&rel) {
                Some(NodeKind::Document) => upsert(index, root, &rel, &mut changes),
                Some(_) => changes.push(Change { path: rel, kind: ChangeKind::Modified }), // a picture: the tree may change
                None => {} // not something Folio shows (temporary files, spreadsheets …)
            }
        }
    }
    changes
}

/// One search index per folder, filled in the background.
#[derive(Default)]
pub struct Indexer {
    indexes: Arc<Mutex<HashMap<String, CollectionIndex>>>,
}

impl Indexer {
    /// Starts indexing a folder on a background thread, once per folder. Returns false if it had already started.
    pub fn start(&self, id: &str, root: &Path, emit: Emit) -> bool {
        {
            let mut map = self.indexes.lock().unwrap();
            if map.contains_key(id) {
                return false;
            }
            map.insert(id.to_string(), CollectionIndex::default());
        }
        let (indexes, id, root) = (Arc::clone(&self.indexes), id.to_string(), root.to_path_buf());
        std::thread::spawn(move || build(&indexes, &id, &root, &*emit));
        true
    }

    /// Drops a folder's index, so opening it again indexes it afresh.
    pub fn forget(&self, id: &str) {
        self.indexes.lock().unwrap().remove(id);
    }

    pub fn search(&self, scope: &Scope, query: &str, filters: &Filters) -> SearchResponse {
        let map = self.indexes.lock().unwrap();
        let mut indexing = false;
        let mut docs: Vec<(&str, &str, &DocEntry)> = Vec::new();
        for (id, index) in map.iter() {
            let wanted = match scope {
                Scope::All => true,
                Scope::Collection { collection_id } | Scope::Document { collection_id, .. } => collection_id == id,
            };
            if !wanted {
                continue;
            }
            indexing |= !index.done;
            match scope {
                Scope::Document { path, .. } => {
                    docs.extend(index.docs.get_key_value(path.as_str()).map(|(p, d)| (id.as_str(), p.as_str(), d)))
                }
                _ => docs.extend(index.docs.iter().map(|(p, d)| (id.as_str(), p.as_str(), d))),
            }
        }
        SearchResponse { results: search::search_docs(docs, query, filters), indexing }
    }
}
```

- [ ] **Step 5: Run the tests and confirm they pass.** Run `cargo test indexer::`. Expected: 13 passed. Run `npm run check:readonly` in `app/`. Expected: pass, because test modules are skipped.
- [ ] **Step 6: Commit.** `feat(core): index folders in the background and apply changes from disk`

---

### Task 4: Rust core: file watcher, events and the `search` command

**Files:**
- Modify: `app/src-tauri/Cargo.toml`
- Modify: `app/src-tauri/src/indexer.rs`
- Modify: `app/src-tauri/src/state.rs`
- Modify: `app/src-tauri/src/commands.rs`
- Modify: `app/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: Task 3's `Indexer`, `apply_changes`, `Notice` and `Emit`.
- Produces:
  - `Indexer::ensure(&self, id, root, emit)`, which starts indexing and watching once.
  - `AppState.indexer`.
  - `commands::emitter(&AppHandle) -> Emit`.
  - The command `search(query: String, scope: Scope, filters: Filters) -> SearchResponse`.
  - `get_tree`, which now also starts indexing and watching.
  - The window events `index-progress`, `collection-changed` and `collection-unavailable`.

- [ ] **Step 1: Add the dependency.** In `Cargo.toml` under `[dependencies]`, add `notify-debouncer-mini = "0.4"`.

- [ ] **Step 2: Write the failing test.** Append inside `mod tests` in `indexer.rs`:
```rust
    #[test]
    fn watching_reports_a_saved_document() {
        let d = folder();
        let root = dunce::canonicalize(d.path()).unwrap();
        let seen: Arc<Mutex<Vec<Notice>>> = Arc::default();
        let sink = Arc::clone(&seen);
        let ix = Indexer::default();
        ix.ensure("c", &root, Arc::new(move |n| sink.lock().unwrap().push(n)));
        wait_until(|| ix.indexes.lock().unwrap().get("c").is_some_and(|i| i.done));
        fs::write(root.join("Guides/Wifi.md"), "# Wi-Fi\nNew password.").unwrap();
        wait_until(|| {
            seen.lock().unwrap().iter().any(|n| matches!(n, Notice::Changed(c) if c.changes.iter().any(|ch| ch.path == "Guides/Wifi.md")))
        });
        assert_eq!(ix.search(&Scope::All, "new password", &Filters::default()).results.len(), 1);
    }
```
Run `cargo test indexer::`. Expected: FAIL to compile, because `ensure` doesn't exist.

- [ ] **Step 3: Implement watching.** In `indexer.rs`:
  - Add the imports:
    ```rust
    use notify_debouncer_mini::{new_debouncer, notify::{RecommendedWatcher, RecursiveMode}, DebounceEventResult, Debouncer};
    use std::time::Duration;
    ```
  - Add the field `watchers: Mutex<HashMap<String, Debouncer<RecommendedWatcher>>>,` to `Indexer`. `#[derive(Default)]` still works.
  - If the compiler says `Debouncer<RecommendedWatcher>` isn't `Send` (so `AppState` can't be managed), stop and report BLOCKED. Don't add `unsafe impl`.
  - Add these methods inside `impl Indexer`:
```rust
    /// Opening a folder: index it once and watch it for changes.
    pub fn ensure(&self, id: &str, root: &Path, emit: Emit) {
        if self.start(id, root, Arc::clone(&emit)) {
            self.watch(id, root, emit);
        }
    }

    fn watch(&self, id: &str, root: &Path, emit: Emit) {
        // Watchers report canonical paths (macOS gives /private/var for /var), so compare against the canonical root.
        let watched = dunce::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
        let (indexes, cid, base) = (Arc::clone(&self.indexes), id.to_string(), watched.clone());
        let handler = move |res: DebounceEventResult| {
            if !base.is_dir() {
                // Unplugged, renamed or deleted. Report it once; opening it again starts afresh.
                if indexes.lock().unwrap().remove(&cid).is_some() {
                    emit(Notice::Unavailable(cid.clone()));
                }
                return;
            }
            let Ok(events) = res else { return };
            let paths: Vec<PathBuf> = events.into_iter().map(|e| e.path).collect();
            // ponytail: changed files are read while the index is locked; a search waits for one batch at most.
            let changes = match indexes.lock().unwrap().get_mut(&cid) {
                Some(index) => apply_changes(index, &base, &paths),
                None => return,
            };
            if !changes.is_empty() {
                emit(Notice::Changed(CollectionChanged { collection_id: cid.clone(), changes }));
            }
        };
        let watcher = new_debouncer(Duration::from_millis(300), handler)
            .and_then(|mut d| d.watcher().watch(&watched, RecursiveMode::Recursive).map(|()| d));
        match watcher {
            // Replacing an earlier watcher (a folder that came back) drops it.
            Ok(d) => {
                self.watchers.lock().unwrap().insert(id.to_string(), d);
            }
            Err(e) => eprintln!("Folio: live reload is off for {}: {e}", watched.display()),
        }
    }
```
  - Change `forget` to drop the watcher as well:
```rust
    pub fn forget(&self, id: &str) {
        self.indexes.lock().unwrap().remove(id);
        self.watchers.lock().unwrap().remove(id);
    }
```

- [ ] **Step 4: Give the state an indexer.** In `state.rs`, import `crate::indexer::Indexer`, add the field `pub indexer: Indexer,` to `AppState` with the doc comment `/// Search indexes and folder watchers, one per opened folder.`, and add `indexer: Indexer::default(),` in `AppState::new`.

- [ ] **Step 5: Add the events and commands.** In `commands.rs`:
  - Add the imports:
    ```rust
    use crate::{indexer::{Emit, Notice}, search::{Filters, Scope, SearchResponse}};
    use std::sync::Arc;
    use tauri::Emitter;
    ```
  - Replace `get_tree`, and add `emitter` and `search`:
```rust
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
            eprintln!("Folio: event not delivered: {e}");
        }
    })
}

/// Opening a folder's tree also starts its search index and live reload (once).
#[tauri::command(async)]
pub fn get_tree(app: AppHandle, state: State<'_, AppState>, collection_id: String) -> Result<Tree, AppError> {
    let root = state.root_of(&collection_id)?;
    let tree = workspace::build_tree(&root)?;
    state.indexer.ensure(&collection_id, &root, emitter(&app));
    Ok(tree)
}

#[tauri::command(async)]
pub fn search(app: AppHandle, state: State<'_, AppState>, query: String, scope: Scope, filters: Filters) -> Result<SearchResponse, AppError> {
    let ids: Vec<String> = match &scope {
        Scope::All => state.collections.lock().unwrap().iter().map(|c| c.id.clone()).collect(),
        Scope::Collection { collection_id } | Scope::Document { collection_id, .. } => vec![collection_id.clone()],
    };
    // "Everywhere" includes folders not opened yet in this run: index them now.
    for id in ids {
        if let Ok(root) = state.root_of(&id) {
            if root.is_dir() {
                state.indexer.ensure(&id, &root, emitter(&app));
            }
        }
    }
    Ok(state.indexer.search(&scope, &query, &filters))
}
```
  - In `lib.rs`, add `commands::search,` to `generate_handler!`.

- [ ] **Step 6: Run everything and confirm it passes.**
  - Run `cargo test`. Expected: all pass, including `watching_reports_a_saved_document` within its 10-second wait.
  - Run `npm run check:readonly` in `app/`. Expected: pass.
  - Run `cargo build`. Expected: no warnings from Folio's code.
- [ ] **Step 7: Commit.** `feat(core): watch opened folders and add the search command and events`

---

### Task 5: Bridge and library data (`lib/core.ts`, `lib/library.ts`)

**Files:**
- Modify: `app/src/lib/core.ts` and `app/src/lib/core.test.ts`
- Modify: `app/src/lib/library.ts` and `app/src/lib/library.test.ts`

**Interfaces:**
- Consumes: Task 4's command and events.
- Produces:
  - In `core.ts`:
    - Types: `SearchHit`, `SearchResult`, `SearchResponse`, `SearchScope`, `SearchFilters`, `IndexProgress`, `Change` and `CollectionChanged`.
    - `core.search(query, scope, filters)`.
    - `core.onIndexProgress(cb)`, `core.onCollectionChanged(cb)` and `core.onCollectionUnavailable(cb)`. Each returns `Promise<() => void>`.
  - In `library.ts`:
    - Types: `Bookmark` and `SearchEntry`. `LibraryData` gains `bookmarks` and `searches`.
    - `MAX_SEARCHES = 15` and `bookmarkId(key, slug)`.
    - `toggleBookmark(lib, key, slug, heading, now?) -> boolean`.
    - `addSearch(lib, q, now?)`.
    - `ListKind = 'recent' | 'favorites' | 'bookmarks' | 'history'`, with `removeFromList(lib, kind, id)` and `clearList(lib, kind: 'recent' | 'bookmarks' | 'history')`.
    - `LibraryTab`, `LibrarySort` and `LibraryRow`, with `libraryRows(lib, tab, known)` and `arrangeRows(rows, filter, sort, location)`.

- [ ] **Step 1: Write the failing tests.**

  **`core.test.ts`.**
  - Change the vitest import to `import { describe, expect, it, vi, type Mock } from 'vitest';`.
  - Add `core` to the import from `./core`.
  - Add `import { invoke } from '@tauri-apps/api/core';` and `import { listen } from '@tauri-apps/api/event';`.
  - Add these mocks below the imports:
```ts
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue({ results: [], indexing: false }) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
```
  - Append:
```ts
describe('core search and events', () => {
  it('sends the query, scope and filters under the names the core expects', async () => {
    const scope = { kind: 'collection', collectionId: 'c1' } as const;
    const filters = { headingsOnly: false, wholeWords: true, folder: 'Guides' };
    await core.search('wifi', scope, filters);
    expect(invoke).toHaveBeenCalledWith('search', { query: 'wifi', scope, filters });
  });

  it('hands event payloads to the listener', async () => {
    const cb = vi.fn();
    await core.onCollectionUnavailable(cb);
    const [name, handler] = (listen as Mock).mock.calls.at(-1)!;
    expect(name).toBe('collection-unavailable');
    handler({ payload: { collectionId: 'c1' } });
    expect(cb).toHaveBeenCalledWith('c1');
  });
});
```

  **`library.test.ts`.**
  - Bookmarks are now owned. In the test `keeps unknown keys and leaves collections to the core`, replace `bookmarks: [{ id: 'b1' }]` with `allowedImageSites: ['example.org']`, and the expectation with `expect(raw.allowedImageSites).toEqual(['example.org']);`.
  - Add the new functions to the import from `./library`.
  - Append inside the `describe`:
```ts
  it('reads bookmarks and searches, dropping bad and repeated entries', () => {
    const lib = parseLibrary({
      bookmarks: [
        { id: 'b1', key: 'sample/a.md', slug: 'x', heading: 'X', at: 1 },
        { id: 'b1', key: 'sample/a.md', slug: 'x', heading: 'X', at: 2 },
        { id: 'b2', key: 3 },
      ],
      searches: [{ q: 'Wi-Fi', at: 2 }, { q: 'wi-fi', at: 1 }, { q: '  ', at: 1 }, { q: 'x', at: NaN }],
    });
    expect(lib.bookmarks.map((b) => b.at)).toEqual([1]);
    expect(lib.searches).toEqual([{ q: 'Wi-Fi', at: 2 }]);
    expect(lib.extra).not.toHaveProperty('bookmarks');
    expect(toRaw(lib).searches).toEqual([{ q: 'Wi-Fi', at: 2 }]);
  });

  it('toggles a bookmark per section', () => {
    const lib = parseLibrary({});
    expect(toggleBookmark(lib, 'sample/a.md', 'setup', 'Setup', 5)).toBe(true);
    expect(toggleBookmark(lib, 'sample/a.md', '', 'a', 6)).toBe(true);
    expect(lib.bookmarks[1]).toEqual({ id: bookmarkId('sample/a.md', 'setup'), key: 'sample/a.md', slug: 'setup', heading: 'Setup', at: 5 });
    expect(toggleBookmark(lib, 'sample/a.md', 'setup', 'Setup')).toBe(false);
    expect(lib.bookmarks.map((b) => b.slug)).toEqual(['']);
  });

  it('remembers searches newest first, once each, capped', () => {
    const lib = parseLibrary({});
    addSearch(lib, ' Wi-Fi ', 1);
    addSearch(lib, '   ', 2);
    addSearch(lib, 'wi-fi', 3);
    expect(lib.searches).toEqual([{ q: 'wi-fi', at: 3 }]);
    for (let i = 0; i < 20; i++) addSearch(lib, `q${i}`, 10 + i);
    expect(lib.searches).toHaveLength(MAX_SEARCHES);
    expect(lib.searches[0].q).toBe('q19');
  });

  it('removes one item or clears a list', () => {
    const lib = parseLibrary({ favorites: ['sample/a.md'], recent: [{ key: 'sample/a.md', at: 1 }], searches: [{ q: 'x', at: 1 }] });
    toggleBookmark(lib, 'sample/a.md', '', 'a');
    removeFromList(lib, 'favorites', 'sample/a.md');
    removeFromList(lib, 'bookmarks', bookmarkId('sample/a.md', ''));
    removeFromList(lib, 'history', 'x');
    expect([lib.favorites, lib.bookmarks, lib.searches]).toEqual([[], [], []]);
    clearList(lib, 'recent');
    expect(lib.recent).toEqual([]);
  });

  it('lists library rows for each tab, skipping unavailable folders', () => {
    const lib = parseLibrary({
      recent: [{ key: 'sample/Guides/Wi-Fi.md', at: 9 }, { key: 'gone/x.md', at: 8 }],
      favorites: ['sample/README.md'],
      progress: { 'sample/Guides/Wi-Fi.md': 40 },
    });
    toggleBookmark(lib, 'sample/README.md', 'setup', 'Setup', 7);
    const known = (k: string) => k.startsWith('sample/');
    expect(libraryRows(lib, 'recent', known)).toEqual([
      { id: 'sample/Guides/Wi-Fi.md', key: 'sample/Guides/Wi-Fi.md', slug: null, heading: null, title: 'Wi Fi', progress: 40, when: 9 },
    ]);
    expect(libraryRows(lib, 'favorites', known)[0]).toMatchObject({ key: 'sample/README.md', when: null });
    expect(libraryRows(lib, 'bookmarks', known)[0]).toMatchObject({ slug: 'setup', heading: 'Setup', when: 7 });
    expect(libraryRows(lib, 'progress', known)[0]).toMatchObject({ key: 'sample/Guides/Wi-Fi.md', when: 9 });
  });

  it('filters and sorts rows, keeping undated rows in list order', () => {
    const row = (key: string, progress: number, when: number | null): LibraryRow =>
      ({ id: key, key, slug: null, heading: null, title: key, progress, when });
    const rows = [row('b', 10, null), row('a', 50, 2), row('c', 0, null), row('d', 5, 9)];
    const loc = (k: string) => `Folder › ${k}`;
    expect(arrangeRows(rows, '', 'recent', loc).map((r) => r.key)).toEqual(['d', 'a', 'b', 'c']);
    expect(arrangeRows(rows, '', 'title', loc).map((r) => r.key)).toEqual(['a', 'b', 'c', 'd']);
    expect(arrangeRows(rows, '', 'progress', loc).map((r) => r.key)).toEqual(['a', 'b', 'd', 'c']);
    expect(arrangeRows(rows, 'FOLDER › C', 'title', loc).map((r) => r.key)).toEqual(['c']);
  });
```

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx vitest run src/lib/core.test.ts src/lib/library.test.ts`. Expected: FAIL, because the new functions don't exist.

- [ ] **Step 3: Implement `core.ts`.** Add `import { listen } from '@tauri-apps/api/event';`. After `OpenedFile`, add:
```ts
export interface SearchHit { slug: string; heading: string; level: number; snippet: string; headingMatch: boolean }
export interface SearchResult { collectionId: string; path: string; title: string; titleMatch: boolean; total: number; hits: SearchHit[] }
export interface SearchResponse { results: SearchResult[]; indexing: boolean }
export type SearchScope =
  | { kind: 'all' }
  | { kind: 'collection'; collectionId: string }
  | { kind: 'document'; collectionId: string; path: string };
export interface SearchFilters { headingsOnly: boolean; wholeWords: boolean; folder: string }
export interface IndexProgress { collectionId: string; indexed: number; total: number; done: boolean }
export interface Change { path: string; kind: 'created' | 'modified' | 'removed' }
export interface CollectionChanged { collectionId: string; changes: Change[] }
```
and add to the `core` object:
```ts
  search: (query: string, scope: SearchScope, filters: SearchFilters) => invoke<SearchResponse>('search', { query, scope, filters }),
  onIndexProgress: (cb: (p: IndexProgress) => void) => listen<IndexProgress>('index-progress', (e) => cb(e.payload)),
  onCollectionChanged: (cb: (c: CollectionChanged) => void) => listen<CollectionChanged>('collection-changed', (e) => cb(e.payload)),
  onCollectionUnavailable: (cb: (collectionId: string) => void) =>
    listen<{ collectionId: string }>('collection-unavailable', (e) => cb(e.payload.collectionId)),
```

- [ ] **Step 4: Implement `library.ts`.** Make these changes:
  1. Add `import { friendlyName } from './markdown/slug';` at the top.
  2. After `RecentEntry`, add:
     ```ts
     /** A section saved to come back to. `slug` is '' for the top of the document. */
     export interface Bookmark { id: string; key: string; slug: string; heading: string; at: number }
     export interface SearchEntry { q: string; at: number }
     ```
  3. Add `bookmarks: Bookmark[];` and `searches: SearchEntry[];` to `LibraryData`.
  4. Add `export const MAX_SEARCHES = 15;` and add `'bookmarks', 'searches'` to `OWNED`.
  5. Add these guards next to `isRecent`:
```ts
const isBookmark = (v: unknown): v is Bookmark => {
  const b = v as Bookmark;
  return !!b && typeof b === 'object' && typeof b.id === 'string' && typeof b.key === 'string'
    && typeof b.slug === 'string' && typeof b.heading === 'string' && Number.isFinite(b.at);
};

const isSearch = (v: unknown): v is SearchEntry => {
  const s = v as SearchEntry;
  return !!s && typeof s === 'object' && typeof s.q === 'string' && !!s.q.trim() && Number.isFinite(s.at);
};
```
  6. In `parseLibrary`'s returned object, add:
```ts
    bookmarks: uniqueBy(Array.isArray(raw.bookmarks) ? raw.bookmarks.filter(isBookmark) : [], (b) => b.id),
    searches: uniqueBy(Array.isArray(raw.searches) ? raw.searches.filter(isSearch) : [], (s) => s.q.toLowerCase()).slice(0, MAX_SEARCHES),
```
  7. Append to the end of the file:
```ts
export const bookmarkId = (key: string, slug: string) => `${key}#${slug}`;

/** Adds or removes the bookmark for one section. Returns true when it was added. */
export function toggleBookmark(lib: LibraryData, key: string, slug: string, heading: string, now = Date.now()): boolean {
  const same = (b: Bookmark) => b.key === key && b.slug === slug;
  const on = lib.bookmarks.some(same);
  lib.bookmarks = on ? lib.bookmarks.filter((b) => !same(b)) : [{ id: bookmarkId(key, slug), key, slug, heading, at: now }, ...lib.bookmarks];
  return !on;
}

export function addSearch(lib: LibraryData, q: string, now = Date.now()): void {
  const text = q.trim();
  if (!text) return;
  lib.searches = [{ q: text, at: now }, ...lib.searches.filter((s) => s.q.toLowerCase() !== text.toLowerCase())].slice(0, MAX_SEARCHES);
}

export type ListKind = 'recent' | 'favorites' | 'bookmarks' | 'history';

/** Removes one entry from a Library list. `id` is a document key, a bookmark id, or the search text. */
export function removeFromList(lib: LibraryData, kind: ListKind, id: string): void {
  if (kind === 'recent') lib.recent = lib.recent.filter((r) => r.key !== id);
  else if (kind === 'favorites') lib.favorites = lib.favorites.filter((k) => k !== id);
  else if (kind === 'bookmarks') lib.bookmarks = lib.bookmarks.filter((b) => b.id !== id);
  else lib.searches = lib.searches.filter((s) => s.q !== id);
}

export function clearList(lib: LibraryData, kind: 'recent' | 'bookmarks' | 'history'): void {
  if (kind === 'recent') lib.recent = [];
  else if (kind === 'bookmarks') lib.bookmarks = [];
  else lib.searches = [];
}

export type LibraryTab = 'recent' | 'favorites' | 'bookmarks' | 'progress';
export type LibrarySort = 'recent' | 'title' | 'location' | 'progress';
export interface LibraryRow { id: string; key: string; slug: string | null; heading: string | null; title: string; progress: number; when: number | null }

/** The rows of one Library tab. `when` is when it was opened (or bookmarked); favorites keep their own order. */
export function libraryRows(lib: LibraryData, tab: LibraryTab, known: (key: string) => boolean): LibraryRow[] {
  const row = (key: string, id: string, when: number | null, b?: Bookmark): LibraryRow => ({
    id, key, slug: b ? b.slug : null, heading: b ? b.heading : null,
    title: friendlyName(parseKey(key).path), progress: lib.progress[key] ?? 0, when,
  });
  const opened = (key: string) => lib.recent.find((r) => r.key === key)?.at ?? null;
  if (tab === 'recent') return lib.recent.filter((r) => known(r.key)).map((r) => row(r.key, r.key, r.at));
  if (tab === 'favorites') return lib.favorites.filter(known).map((k) => row(k, k, null));
  if (tab === 'bookmarks') return lib.bookmarks.filter((b) => known(b.key)).map((b) => row(b.key, b.id, b.at, b));
  return Object.keys(lib.progress).filter(known).map((k) => row(k, k, opened(k)));
}

/** Filters by title, section and location, then sorts. "Most recent" keeps undated rows in list order, last. */
export function arrangeRows(rows: LibraryRow[], filter: string, sort: LibrarySort, location: (key: string) => string): LibraryRow[] {
  const q = filter.trim().toLowerCase();
  const kept = q ? rows.filter((r) => `${r.title} ${r.heading ?? ''} ${location(r.key)}`.toLowerCase().includes(q)) : rows;
  const by: Record<LibrarySort, (a: LibraryRow, b: LibraryRow) => number> = {
    recent: (a, b) => (b.when ?? -Infinity) - (a.when ?? -Infinity),
    title: (a, b) => (a.heading ?? a.title).localeCompare(b.heading ?? b.title),
    location: (a, b) => location(a.key).localeCompare(location(b.key)),
    progress: (a, b) => b.progress - a.progress,
  };
  return [...kept].sort(by[sort]);
}
```
  Two undated rows compare as `NaN`, which `Array.prototype.sort` treats as equal, so list order holds.

- [ ] **Step 5: Run the tests and confirm they pass.** Run `npx vitest run src/lib/core.test.ts src/lib/library.test.ts`. Expected: all pass. Run `npx tsc --noEmit -p .`. Expected: clean. The fake bridge in `state/app.test.ts` is a type assertion, so it doesn't need the new functions until Task 8 uses them.
- [ ] **Step 6: Commit.** `feat(app): add the search bridge, core events, bookmarks and search history`

---

### Task 6: Search, find and details helpers (`lib/search.ts`, `lib/find.ts`, `lib/details.ts`, `lib/format.ts`)

**Files:**
- Create: `app/src/lib/search.ts`, `app/src/lib/find.ts`, `app/src/lib/details.ts`, `app/src/lib/format.ts`
- Create: `app/src/lib/search.test.ts`, `app/src/lib/find.test.ts`, `app/src/lib/details.test.ts`, `app/src/lib/format.test.ts`

**Interfaces:**
- Consumes:
  - From Task 5: `SearchResult` and `docKey`.
  - `renderDocument`, used in the details test.
- Produces:
  - `matcher(q, wholeWords, words?) -> RegExp | null`.
  - `highlight(text, q, wholeWords) -> Segment[]`.
  - `Suggestion`, and `suggestionsFrom(results, collectionName, max?)`.
  - `clearMarks(root)`, `markMatches(root, q, wholeWords) -> HTMLElement[]` and `firstMatchAfter(marks, root, slug) -> number`.
  - `DocumentDetails`, and `describeDocument(article, text, frontmatter)`.
  - `formatSize(bytes)`, `timeAgo(at, now?)` and `formatDate(at)`.

- [ ] **Step 1: Write the failing tests.**

  `app/src/lib/search.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { SearchResult } from './core';
import { highlight, matcher, suggestionsFrom } from './search';

describe('matcher', () => {
  it('escapes regular-expression characters', () => {
    expect('Price: C++ (beta) $5'.match(matcher('c++ (beta)', false)!)).toEqual(['C++ (beta)']);
    expect('Costs $5.'.match(matcher('$5', false)!)).toEqual(['$5']);
  });

  it('respects whole words, accented letters included', () => {
    expect('café caf'.match(matcher('caf', true)!)).toEqual(['caf']);
  });

  it('returns null for a blank query', () => {
    expect(matcher('   ', false)).toBeNull();
  });
});

describe('highlight', () => {
  it('splits text into plain and matching parts, any word, any case', () => {
    expect(highlight('Wi-Fi and the guest network', 'GUEST wi-fi', false)).toEqual([
      { text: 'Wi-Fi', hit: true }, { text: ' and the ', hit: false }, { text: 'guest', hit: true }, { text: ' network', hit: false },
    ]);
  });

  it('matches accented and non-Latin text', () => {
    expect(highlight('Le CAFÉ ouvre. Привет мир', 'café привет', false).filter((s) => s.hit).map((s) => s.text)).toEqual(['CAFÉ', 'Привет']);
  });

  it('leaves text alone for a blank query', () => {
    expect(highlight('abc', ' ', false)).toEqual([{ text: 'abc', hit: false }]);
  });
});

describe('suggestionsFrom', () => {
  const result = (path: string, title: string, titleMatch: boolean, hits: SearchResult['hits'] = []): SearchResult =>
    ({ collectionId: 'sample', path, title, titleMatch, total: hits.length, hits });

  it('lists matching titles, then matching sections, up to the limit', () => {
    const hit = (slug: string, level: number, headingMatch: boolean) => ({ slug, heading: slug, level, snippet: '', headingMatch });
    const results = [
      result('a.md', 'Wi-Fi', true, [hit('wi-fi', 1, true)]),
      result('b.md', 'Network', false, [hit('wi-fi-setup', 2, true), hit('intro', 2, false)]),
    ];
    const out = suggestionsFrom(results, () => 'Sample library');
    expect(out).toEqual([
      { key: 'sample/a.md', slug: null, label: 'Wi-Fi', sub: 'Sample library › a.md', icon: 'file' },
      { key: 'sample/b.md', slug: 'wi-fi-setup', label: 'wi-fi-setup', sub: 'Section in Network', icon: 'hash' },
    ]);
    expect(suggestionsFrom(results, () => '', 1)).toHaveLength(1);
  });
});
```

  `app/src/lib/find.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { clearMarks, firstMatchAfter, markMatches } from './find';

function article(html: string): HTMLElement {
  const el = document.createElement('article');
  el.innerHTML = html;
  return el;
}

describe('find in document', () => {
  it('marks every match and leaves buttons, diagrams and hidden text alone', () => {
    const a = article('<h2 data-slug="wifi">Wi-Fi</h2><p>The wi-fi is free. WI-FI again.</p><button>wi-fi</button><div class="diagram">wi-fi</div><span class="vh">wi-fi</span>');
    const marks = markMatches(a, 'wi-fi', false);
    expect(marks.map((m) => m.textContent)).toEqual(['Wi-Fi', 'wi-fi', 'WI-FI']);
    expect(a.querySelector('button')!.innerHTML).toBe('wi-fi');
  });

  it('falls back to single words when the phrase is not there', () => {
    expect(markMatches(article('<p>guest network and the printer</p>'), 'printer guest', false).map((m) => m.textContent)).toEqual(['guest', 'printer']);
  });

  it('clears its marks and restores the text exactly', () => {
    const a = article('<p>one two one</p>');
    markMatches(a, 'one', false);
    clearMarks(a);
    expect(a.innerHTML).toBe('<p>one two one</p>');
    expect(a.querySelector('p')!.childNodes).toHaveLength(1);
  });

  it('starts at the first match after the section heading', () => {
    const a = article('<p>lamp</p><a data-slug="setup">lamp link</a><h2 data-slug="setup">Setup</h2><p>lamp here</p>');
    const marks = markMatches(a, 'lamp', false);
    expect(firstMatchAfter(marks, a, 'setup')).toBe(2);
    expect(firstMatchAfter(marks, a, 'missing')).toBe(0);
    expect(firstMatchAfter(marks, a, null)).toBe(0);
  });
});
```

  `app/src/lib/details.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { describeDocument } from './details';
import { renderDocument } from './markdown/render';

describe('describeDocument', () => {
  it('counts sections, links and pictures, and lists broken links once', () => {
    const text = [
      '---', 'title: Guide', 'tags: [a, b]', '---',
      '# Guide', '## One', '## Two', '[[Missing]] [[Missing]] [[Other]] [web](https://example.org)',
      '![local](pic.png) ![remote](https://example.org/x.png) ![gone](nope.png)',
    ].join('\n');
    const files = ['Guide.md', 'Other.md', 'pic.png'];
    const r = renderDocument(text, { collectionId: 'c', path: 'Guide.md', files, assetUrl: (c, p) => `folio://localhost/${c}/${p}` });
    expect(describeDocument(r.article, text, r.frontmatter)).toEqual({
      words: text.match(/\S+/g)!.length,
      sections: 2,
      pageLinks: 1,
      webLinks: 1,
      broken: ['Missing'],
      localPictures: 2,
      remotePictures: 1,
      written: [['title', 'Guide'], ['tags', 'a, b']],
    });
  });
});
```

  `app/src/lib/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatSize, timeAgo } from './format';

describe('format', () => {
  it('formats file sizes', () => {
    expect([formatSize(1), formatSize(900), formatSize(2048), formatSize(5.5 * 1024 * 1024)]).toEqual(['1 byte', '900 bytes', '2 KB', '5.5 MB']);
  });

  it('says how long ago', () => {
    const now = 10 * 86_400_000;
    expect([timeAgo(now - 5_000, now), timeAgo(now - 5 * 60_000, now), timeAgo(now - 3 * 3_600_000, now), timeAgo(now - 86_400_000, now), timeAgo(now - 2 * 86_400_000, now)])
      .toEqual(['just now', '5 min ago', '3 h ago', '1 day ago', '2 days ago']);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx vitest run src/lib/search.test.ts src/lib/find.test.ts src/lib/details.test.ts src/lib/format.test.ts`. Expected: FAIL, because the modules don't exist.

- [ ] **Step 3: Implement.**

  `app/src/lib/search.ts`:
```ts
import type { SearchResult } from './core';
import { docKey } from './library';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WORD = '[\\p{L}\\p{N}_]';

/** Matches a query as the core's search does: ignoring case, optionally whole words. `words` matches any single word. */
export function matcher(q: string, wholeWords: boolean, words = false): RegExp | null {
  const parts = words ? q.trim().split(/\s+/).filter(Boolean) : [q.trim()];
  if (!parts[0]) return null;
  const wrap = (p: string) => (wholeWords ? `(?<!${WORD})${escape(p)}(?!${WORD})` : escape(p));
  return new RegExp(parts.map(wrap).join('|'), 'giu');
}

export interface Segment { text: string; hit: boolean }

/** Splits text into plain and matching parts, for rendering with <mark> (never as HTML). */
export function highlight(text: string, q: string, wholeWords: boolean): Segment[] {
  const re = matcher(q, wholeWords, true);
  if (!re) return [{ text, hit: false }];
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), hit: false });
    out.push({ text: m[0], hit: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out;
}

export interface Suggestion { key: string; slug: string | null; label: string; sub: string; icon: 'file' | 'hash' }

/** The search box's list: documents whose title matches, then sections whose heading matches. */
export function suggestionsFrom(results: SearchResult[], collectionName: (id: string) => string, max = 6): Suggestion[] {
  const docs = results.filter((r) => r.titleMatch).map((r): Suggestion => ({
    key: docKey(r.collectionId, r.path), slug: null, label: r.title, sub: `${collectionName(r.collectionId)} › ${r.path}`, icon: 'file',
  }));
  const sections = results.flatMap((r) => r.hits.filter((h) => h.headingMatch && h.level >= 2).map((h): Suggestion => ({
    key: docKey(r.collectionId, r.path), slug: h.slug, label: h.heading, sub: `Section in ${r.title}`, icon: 'hash',
  })));
  return [...docs, ...sections].slice(0, max);
}
```

  `app/src/lib/find.ts`:
```ts
import { matcher } from './search';

// Text the reader doesn't read as prose: drawn diagrams, formulas, controls and screen-reader-only notes.
const SKIP = 'svg, math, .katex, .diagram, button, .vh, .doc-meta';

/** Removes find highlights, leaving the text as it was. */
export function clearMarks(root: HTMLElement): void {
  for (const mark of [...root.querySelectorAll('mark.hit')]) {
    const parent = mark.parentNode!;
    parent.replaceChild(root.ownerDocument.createTextNode(mark.textContent ?? ''), mark);
    parent.normalize();
  }
}

function markText(root: HTMLElement, re: RegExp): HTMLElement[] {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(SKIP) || !n.nodeValue?.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  const marks: HTMLElement[] = [];
  for (const node of nodes) {
    const text = node.nodeValue ?? '';
    const found = [...text.matchAll(re)];
    if (!found.length) continue;
    const frag = doc.createDocumentFragment();
    let last = 0;
    for (const m of found) {
      frag.append(text.slice(last, m.index));
      const mark = doc.createElement('mark');
      mark.className = 'hit';
      mark.textContent = m[0];
      frag.append(mark);
      marks.push(mark);
      last = m.index + m[0].length;
    }
    frag.append(text.slice(last));
    node.replaceWith(frag);
  }
  return marks;
}

/** Highlights a query in the document: the whole phrase, or failing that each word. */
export function markMatches(root: HTMLElement, q: string, wholeWords: boolean): HTMLElement[] {
  clearMarks(root);
  for (const words of [false, true]) {
    const re = matcher(q, wholeWords, words);
    const marks = re ? markText(root, re) : [];
    if (marks.length) return marks;
  }
  return [];
}

/** The first match after the heading `slug`, so a search result opens at the section it came from. */
export function firstMatchAfter(marks: HTMLElement[], root: HTMLElement, slug: string | null): number {
  const heading = slug ? [...root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')].find((h) => h.dataset.slug === slug) : undefined;
  if (!heading) return 0;
  return Math.max(0, marks.findIndex((m) => heading.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING));
}
```

  `app/src/lib/details.ts`:
```ts
import type { Frontmatter } from './markdown/frontmatter';

export interface DocumentDetails {
  words: number;
  sections: number;
  pageLinks: number;
  webLinks: number;
  broken: string[];
  localPictures: number;
  remotePictures: number;
  /** The frontmatter, as written. */
  written: [string, string][];
}

/** What the details dialog reports about a rendered document. */
export function describeDocument(article: HTMLElement, text: string, frontmatter: Frontmatter): DocumentDetails {
  const all = (selector: string) => [...article.querySelectorAll<HTMLElement>(selector)];
  return {
    words: (text.match(/\S+/g) ?? []).length,
    sections: all('h2, h3, h4, h5, h6').length,
    pageLinks: all('a[data-kind="internal"]').length,
    webLinks: all('a[data-kind="external"]').length,
    broken: [...new Set(all('a[data-kind="broken"]').map((a) => a.dataset.target ?? ''))],
    localPictures: all('figure img, .missing-img').length,
    remotePictures: all('.remote-img').length,
    written: Object.entries(frontmatter).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v]),
  };
}
```

  `app/src/lib/format.ts`:
```ts
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const formatDate = (at: number) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function timeAgo(at: number, now = Date.now()): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return formatDate(at);
}
```

- [ ] **Step 4: Run the tests and confirm they pass.** Run the same command as Step 2. Expected: all pass. If `describeDocument`'s counts differ because of how `enhance.ts` tags links or pictures, fix the selectors in `details.ts` to match `enhance.ts`; never change `enhance.ts` for this.
- [ ] **Step 5: Commit.** `feat(app): add highlighting, find marks, document details and formatting helpers`

---

### Task 7: Styles for Search, Library and the find bar

**Files:**
- Modify: `app/scripts/port-styles.mjs`
- Modify: `app/scripts/port-styles.test.mjs`
- Regenerate: `app/src/styles/app.css`, `doc.css`, `tokens.css` and `app/src/IconSprite.svelte`, by running the script.

**Interfaces:**
- Produces: the prototype's Search and Library CSS in `app.css`. The pane grid gives the find bar its own row (4), the scroller row 5 and the status bar row 6.

- [ ] **Step 1: Write the failing test.** In `port-styles.test.mjs`, replace the test `keeps chrome, home and preferences, but not the prototype strip or later screens` with:
```js
  it('keeps chrome, home, preferences, search and library, but not the prototype strip or help', () => {
    for (const sel of ['.tab-main', '.swatch', '.home-hero', '.prefs-grid', '.toc-link', '.divider', '.lib-tabs', '.search-opts', '.result', '.findbar', '.suggest']) {
      expect(out.app).toContain(sel);
    }
    for (const sel of ['.proto-strip', '.promise']) expect(out.app).not.toContain(sel);
    expect(out.app).toContain('Desktop app overrides');
  });
  it('gives the find bar its own row in the pane', () => {
    expect(out.app).toContain('.pane > .findbar { grid-row: 4; }');
    expect(out.app).toContain('.pane > .scroller { grid-row: 5; }');
    expect(out.app).not.toContain('the find bar row returns in Plan 3');
  });
```
Run `npx vitest run scripts/port-styles.test.mjs`. Expected: FAIL.

- [ ] **Step 2: Implement.**
  - In `port-styles.mjs`, change the `DROP` line to:
    ```js
    const DROP = /^Help$/; // Privacy & Help is ported by Plan 4
    ```
  - In `OVERRIDES`, replace the line `.pane { grid-template-rows: auto auto auto minmax(0, 1fr) auto; } /* the find bar row returns in Plan 3 */` with:
```css
.pane > .findbar { grid-row: 4; }
.pane > .scroller { grid-row: 5; }
.pane > .statusbar { grid-row: 6; } /* with no find bar, its row is empty and takes no space */
.result h2 mark { background: var(--mark); color: var(--mark-ink); border-radius: 2px; }
```
  - Run `node scripts/port-styles.mjs` in `app/`.

- [ ] **Step 3: Run the tests and confirm they pass.**
  - Run `npx vitest run scripts/port-styles.test.mjs`. Expected: PASS.
  - `git diff --stat`: only `app.css` should change among the generated files. `doc.css`, `tokens.css` and `IconSprite.svelte` should be unchanged.
- [ ] **Step 4: Commit.** `feat(app): port the Search and Library styles and give the find bar its row`

---

### Task 8: App store: search, bookmarks, find and live reload (`state/app.svelte.ts`)

**Files:**
- Modify: `app/src/state/app.svelte.ts`
- Modify: `app/src/state/app.test.ts`

**Interfaces:**
- Consumes: Tasks 5 and 6.
- Produces, on `AppStore`:
  - Types: `View` (now including `'search' | 'library'`), `ScopeKind = 'all' | 'collection' | 'document'` and `FindState { key, q, wholeWords, slug }`.
  - State:
    - `query: { q, scope, headingsOnly, wholeWords, folder }`
    - `results: SearchResult[] | null`
    - `searchIndexing: boolean`
    - `find: [FindState | null, FindState | null]`
    - `versions: Record<string, number>`
    - `indexing: Record<string, IndexProgress>`
    - `detailsKey: string | null`
  - Methods:
    - `scopeFor(kind): SearchScope`
    - `runSearch(): Promise<void>`
    - `searchFor(q)`
    - `suggest(q): Promise<SearchResult[]>`
    - `rememberSearch(q)`
    - `openResult(key, slug, q?)`
    - `clearFind(pane)`
    - `searchInDocument(pane)`
    - `isBookmarked(pane)`
    - `toggleBookmark(pane)`
    - `removeFromList(kind, id)`
    - `clearList(kind)`
    - `showDetails(key)`
    - `applyChange(change)`
    - `refreshTree(cid)`
    - `onIndexProgress(p)`
    - `onUnavailable(cid)`

- [ ] **Step 1: Write the failing tests.** In `app.test.ts`:
  - Add `import type { SearchResult } from '../lib/core';`.
  - Add to `fakeApi`'s object:
```ts
    search: vi.fn().mockResolvedValue({ results: [], indexing: false }),
    onCollectionChanged: vi.fn().mockResolvedValue(() => {}),
    onIndexProgress: vi.fn().mockResolvedValue(() => {}),
    onCollectionUnavailable: vi.fn().mockResolvedValue(() => {}),
```
  - Append inside the `describe`:
```ts
  const result = (path: string): SearchResult => ({ collectionId: 'sample', path, title: path, titleMatch: false, total: 1, hits: [] });

  it('searchFor runs the search, remembers it and shows the Search screen', async () => {
    const api = fakeApi({ search: vi.fn().mockResolvedValue({ results: [result('Guide.md')], indexing: true }) });
    const app = new AppStore(api);
    await app.init();
    app.searchFor('wifi');
    await vi.waitFor(() => expect(app.results).toHaveLength(1));
    expect(app.view).toBe('search');
    expect(app.searchIndexing).toBe(true);
    expect(app.library.searches[0].q).toBe('wifi');
    expect(api.search).toHaveBeenCalledWith('wifi', { kind: 'all' }, { headingsOnly: false, wholeWords: false, folder: '' });
  });

  it('sends the folder filter only when searching one folder', async () => {
    const api = fakeApi();
    const app = new AppStore(api);
    await app.init();
    Object.assign(app.query, { scope: 'collection', folder: 'Guides' });
    app.searchFor('x');
    await vi.waitFor(() =>
      expect(api.search).toHaveBeenCalledWith('x', { kind: 'collection', collectionId: 'sample' }, { headingsOnly: false, wholeWords: false, folder: 'Guides' }));
  });

  it('searches everywhere when "this document" has no document open', () => {
    const app = new AppStore(fakeApi());
    expect(app.scopeFor('document')).toEqual({ kind: 'all' });
    app.open('sample/Guide.md');
    expect(app.scopeFor('document')).toEqual({ kind: 'document', collectionId: 'sample', path: 'Guide.md' });
  });

  it('ignores a search answer that arrives after a newer search', async () => {
    let first!: (v: unknown) => void;
    const search = vi.fn()
      .mockReturnValueOnce(new Promise((r) => (first = r)))
      .mockResolvedValueOnce({ results: [result('new.md')], indexing: false });
    const app = new AppStore(fakeApi({ search }));
    app.query.q = 'old';
    const older = app.runSearch();
    app.query.q = 'new';
    await app.runSearch();
    first({ results: [result('old.md')], indexing: false });
    await older;
    expect(app.results?.map((r) => r.path)).toEqual(['new.md']);
  });

  it('opening a result highlights the query in the pane it opens in', async () => {
    const app = new AppStore(fakeApi());
    await app.init();
    Object.assign(app.query, { q: 'guest', wholeWords: true });
    app.openResult('sample/Guide.md', 'wi-fi');
    expect(app.find[0]).toEqual({ key: 'sample/Guide.md', q: 'guest', wholeWords: true, slug: 'wi-fi' });
    expect(app.currentKey).toBe('sample/Guide.md');
    expect(app.library.searches[0].q).toBe('guest');
  });

  it('bookmarks the section being read, and removes it again', async () => {
    const app = new AppStore(fakeApi());
    await app.init();
    app.open('sample/Guide.md');
    app.headings[0] = [{ slug: 'setup', text: 'Setup', level: 2, top: 0 }];
    app.currentSlugs[0] = 'setup';
    app.toggleBookmark(0);
    expect(app.library.bookmarks[0]).toMatchObject({ key: 'sample/Guide.md', slug: 'setup', heading: 'Setup' });
    expect(app.isBookmarked(0)).toBe(true);
    expect(app.notice).toBe('Bookmarked “Setup”');
    app.toggleBookmark(0);
    expect(app.library.bookmarks).toEqual([]);
    expect(app.notice).toBe('Bookmark removed: “Setup”');
  });

  it('a change on disk reloads the tree and the changed document', async () => {
    const api = fakeApi();
    const app = new AppStore(api);
    await app.init();
    app.open('sample/Guide.md');
    await app.loadDocument('sample/Guide.md');
    app.applyChange({ collectionId: 'sample', changes: [{ path: 'Guide.md', kind: 'modified' }] });
    expect(app.versions['sample/Guide.md']).toBe(1);
    await app.loadDocument('sample/Guide.md');
    expect(api.readDocument).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2));
  });

  it('a folder that goes away is reported and the folder list refreshed', async () => {
    const api = fakeApi({ listCollections: vi.fn().mockResolvedValueOnce([sample]).mockResolvedValueOnce([{ ...sample, available: false }]) });
    const app = new AppStore(api);
    await app.init();
    await app.onUnavailable('sample');
    expect(app.notice).toBe(MESSAGES.CollectionUnavailable);
    expect(app.collections[0].available).toBe(false);
    expect(app.trees.sample).toBeUndefined();
  });

  it('listens for core events from the start', async () => {
    const api = fakeApi();
    await new AppStore(api).init();
    expect(api.onCollectionChanged).toHaveBeenCalled();
    expect(api.onIndexProgress).toHaveBeenCalled();
    expect(api.onCollectionUnavailable).toHaveBeenCalled();
  });

  it('searches again when indexing finishes', async () => {
    const api = fakeApi({ search: vi.fn().mockResolvedValue({ results: [], indexing: true }) });
    const app = new AppStore(api);
    await app.init();
    app.searchFor('x');
    await vi.waitFor(() => expect(app.searchIndexing).toBe(true));
    app.onIndexProgress({ collectionId: 'sample', indexed: 2, total: 2, done: true });
    await vi.waitFor(() => expect(api.search).toHaveBeenCalledTimes(2));
  });
```

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx vitest run src/state/app.test.ts`. Expected: FAIL, because the methods don't exist.

- [ ] **Step 3: Implement.** In `app.svelte.ts`:
  1. Replace the imports from `../lib/core` and `../lib/library`, and add the `friendlyName` import:
```ts
import { assetUrl, core as realCore, describeError, filesOf, firstDocument, MESSAGES, type Collection, type CollectionChanged, type DocumentText, type IndexProgress, type SearchResult, type SearchScope, type Tree } from '../lib/core';
import { addRecent, addSearch, clearList, docKey, parseKey, parseLibrary, recordProgress, removeFromList, toggleBookmark, toggleFavorite, toggleFavoriteCollection, toRaw, type LibraryData, type ListKind } from '../lib/library';
import { friendlyName } from '../lib/markdown/slug';
```
  2. Replace the `View` type and add the two new types:
```ts
export type View = 'home' | 'reader' | 'prefs' | 'search' | 'library';
export type ScopeKind = 'all' | 'collection' | 'document';
/** Highlights for a search result opened in a pane. */
export interface FindState { key: string; q: string; wholeWords: boolean; slug: string | null }
```
  3. Add these fields after `failedTrees`:
```ts
  /** The Search screen's form. */
  query = $state({ q: '', scope: 'all' as ScopeKind, headingsOnly: false, wholeWords: false, folder: '' });
  /** null until a search has run. */
  results = $state<SearchResult[] | null>(null);
  /** True when the last search ran while a folder was still being indexed. */
  searchIndexing = $state(false);
  find = $state<[FindState | null, FindState | null]>([null, null]);
  /** Bumped when a document changes on disk, so open views of it reload. */
  versions = $state<Record<string, number>>({});
  indexing = $state<Record<string, IndexProgress>>({});
  /** The document whose details dialog is open. */
  detailsKey = $state<string | null>(null);
  private searchSeq = 0;
```
  4. Make `this.subscribe();` the first line of `init()`.
  5. Add these methods before `persist()`:
```ts
  /** Core events: live reload, indexing progress and folders that go away. Listening starts before anything loads. */
  private subscribe(): void {
    void this.api.onCollectionChanged((c) => this.applyChange(c));
    void this.api.onIndexProgress((p) => this.onIndexProgress(p));
    void this.api.onCollectionUnavailable((id) => void this.onUnavailable(id));
  }

  /** The scope sent to the core. "This document" or "this folder" fall back to everywhere when there is none. */
  scopeFor(kind: ScopeKind): SearchScope {
    const key = this.currentKey;
    if (kind === 'document' && key) {
      const { collectionId, path } = parseKey(key);
      return { kind: 'document', collectionId, path };
    }
    if (kind === 'collection' && this.activeCollection) return { kind: 'collection', collectionId: this.activeCollection };
    return { kind: 'all' };
  }

  async runSearch(): Promise<void> {
    const seq = ++this.searchSeq;
    const { q, scope, headingsOnly, wholeWords, folder } = this.query;
    if (!q.trim()) {
      this.results = null;
      this.searchIndexing = false;
      return;
    }
    try {
      const res = await this.api.search(q, this.scopeFor(scope), { headingsOnly, wholeWords, folder: scope === 'collection' ? folder : '' });
      if (seq !== this.searchSeq) return; // a newer search has started
      this.results = res.results;
      this.searchIndexing = res.indexing;
    } catch (e) {
      if (seq !== this.searchSeq) return;
      this.results = [];
      this.notice = describeError(e);
    }
  }

  /** Runs a search from the search box or a history chip, remembers it, and shows the Search screen. */
  searchFor(q: string): void {
    this.query.q = q;
    this.rememberSearch(q);
    this.view = 'search';
    void this.runSearch();
  }

  /** The search box's suggestions: a quick search everywhere. */
  suggest(q: string): Promise<SearchResult[]> {
    return this.api.search(q, { kind: 'all' }, { headingsOnly: false, wholeWords: false, folder: '' }).then((r) => r.results, () => []);
  }

  rememberSearch(q: string): void {
    addSearch(this.library, q);
    this.persist();
  }

  /** Opens a search result and highlights the query in it, starting at the matching section. */
  openResult(key: string, slug: string | null, q = this.query.q): void {
    this.rememberSearch(q);
    const pane = this.ws.split ? this.ws.activePane : 0;
    this.find[pane] = { key, q, wholeWords: this.query.wholeWords, slug };
    this.open(key, { slug });
  }

  clearFind(pane: W.PaneIndex): void {
    this.find[pane] = null;
  }

  /** The toolbar's "Search in this document". */
  searchInDocument(pane: W.PaneIndex): void {
    this.activatePane(pane);
    this.query.scope = 'document';
    this.results = null;
    this.view = 'search';
  }

  isBookmarked(pane: W.PaneIndex): boolean {
    const key = W.activeKey(this.ws, pane);
    const slug = this.currentSlugs[pane] ?? '';
    return !!key && this.library.bookmarks.some((b) => b.key === key && b.slug === slug);
  }

  /** Bookmarks the section being read in a pane (or the top of the document), or removes that bookmark. */
  toggleBookmark(pane: W.PaneIndex): void {
    const key = W.activeKey(this.ws, pane);
    if (!key) return;
    const slug = this.currentSlugs[pane] ?? '';
    const heading = this.headings[pane].find((h) => h.slug === slug)?.text.trim() || friendlyName(parseKey(key).path);
    const added = toggleBookmark(this.library, key, slug, heading);
    this.notice = added ? `Bookmarked “${heading}”` : `Bookmark removed: “${heading}”`;
    this.persist();
  }

  removeFromList(kind: ListKind, id: string): void {
    removeFromList(this.library, kind, id);
    this.notice = 'Removed from the list. The document itself is unchanged.';
    this.persist();
  }

  clearList(kind: 'recent' | 'bookmarks' | 'history'): void {
    clearList(this.library, kind);
    this.notice = 'List cleared.';
    this.persist();
  }

  showDetails(key: string | null): void {
    this.detailsKey = key;
  }

  /** A file changed on disk: refresh the folder's tree, and reload every open view of a changed document. */
  applyChange(change: CollectionChanged): void {
    void this.refreshTree(change.collectionId);
    for (const { path } of change.changes) {
      const key = docKey(change.collectionId, path);
      this.invalidate(key);
      this.versions[key] = (this.versions[key] ?? 0) + 1;
    }
    if (this.view === 'search' && this.results) void this.runSearch();
  }

  /** Reloads a folder tree already shown; keeps the old one if the reload fails (the next change tries again). */
  async refreshTree(cid: string): Promise<void> {
    if (!this.trees[cid]) return; // never shown: the next ensureTree reads it fresh
    await this.treeLoads.get(cid);
    try {
      this.trees[cid] = await this.api.getTree(cid);
      this.failedTrees.delete(cid);
    } catch {
      /* keep the tree we have */
    }
  }

  onIndexProgress(p: IndexProgress): void {
    this.indexing[p.collectionId] = p;
    if (p.done && this.view === 'search' && this.searchIndexing) void this.runSearch();
  }

  async onUnavailable(cid: string): Promise<void> {
    delete this.trees[cid];
    delete this.indexing[cid];
    this.notice = MESSAGES.CollectionUnavailable;
    try {
      this.collections = await this.api.listCollections();
    } catch (e) {
      this.notice = describeError(e);
    }
  }
```

- [ ] **Step 4: Run the tests and confirm they pass.**
  - Run `npx vitest run src/state/app.test.ts`. Expected: all pass.
  - Run `npx vitest run`, `npm run check` and `npx tsc --noEmit -p .`. Expected: everything passes, with 0 errors and 0 warnings.
- [ ] **Step 5: Commit.** `feat(app): add search, bookmarks, find state and live reload to the app store`

---

### Task 9: Shared dialog and the document details dialog

**Files:**
- Create: `app/src/Dialog.svelte`
- Create: `app/src/DetailsDialog.svelte`

**Interfaces:**
- Consumes:
  - From Task 6: `describeDocument`, `formatSize` and `formatDate`.
  - From Task 8: `app.detailsKey` and `app.toggleFavorite`.
- Produces:
  - `<Dialog title wide? onclose children actions>`. It opens as a modal, closes on Esc through `onclose`, and returns focus to whatever opened it.
  - `<DetailsDialog docKey>`. Task 13 mounts it in `App.svelte`.

- [ ] **Step 1: Create `Dialog.svelte`:**
```svelte
<script lang="ts">
  import { onMount, type Snippet } from 'svelte';

  let { title, wide = false, onclose, children, actions }: { title: string; wide?: boolean; onclose: () => void; children: Snippet; actions: Snippet } = $props();
  let dialog = $state<HTMLDialogElement>();
  // Focus goes back to whatever opened the dialog.
  const opener = document.activeElement as HTMLElement | null;

  onMount(() => {
    dialog?.showModal();
    return () => opener?.focus();
  });
</script>

<dialog bind:this={dialog} class:wide aria-labelledby="dlg-title" {onclose}>
  <div class="dlg-head"><h2 id="dlg-title">{title}</h2></div>
  <div class="dlg-body">{@render children()}</div>
  <div class="dlg-actions">{@render actions()}</div>
</dialog>
```

- [ ] **Step 2: Create `DetailsDialog.svelte`:**
```svelte
<script lang="ts">
  import Dialog from './Dialog.svelte';
  import Icon from './Icon.svelte';
  import { describeError } from './lib/core';
  import { describeDocument, type DocumentDetails } from './lib/details';
  import { formatDate, formatSize } from './lib/format';
  import { parseKey } from './lib/library';
  import { renderDocument } from './lib/markdown/render';
  import { app, assetUrl } from './state/app.svelte';

  let { docKey: key }: { docKey: string } = $props();
  interface Info { title: string; size: number; modified: number | null; details: DocumentDetails }
  let info = $state<Info | null>(null);
  let failed = $state<string | null>(null);
  const loc = $derived(parseKey(key));
  const folder = $derived(app.collections.find((c) => c.id === loc.collectionId)?.name ?? '');
  const isFav = $derived(app.library.favorites.includes(key));
  const close = () => app.showDetails(null);

  $effect(() => {
    let cancelled = false;
    const { collectionId, path } = parseKey(key);
    Promise.all([app.loadDocument(key), app.ensureTree(collectionId)])
      .then(([doc, tree]) => {
        if (cancelled) return;
        const r = renderDocument(doc.text, { collectionId, path, files: tree ? app.filesFor(collectionId) : [], assetUrl });
        info = { title: r.title, size: doc.size, modified: doc.modifiedMs, details: describeDocument(r.article, doc.text, r.frontmatter) };
      })
      .catch((e) => {
        if (!cancelled) failed = describeError(e);
      });
    return () => {
      cancelled = true;
    };
  });
</script>

<Dialog title="Document details" wide onclose={close}>
  {#if failed}
    <p>{failed}</p>
  {:else if info}
    {@const d = info.details}
    <table class="info-table"><tbody>
      <tr><th scope="row">Title</th><td>{info.title}</td></tr>
      <tr><th scope="row">Folder</th><td>{folder}</td></tr>
      <tr><th scope="row">Location</th><td>{loc.path}</td></tr>
      <tr><th scope="row">Type</th><td>{/\.txt$/i.test(loc.path) ? 'Plain text document' : 'Markdown document (plain text with formatting marks)'}</td></tr>
      <tr><th scope="row">File size</th><td>{formatSize(info.size)}</td></tr>
      {#if info.modified}<tr><th scope="row">Last changed</th><td>{formatDate(info.modified)}</td></tr>{/if}
      <tr><th scope="row">Length</th><td>{d.words.toLocaleString()} words · about {Math.max(1, Math.round(d.words / 200))} min to read</td></tr>
      <tr><th scope="row">Sections</th><td>{d.sections}</td></tr>
      <tr><th scope="row">Links</th><td>{d.pageLinks} to other pages · {d.webLinks} to websites{#if d.broken.length} · <span style="color:var(--danger)">{d.broken.length} broken ({d.broken.join(', ')})</span>{/if}</td></tr>
      <tr><th scope="row">Pictures</th><td>{d.localPictures} stored with the document · {d.remotePictures} from the internet</td></tr>
      <tr><th scope="row">Your progress</th><td>{app.library.progress[key] ?? 0}% read</td></tr>
      <tr><th scope="row">Access</th><td><Icon name="lock" /> Read-only. Folio never changes this file.</td></tr>
    </tbody></table>
    {#if d.written.length}
      <p class="dlg-sub">Details written in the document</p>
      <table class="info-table"><tbody>
        {#each d.written as [name, value] (name)}<tr><th scope="row">{name}</th><td>{value}</td></tr>{/each}
      </tbody></table>
    {/if}
  {:else}
    <p>Loading…</p>
  {/if}
  {#snippet actions()}
    <button class="btn" onclick={() => app.toggleFavorite(key)}>{isFav ? 'Remove from favorites' : 'Add to favorites'}</button>
    <button class="btn btn-primary" onclick={close}>Close</button>
  {/snippet}
</Dialog>
```

- [ ] **Step 3: Check.** Run `npm run check`. Expected: 0 errors and 0 warnings. A component that isn't mounted yet still compiles; Task 13 mounts it.
- [ ] **Step 4: Commit.** `feat(app): add the shared dialog and the document details dialog`

---

### Task 10: App-bar search box, Library button and shortcuts

**Files:**
- Create: `app/src/GlobalSearch.svelte`
- Modify: `app/src/AppBar.svelte`
- Modify: `app/src/lib/i18n.ts` and `app/src/lib/i18n.test.ts`

**Interfaces:**
- Consumes:
  - From Task 6: `suggestionsFrom`.
  - From Task 8: `app.suggest`, `app.searchFor`, `app.openResult`, `app.rememberSearch` and `app.open`.
- Produces:
  - The input `#gsearch`, which Task 13's shortcuts focus.
  - i18n keys `search`, `searchPh`, `bookmarks`, `bookmarksEmpty` and `viewLibrary`.

- [ ] **Step 1: Write the failing test.** In `i18n.test.ts`, append inside the `describe`:
```ts
  it('translates the search box and bookmarks', () => {
    expect([t('es', 'search'), t('de', 'searchPh'), t('de', 'bookmarks')]).toEqual(['Buscar', 'Dokumente durchsuchen', 'Lesezeichen']);
    expect(t('es', 'viewLibrary')).toBe('View all in Library');
  });
```
Run `npx vitest run src/lib/i18n.test.ts`. Expected: FAIL.

- [ ] **Step 2: Add the keys.** In `i18n.ts`:
  - Add to `en`:
    ```ts
    search: 'Search', searchPh: 'Search documents', bookmarks: 'Bookmarks',
    bookmarksEmpty: 'Bookmark a section to come back to it.', viewLibrary: 'View all in Library',
    ```
  - Add to `es`: `search: 'Buscar', searchPh: 'Buscar documentos', bookmarks: 'Marcadores',`
  - Add to `de`: `search: 'Suche', searchPh: 'Dokumente durchsuchen', bookmarks: 'Lesezeichen',`

  Run the test again. Expected: PASS.

- [ ] **Step 3: Create `GlobalSearch.svelte`:**
```svelte
<script lang="ts">
  import Icon from './Icon.svelte';
  import { t } from './lib/i18n';
  import { suggestionsFrom, type Suggestion } from './lib/search';
  import { app } from './state/app.svelte';

  let value = $state('');
  let items = $state<Suggestion[]>([]);
  let open = $state(false);
  let active = $state(-1);
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const lang = $derived(app.library.prefs.lang);
  const name = (id: string) => app.collections.find((c) => c.id === id)?.name ?? '';

  function close() {
    open = false;
    active = -1;
    seq++; // a pending lookup is now stale
    clearTimeout(timer);
  }

  function refresh() {
    const q = value.trim();
    close();
    if (!q) return;
    const mine = seq;
    timer = setTimeout(async () => {
      const results = await app.suggest(q);
      if (mine !== seq) return;
      items = suggestionsFrom(results, name);
      open = true;
    }, 150);
  }

  /** `i === items.length` is the last row, "Search all documents". */
  function choose(i: number) {
    const q = value.trim();
    const s = items[i];
    close();
    value = '';
    if (!s) {
      if (q) app.searchFor(q);
    } else if (s.slug) {
      app.openResult(s.key, s.slug, q);
    } else {
      app.rememberSearch(q);
      app.open(s.key);
    }
  }

  function onKey(e: KeyboardEvent) {
    const rows = items.length + 1;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && open) {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + rows) % rows;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (value.trim()) choose(open && active >= 0 ? active : items.length);
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      close();
    }
  }
</script>

<div class="search-wrap">
  <Icon name="search" />
  <input id="gsearch" type="search" autocomplete="off" role="combobox" aria-expanded={open} aria-controls="gsuggest" aria-autocomplete="list"
    aria-activedescendant={open && active >= 0 ? `sug-${active}` : undefined} aria-label={t(lang, 'searchPh')} placeholder={t(lang, 'searchPh')}
    bind:value oninput={refresh} onfocus={refresh} onblur={close} onkeydown={onKey} />
  <span class="kbd-hint" aria-hidden="true">/</span>
  {#if open}
    <!-- The input owns the keyboard (combobox pattern); rows only take the mouse. -->
    <ul class="suggest" id="gsuggest" role="listbox" aria-label="Suggestions">
      {#each items as s, i (i)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <li role="option" id="sug-{i}" aria-selected={i === active} onmousedown={(e) => e.preventDefault()} onclick={() => choose(i)}>
          <Icon name={s.icon} /><span class="s-main"><span>{s.label}</span><span class="s-sub">{s.sub}</span></span>
        </li>
      {/each}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <li role="option" id="sug-{items.length}" aria-selected={active === items.length} onmousedown={(e) => e.preventDefault()} onclick={() => choose(items.length)}>
        <Icon name="search" /><span class="s-main"><span>Search all documents for “{value.trim()}”</span></span>
      </li>
    </ul>
  {/if}
</div>
```

- [ ] **Step 4: Put the box and a Library button in the app bar.** In `AppBar.svelte`:
  - Add `import GlobalSearch from './GlobalSearch.svelte';`.
  - Replace `<span class="grow"></span>` with `<GlobalSearch />`.
  - Add, just before the Preferences button:
    ```svelte
    <button class="icon-btn" aria-label={t(lang, 'library')} title={t(lang, 'library')} aria-current={app.view === 'library' ? 'page' : undefined} onclick={() => (app.view = 'library')}><Icon name="bookmark" /></button>
    ```

- [ ] **Step 5: Check.** Run `npm run check` and `npx vitest run`. Expected: 0 errors and 0 warnings, and all tests pass.
- [ ] **Step 6: Commit.** `feat(app): add the app-bar search box with suggestions and a Library button`

---

### Task 11: Search screen

**Files:**
- Create: `app/src/Highlight.svelte`
- Create: `app/src/SearchView.svelte`

**Interfaces:**
- Consumes:
  - From Task 6: `highlight`.
  - From Task 8: `app.query`, `app.results`, `app.searchIndexing`, `app.indexing`, `app.runSearch`, `app.searchFor`, `app.openResult` and `app.filesFor`.
- Produces:
  - `<Highlight text q whole>`.
  - `<SearchView>`, with the heading `#search-h` and the input `#sq`. Task 13 focuses `#sq`.

- [ ] **Step 1: Create `Highlight.svelte`:**
```svelte
<script lang="ts">
  import { highlight } from './lib/search';

  let { text, q, whole }: { text: string; q: string; whole: boolean } = $props();
</script>

{#each highlight(text, q, whole) as s, i (i)}{#if s.hit}<mark>{s.text}</mark>{:else}{s.text}{/if}{/each}
```

- [ ] **Step 2: Create `SearchView.svelte`:**
```svelte
<script lang="ts">
  import { untrack } from 'svelte';
  import Highlight from './Highlight.svelte';
  import Icon from './Icon.svelte';
  import { t } from './lib/i18n';
  import { docKey, parseKey } from './lib/library';
  import { friendlyName } from './lib/markdown/slug';
  import { app } from './state/app.svelte';

  const lang = $derived(app.library.prefs.lang);
  const q = $derived(app.query.q.trim());
  const docOpen = $derived(app.currentKey);
  const colName = (id: string | null) => app.collections.find((c) => c.id === id)?.name ?? '';
  const folders = $derived(
    app.activeCollection ? [...new Set(app.filesFor(app.activeCollection).filter((p) => p.includes('/')).map((p) => p.split('/')[0]))].sort() : [],
  );
  const total = $derived(app.results?.reduce((n, r) => n + Math.max(1, r.total), 0) ?? 0);
  const scopeName = $derived(
    app.query.scope === 'all' ? 'everywhere' : app.query.scope === 'collection' ? `in “${colName(app.activeCollection)}”` : 'in this document',
  );
  const pending = $derived(Object.values(app.indexing).filter((p) => !p.done));
  const indexingText = $derived(
    pending.length
      ? `Still indexing: ${pending.reduce((n, p) => n + p.indexed, 0)} of ${pending.reduce((n, p) => n + p.total, 0)} documents read. Results may be incomplete.`
      : 'Still indexing. Results may be incomplete.',
  );

  // Changing where or how to search re-runs a search that has already run; typing waits for Search.
  $effect(() => {
    void [app.query.scope, app.query.headingsOnly, app.query.wholeWords, app.query.folder];
    untrack(() => {
      if (app.results !== null) void app.runSearch();
    });
  });

  // Keep the form valid when the document or folder it named goes away.
  $effect(() => {
    if (app.query.scope === 'document' && !docOpen) app.query.scope = 'all';
    if (app.query.scope === 'collection' && !app.activeCollection) app.query.scope = 'all';
    if (app.query.folder && !folders.includes(app.query.folder)) app.query.folder = '';
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (q) app.searchFor(app.query.q);
  }
</script>

<section class="view" id="view-search" aria-labelledby="search-h">
  <div class="view-inner">
    <h1 class="vt" id="search-h" tabindex="-1">{t(lang, 'search')}</h1>
    <p class="lede">Search every folder, the folder you're in, or the document you're reading. Headings count as matches too.</p>
    <form class="search-form" role="search" onsubmit={submit}>
      <div class="search-wrap"><Icon name="search" /><input id="sq" type="search" autocomplete="off" aria-label="Search for" placeholder="For example: Wi-Fi, holds, remote images" bind:value={app.query.q} /></div>
      <button class="btn btn-primary" type="submit">{t(lang, 'search')}</button>
    </form>
    <div class="search-opts">
      <div class="seg" role="radiogroup" aria-label="Where to search">
        <label><input type="radio" name="scope" value="all" bind:group={app.query.scope} />Everywhere</label>
        <label style:opacity={app.activeCollection ? '' : '.5'}><input type="radio" name="scope" value="collection" bind:group={app.query.scope} disabled={!app.activeCollection} />This folder</label>
        <label style:opacity={docOpen ? '' : '.5'}><input type="radio" name="scope" value="document" bind:group={app.query.scope} disabled={!docOpen} />{docOpen ? `This document: ${friendlyName(parseKey(docOpen).path)}` : 'Current document'}</label>
      </div>
      <label class="check"><input type="checkbox" bind:checked={app.query.headingsOnly} />Headings only</label>
      <label class="check"><input type="checkbox" bind:checked={app.query.wholeWords} />Whole words</label>
      {#if app.query.scope === 'collection' && folders.length}
        <label class="check">Folder <select bind:value={app.query.folder}><option value="">All folders</option>{#each folders as f (f)}<option value={f}>{f}</option>{/each}</select></label>
      {/if}
    </div>
    <p class="summary" aria-live="polite">
      {#if q && app.results}{app.results.length ? `${total} matching ${total === 1 ? 'section' : 'sections'} in ${app.results.length} ${app.results.length === 1 ? 'document' : 'documents'}, ${scopeName}` : `No results for “${q}” ${scopeName}.`}{/if}
    </p>
    {#if q && app.results && app.searchIndexing}<p class="muted small">{indexingText}</p>{/if}

    {#if !q || !app.results}
      <h2 class="section-h"><Icon name="clock" />Recent searches</h2>
      {#if app.library.searches.length}
        <ul class="chips">
          {#each app.library.searches.slice(0, 8) as s (s.q)}<li><button class="chip" onclick={() => app.searchFor(s.q)}><Icon name="search" />{s.q}</button></li>{/each}
        </ul>
      {:else}<p class="muted small">Your searches will be listed here.</p>{/if}
    {:else if !app.results.length}
      <div class="empty-state">
        <p>Nothing matched “{q}”. Try fewer or different words{app.query.headingsOnly ? ', or turn off “Headings only”' : ''}.</p>
        {#if app.query.scope !== 'all'}<button class="btn" onclick={() => (app.query.scope = 'all')}>Search everywhere instead</button>{/if}
      </div>
    {:else}
      {#each app.results as r (r.collectionId + '/' + r.path)}
        {@const key = docKey(r.collectionId, r.path)}
        <article class="result">
          <h2><button onclick={() => app.openResult(key, null)}><Highlight text={r.title} {q} whole={app.query.wholeWords} /></button></h2>
          <p class="r-path">{colName(r.collectionId)} › {r.path}{r.total > 3 ? ` · ${r.total} matching sections` : ''}</p>
          {#if r.hits.length}
            <ul>
              {#each r.hits as h (h.slug)}
                <li><button class="hit-btn" onclick={() => app.openResult(key, h.slug || null)}>
                  <span class="hit-head"><Icon name="hash" />{#if h.heading}<Highlight text={h.heading} {q} whole={app.query.wholeWords} />{:else}Introduction{/if}{#if h.headingMatch} <span class="badge accent">Heading match</span>{/if}</span>
                  <span class="hit-snip"><Highlight text={h.snippet} {q} whole={app.query.wholeWords} /></span>
                </button></li>
              {/each}
            </ul>
          {/if}
        </article>
      {/each}
    {/if}
  </div>
</section>
```

- [ ] **Step 3: Check.** Run `npm run check`. Expected: 0 errors and 0 warnings.
- [ ] **Step 4: Commit.** `feat(app): add the Search screen`

---

### Task 12: Library screen, sidebar bookmarks and the Home link

**Files:**
- Create: `app/src/LibraryView.svelte`
- Modify: `app/src/Sidebar.svelte`
- Modify: `app/src/HomeView.svelte`

**Interfaces:**
- Consumes:
  - From Task 5: `libraryRows` and `arrangeRows`.
  - From Task 6: `timeAgo`.
  - From Task 9: `Dialog`.
  - From Task 8: `app.removeFromList`, `app.clearList`, `app.showDetails`, `app.searchFor`, `app.open` and `app.openBeside`.
- Produces: `<LibraryView>`, with the heading `#lib-h`, which Task 13 focuses.

- [ ] **Step 1: Create `LibraryView.svelte`:**
```svelte
<script lang="ts">
  import { tick } from 'svelte';
  import Dialog from './Dialog.svelte';
  import Icon from './Icon.svelte';
  import { timeAgo } from './lib/format';
  import { t } from './lib/i18n';
  import { arrangeRows, libraryRows, parseKey, type LibrarySort, type LibraryTab, type ListKind } from './lib/library';
  import { app } from './state/app.svelte';

  type Tab = LibraryTab | 'history';
  const TABS: [Tab, string, string][] = [
    ['recent', 'Recent', 'clock'], ['favorites', 'Favorites', 'star'], ['bookmarks', 'Bookmarks', 'bookmark'],
    ['progress', 'Reading progress', 'book'], ['history', 'Search history', 'search'],
  ];
  const EMPTY: Record<LibraryTab, string> = {
    recent: 'Documents you open will be listed here.',
    favorites: 'Select the star on any document to add it to your favorites.',
    bookmarks: 'While reading, select the bookmark button to save the section you’re in.',
    progress: 'Start reading a document to track your progress.',
  };
  const CLEAR: Partial<Record<Tab, string>> = { recent: 'Clear recent documents', bookmarks: 'Remove all bookmarks', history: 'Clear search history' };

  let tab = $state<Tab>('recent');
  let filter = $state('');
  let sort = $state<LibrarySort>('recent');
  let confirming = $state(false);
  const lang = $derived(app.library.prefs.lang);
  const known = (key: string) => app.collections.some((c) => c.available && c.id === parseKey(key).collectionId);
  const location = (key: string) => {
    const { collectionId, path } = parseKey(key);
    return `${app.collections.find((c) => c.id === collectionId)?.name ?? ''} › ${path}`;
  };
  const counts = $derived(
    Object.fromEntries(TABS.map(([id]) => [id, id === 'history' ? app.library.searches.length : libraryRows(app.library, id, known).length])) as Record<Tab, number>,
  );
  const rows = $derived(tab === 'history' ? [] : arrangeRows(libraryRows(app.library, tab, known), filter, sort, location));
  const searches = $derived(app.library.searches.filter((s) => s.q.toLowerCase().includes(filter.trim().toLowerCase())));
  const listKind = (x: LibraryTab): ListKind | null => (x === 'progress' ? null : x);

  function onTabKey(e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = TABS.findIndex(([id]) => id === tab);
    tab = TABS[(i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length][0];
    void tick().then(() => document.getElementById(`libtab-${tab}`)?.focus());
  }
</script>

<section class="view" id="view-library" aria-labelledby="lib-h">
  <div class="view-inner wide">
    <h1 class="vt" id="lib-h" tabindex="-1">{t(lang, 'library')}</h1>
    <p class="lede">Everything you've read, starred, bookmarked and searched for, in one place.</p>
    <div class="lib-tabs" role="tablist" aria-label="Library lists" tabindex="-1" onkeydown={onTabKey}>
      {#each TABS as [id, label, icon] (id)}
        <button role="tab" id="libtab-{id}" aria-selected={tab === id} aria-controls="lib-panel" tabindex={tab === id ? 0 : -1} onclick={() => (tab = id)}><Icon name={icon} />{label}<span class="count">{counts[id]}</span></button>
      {/each}
    </div>
    <div role="tabpanel" id="lib-panel" aria-labelledby="libtab-{tab}" tabindex="-1">
      <div class="lib-controls">
        <div class="filter"><Icon name="search" /><input type="search" aria-label="Filter this list" placeholder="Filter this list" bind:value={filter} /></div>
        {#if tab !== 'history'}
          <label>Sort by <select bind:value={sort}>
            <option value="recent">Most recent</option><option value="title">Title (A–Z)</option><option value="location">Location</option><option value="progress">Reading progress</option>
          </select></label>
        {/if}
        <span class="grow"></span>
        {#if CLEAR[tab] && counts[tab]}<button class="btn sm" onclick={() => (confirming = true)}>{CLEAR[tab]}</button>{/if}
      </div>
      {#if tab === 'history'}
        {#if searches.length}
          <div class="table-scroll"><table class="lib-table">
            <caption>{searches.length} recent {searches.length === 1 ? 'search' : 'searches'}</caption>
            <thead><tr><th scope="col">Search</th><th scope="col">When</th><th scope="col"><span class="vh">Actions</span></th></tr></thead>
            <tbody>
              {#each searches as s (s.q)}
                <tr><td class="t-title">{s.q}</td><td>{timeAgo(s.at)}</td><td><div class="actions">
                  <button class="btn sm" onclick={() => app.searchFor(s.q)}>Search again</button>
                  <button class="btn sm" aria-label="Remove “{s.q}” from history" onclick={() => app.removeFromList('history', s.q)}>Remove</button>
                </div></td></tr>
              {/each}
            </tbody>
          </table></div>
        {:else}<div class="empty-state">{filter.trim() ? 'No searches match the filter.' : 'You haven’t searched for anything yet.'}</div>{/if}
      {:else if rows.length}
        {@const kind = listKind(tab as LibraryTab)}
        <div class="table-scroll"><table class="lib-table">
          <caption>{rows.length} {rows.length === 1 ? 'item' : 'items'}</caption>
          <thead><tr><th scope="col">Document</th><th scope="col">Progress</th><th scope="col" class="hide-sm">{tab === 'bookmarks' ? 'Added' : tab === 'favorites' ? '' : 'Opened'}</th><th scope="col"><span class="vh">Actions</span></th></tr></thead>
          <tbody>
            {#each rows as r (r.id)}
              <tr>
                <td><span class="t-title">{r.heading ?? r.title}</span><span class="t-sub">{r.heading ? `In ${r.title} · ` : ''}{location(r.key)}</span></td>
                <td><span class="pct"><span class="mini-bar" aria-hidden="true"><span style="width:{r.progress}%"></span></span>{r.progress}%</span></td>
                <td class="hide-sm">{tab === 'favorites' ? '' : r.when ? timeAgo(r.when) : 'Not yet'}</td>
                <td><div class="actions">
                  <button class="btn sm" onclick={() => app.open(r.key, { slug: r.slug || null })}>Open</button>
                  <button class="btn sm hide-sm" onclick={() => app.openBeside(r.key, r.slug || null)}>Side by side</button>
                  <button class="icon-btn sm" aria-label="Details for {r.title}" title="Details for {r.title}" onclick={() => app.showDetails(r.key)}><Icon name="info" /></button>
                  {#if kind}<button class="icon-btn sm" aria-label="Remove {r.heading ?? r.title} from this list" title="Remove from this list" onclick={() => app.removeFromList(kind, r.id)}><Icon name="x" /></button>{/if}
                </div></td>
              </tr>
            {/each}
          </tbody>
        </table></div>
      {:else}
        <div class="empty-state">{filter.trim() ? 'Nothing matches the filter.' : EMPTY[tab as LibraryTab]}</div>
      {/if}
    </div>
  </div>
</section>

{#if confirming && (tab === 'recent' || tab === 'bookmarks' || tab === 'history')}
  {@const kind = tab}
  <Dialog title="{CLEAR[kind]}?" onclose={() => (confirming = false)}>
    <p>This only clears the list in Folio. Your documents are not affected.</p>
    {#snippet actions()}
      <button class="btn" onclick={() => (confirming = false)}>Cancel</button>
      <button class="btn btn-primary" onclick={() => { app.clearList(kind); confirming = false; }}>Clear</button>
    {/snippet}
  </Dialog>
{/if}
```

- [ ] **Step 2: Add Bookmarks to the sidebar.** In `Sidebar.svelte`, insert between the Favorites `<details>` and the Recent `<details>`:
```svelte
  <details open>
    <summary><Icon name="chevron" />{t(lang, 'bookmarks')}</summary>
    <ul class="side-list">
      {#each app.library.bookmarks.filter((b) => known(b.key)).slice(0, 6) as b (b.id)}
        {@const doc = friendlyName(parseKey(b.key).path)}
        <li><button class="tree-item" title={doc} onclick={() => app.open(b.key, { slug: b.slug || null })}><Icon name="bookmark" /><span class="ti-label">{b.heading}<span class="ti-path">{doc}</span></span></button></li>
      {:else}<li><p class="side-empty">{t(lang, 'bookmarksEmpty')}</p></li>{/each}
    </ul>
  </details>
```

- [ ] **Step 3: Link Home to the Library.** In `HomeView.svelte`, inside the recent-documents `<section aria-labelledby="hr-h">`, after its `</ul>`, add:
```svelte
        {#if recent.length}<div class="btn-row"><button class="btn sm" onclick={() => (app.view = 'library')}>{t(lang, 'viewLibrary')}</button></div>{/if}
```

- [ ] **Step 4: Check.** Run `npm run check` and `npx vitest run`. Expected: 0 errors and 0 warnings, and all tests pass.
- [ ] **Step 5: Commit.** `feat(app): add the Library screen, sidebar bookmarks and the Home link`

---

### Task 13: Reading pane, find bar, live reload, and the assembled app

**Files:**
- Modify: `app/src/ReaderPane.svelte`
- Modify: `app/src/DocumentView.svelte`
- Modify: `app/src/App.svelte`

**Interfaces:**
- Consumes: everything above.
- Produces: the finished Plan 3 app.

- [ ] **Step 1: Add the toolbar buttons and reload on change.** In `ReaderPane.svelte`:
  1. Add `const marked = $derived(app.isBookmarked(pane));` after `isFav`.
  2. After the favorites button, add:
```svelte
      <button class="icon-btn sm" aria-pressed={marked} aria-label={marked ? 'Remove bookmark for this section' : 'Bookmark this section'} title={marked ? 'Remove bookmark for this section' : 'Bookmark this section'} disabled={!key} onclick={() => app.toggleBookmark(pane)}><Icon name="bookmark" /></button>
      <button class="icon-btn sm" aria-label="Search in this document" title="Search in this document" disabled={!key} onclick={() => app.searchInDocument(pane)}><Icon name="search" /></button>
      <button class="icon-btn sm" aria-label="Document details" title="Document details" disabled={!key} onclick={() => key && app.showDetails(key)}><Icon name="info" /></button>
```
  3. A document that changes on disk mounts afresh and keeps its scroll position, which is saved in the tab's history entry. Change the key block to:
```svelte
    {#key `${tab.id}:${key}:${app.versions[key] ?? 0}`}
```

- [ ] **Step 2: Add find highlights and fix section targets in `DocumentView.svelte`.**
  1. Add the imports `import { untrack } from 'svelte';` and `import { clearMarks, firstMatchAfter, markMatches } from './lib/find';`.
  2. Replace `slugTarget`. Links to a section carry the same `data-slug` as the heading, so only headings can be targets:
```ts
  // Headings only: a link to a section carries the same data-slug and must not be the target.
  const slugTarget = (slug: string) =>
    [...(host?.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6') ?? [])].find((h) => h.dataset.slug === slug) ?? null;
```
  3. Add after `slugTarget`:
```ts
  let marks = $state<HTMLElement[]>([]);
  let matchIndex = $state(0);
  const findQ = $derived(app.find[pane]?.key === key ? app.find[pane]!.q : null);

  function gotoMatch(i: number) {
    if (!marks.length || !scroller) return;
    matchIndex = (i + marks.length) % marks.length;
    marks.forEach((m, j) => m.classList.toggle('current', j === matchIndex));
    const mark = marks[matchIndex];
    const top = mark.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - scroller.clientHeight / 3;
    scroller.scrollTo({ top, behavior: app.reducedMotion ? 'auto' : 'smooth' });
  }

  /** Highlights this pane's search in the document, starting at the section it came from; or clears old highlights. */
  function applyFind() {
    if (!article) return;
    const f = app.find[pane];
    if (!f || f.key !== key) {
      clearMarks(article);
      marks = [];
      return;
    }
    stopRestore(); // the search result decides where to look, not the saved position
    entry.slug = null;
    marks = markMatches(article, f.q, f.wholeWords);
    if (marks.length) gotoMatch(firstMatchAfter(marks, article, f.slug));
    else if (f.slug) scrollToSlug(f.slug);
  }
```
  4. In the render `.then(...)`, replace everything from `const slug = entry.slug;` to `entry.slug = null;` with:
```ts
        if (app.find[pane]?.key === key) applyFind();
        else {
          if (app.find[pane]) app.clearFind(pane); // highlights belong to the document they were found in
          const slug = entry.slug;
          if (slug && slugTarget(slug)) {
            startRestore(() => (slugTarget(slug)?.offsetTop ?? 12) - 12);
            slugTarget(slug)?.focus({ preventScroll: true });
          } else {
            if (slug) app.notice = 'That section couldn’t be found. It may have been renamed.';
            const top = entry.scroll;
            startRestore(() => top);
          }
          entry.slug = null;
        }
```
  5. In the "link to a section of the document already open here" effect, change the condition to `if (slug && headingEls.length && app.find[pane]?.key !== key) {`.
  6. Add a new effect after it:
```ts
  // A search result opened in the document already showing here, or highlights cleared.
  $effect(() => {
    void app.find[pane];
    untrack(() => {
      if (article) applyFind();
    });
  });
```
  7. In the markup, add the find bar before the scroller. It takes the pane's grid row 4.
```svelte
{#if findQ !== null}
  <div class="findbar">
    <Icon name="search" />
    <span class="grow" aria-live="polite">{#if marks.length}Match <strong>{matchIndex + 1}</strong> of {marks.length} for “{findQ}”{:else}No matches for “{findQ}” in this document{/if}</span>
    <button class="icon-btn sm" aria-label="Previous match" title="Previous match" disabled={!marks.length} onclick={() => gotoMatch(matchIndex - 1)}><Icon name="chev-up" /></button>
    <button class="icon-btn sm" aria-label="Next match" title="Next match" disabled={!marks.length} onclick={() => gotoMatch(matchIndex + 1)}><Icon name="chev-down" /></button>
    <button class="btn sm" onclick={() => { app.clearFind(pane); scroller?.focus(); }}>Clear highlights</button>
  </div>
{/if}
```

- [ ] **Step 3: Assemble `App.svelte`.**
  1. Add the imports:
     ```ts
     import DetailsDialog from './DetailsDialog.svelte';
     import LibraryView from './LibraryView.svelte';
     import SearchView from './SearchView.svelte';
     ```
     and change the store import to `import { app, type View } from './state/app.svelte';`.
  2. Replace the focus effect:
```ts
  // Move focus into the new view; the first run (start-up) must not steal focus.
  const FOCUS: Partial<Record<View, string>> = { home: '#home-h', prefs: '#prefs-h', library: '#lib-h', search: '#sq' };
  let firstRun = true;
  $effect(() => {
    const view = app.view;
    if (firstRun) {
      firstRun = false;
      return;
    }
    const target = FOCUS[view];
    void tick().then(() => {
      const el = target
        ? document.querySelector<HTMLElement>(target)
        : (document.querySelector<HTMLElement>('.pane.is-active .scroller, .pane .scroller') ?? document.getElementById('main'));
      el?.focus();
    });
  });
```
  3. Replace the start of `onKey`, up to and including the `if (typing) return;` line, with:
```ts
  function onKey(e: KeyboardEvent) {
    if (document.querySelector('dialog[open]')) return; // the dialog has the keyboard
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      document.getElementById('gsearch')?.focus();
      return;
    }
    const target = e.target as HTMLElement;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
    if (typing) return;
    if (e.key === '/') {
      e.preventDefault();
      document.getElementById('gsearch')?.focus();
      return;
    }
    if (e.key === 'Escape' && app.view === 'reader' && app.find[app.ws.activePane]) {
      app.clearFind(app.ws.activePane);
      return;
    }
```
  The rest of `onKey` stays as it is.
  4. In `<main>`, replace the view switch with:
```svelte
      {#if app.view === 'home'}
        <HomeView />
      {:else if app.view === 'prefs'}
        <PrefsView />
      {:else if app.view === 'search'}
        <SearchView />
      {:else if app.view === 'library'}
        <LibraryView />
      {:else}
```
  The reader `<section>` and the closing `{/if}` stay.
  5. After the closing `</div>` of `.app`, add:
```svelte
{#if app.detailsKey}
  {#key app.detailsKey}<DetailsDialog docKey={app.detailsKey} />{/key}
{/if}
```

- [ ] **Step 4: Run every automated check.** In `app/`, with the cargo `PATH` and `CARGO_TARGET_DIR` exports:
  - `npx vitest run`: all pass.
  - `npm run check`: 0 errors and 0 warnings.
  - `npx tsc --noEmit -p .`: clean.
  - `npm run check:readonly`: pass.
  - `npm run build`: OK.
  - `cd src-tauri && cargo test`: all pass.
  - `cargo test --release search_speed -- --ignored`: under 200 ms.

- [ ] **Step 5: Commit.** `feat(app): add bookmarks, the find bar, document details and live reload to the reader`

- [ ] **Step 6: Product owner's manual check.** Run `npm run tauri dev` and go through these:
  1. **Search box.** Typing "wi" lists matching documents and sections. `↓`, `↑` and `Enter` choose one, and `Esc` closes the list. `/` and `Ctrl+K` focus the box.
  2. **Search screen.** `Enter` in the box opens Search with results and highlighted words.
     - "Everywhere", "This folder" and "This document" each change the results.
     - "Headings only" and "Whole words" change the results.
     - The folder list appears only for "This folder".
     - A search with no results offers "Search everywhere instead".
  3. **Opening a result.** The document opens at that section with the words highlighted. "Match 1 of N" appears. The arrows step through the matches. "Clear highlights" and `Esc` remove them.
  4. **Search in this document.** The toolbar's search button opens Search limited to that document.
  5. **Bookmarks.** The toolbar bookmark button shows a notice and appears under Bookmarks in the sidebar and in Library. Opening a bookmark goes to its section.
  6. **Library.** All 5 tabs show counts, and `←` / `→` move between them. Filter and sort work. Each row offers Open, Side by side, Details and Remove. "Clear …" asks for confirmation first. "Search again" works.
  7. **Details.** The dialog for Guides › Troubleshooting lists "Printer Manual" as broken. `Esc` closes it, and focus returns to the button.
  8. **Live reload.** Open a copy of the sample folder (Open a folder).
     - Edit an open document in Notepad and save: it reloads at the same position.
     - Delete it: the page says it was moved or deleted, and the tab stays.
     - Add a new `.md` file: it appears in the tree and in search.
  9. **Folder disappears.** Rename the opened copy's folder in Explorer. A message says the folder can't be reached, and the folder shows "Unavailable".
  10. **Large folder.** Open a folder with a few thousand `.md` files. The window stays responsive, and Search says "Still indexing" until it finishes.
  11. **Restart.** After closing and reopening Folio, bookmarks and search history are still there.
  12. **Offline.** With the network off, search, live reload and the dialogs all still work.

---

## Self-review notes (completed while writing)

- **Spec coverage.**
  - §3.1 `search`: Tasks 1–3, with the background index, scopes, filters, headings and text.
  - `workspace` "watches for changes": Task 4.
  - §3.3 `search` command and the 3 events: Tasks 4 and 5.
  - Library schema `bookmarks` and `searches`: Task 5.
  - §4.5 "Changes on disk": Tasks 3, 4, 8 and 13. An open document reloads and keeps its scroll position. A removed one shows the NotFound message and keeps its tab.
  - §5 "Search shows 'still indexing'": Tasks 8 and 11.
  - §3.2 `Dialog` component: Task 9.
  - Prototype screens 3 (Search) and 6 (Library and bookmarks): Tasks 11 and 12.
  - §7 search-index tests and the speed check: Task 2. CI benchmarks stay in Plan 5.
  - `forget_collection` is moved to Plan 4, out of scope above.
- **Placeholders.** None. Every code step has its code, and every test step has its assertions.
- **Type consistency.**
  - `Scope` and `Filters` (Rust) match `SearchScope` and `SearchFilters` (TypeScript), with camelCase and `kind` tags.
  - `SearchResult` and `Hit` fields match `SearchResult` and `SearchHit`.
  - Event payloads are pinned by `event_payloads_use_the_screens_names`.
  - `ListKind`, `LibraryTab` and `LibrarySort` are used the same way in Tasks 5, 8 and 12.
  - `FindState` is used the same way in Tasks 8 and 13.
- **Earlier defect fixed in passing.** Task 13 Step 2.2: `slugTarget` could pick a link to a section instead of the heading, because both carry `data-slug`.
- **Execution notes.**
  - Tasks 1–4 are Rust and independent of the TypeScript tasks.
  - Task 8 needs Tasks 5 and 6.
  - Tasks 9–12 need Task 8.
  - Task 13 needs everything.
