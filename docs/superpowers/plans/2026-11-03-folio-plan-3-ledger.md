# SDD ledger — plan: docs/superpowers/plans/2026-11-03-folio-plan-3-search-and-library.md

Branch feat/folio-plan-3 from main 94d05ef. Spec amendments A4–A7 committed fa90a28. Approved by product owner ("Go head") with subagent-driven.

## Pre-flight scan

| Tasks | Produces → consumes | Found |
|---|---|---|
| T1/T2 (search.rs) | Section/DocEntry private folded fields, fold → search_docs | consistent; T2 adds serde use at top |
| T2/T3 | Scope, Filters, SearchResponse, search_docs → Indexer::search | consistent |
| T3/T4 (indexer.rs) | Indexer, Notice, Emit, apply_changes, tests' folder()/wait_until → ensure/watch + watch test | consistent; T4 adds watchers field (Default still derives) |
| T4/T5 | command `search(query, scope, filters)`, events index-progress / collection-changed / collection-unavailable (camelCase) → core.ts | names match |
| T5/T6 | SearchResult, docKey → suggestionsFrom | consistent |
| T5/T8 | library fns + core.search/on* → store; fakeApi gains them in T8 | consistent |
| T6/T13 | markMatches/clearMarks/firstMatchAfter → DocumentView | consistent |
| T7/T13 | grid rows 4/5/6 for .findbar/.scroller/.statusbar → findbar rendered as sibling before scroller | consistent |
| T8/T9–T13 | store API (showDetails, openResult, toggleBookmark, isBookmarked, searchInDocument, versions, find…) | consistent |
| T10/T11,T12 | i18n keys search, searchPh, bookmarks, bookmarksEmpty, viewLibrary | T10 before T11/T12 ✓ |
| T9/T12,T13 | Dialog, DetailsDialog | consistent |
| T1 self | 11 tests vs code; fixture path include_str ../../tests | consistent |
| T2 self | 14 tests + 1 ignored (25 in search::) | consistent |
| T3 self | 13 tests; kind_of made pub | consistent |
| T4 self | ensure used by test; Send risk noted (BLOCKED, no unsafe) | consistent |
| T5 self | edits existing 'keeps unknown keys' test (bookmarks now owned) | consistent |
| T6 self | details selectors may need fitting to enhance.ts (brief allows) | consistent |
| T7 self | updates port-styles test | consistent |
| T8–T13 self | components have no unit tests; verified by svelte-check + T13 manual | see ruling R1 |

Ruling: R1 component tasks (T9–T12) carry no unit tests, verified by svelte-check, the store's unit tests and Task 13's manual checklist — same as Plan 2, components need a running window — cost if wrong: a component regression surfaces only in the manual check.

## Tasks
Task 1: dispatched (base fa90a28, sonnet, agent aef97ad28eb1546ad)
Task 1: review 1 (40c12d3): Needs fixes — I1 slugify diverges from JS \p{L}\p{N}/\s for combining-mark scripts; I2 strip_wiki pairs [[..]] across lines/code (plan-mandated code); I3 leading-rule test never reaches the no-key branch (plan-mandated).
Ruling: R2 allow dependency `unicode-properties` (default-features=false, features=["general-category"]) so Rust slugify matches JS exactly (letter/number general category; JS \s whitespace set incl. U+FEFF, excl. U+0085; same set for trim) — spec forbids only network deps, the plan's dependency list was its own; parity is a stated Global Constraint — cost if wrong: one small pure-data crate.
Ruling: R3 I2 accepted against plan text: wiki rewrite must follow parser.ts (one line, target without ] | newline, label without ] newline) and never apply inside inline code or code blocks — spec says index matches what the reader shows — cost: slightly more code in extract.
Ruling: R4 I3 accepted: add a test that reaches the no-key branch; also strip the block's final newline so `---\n\n---` matches frontmatter.ts — cost: none.
Task 1: minor (deferred): [!NOTE] stripped case-sensitively and anywhere incl. headings (reader: start of blockquote only, case-insensitive) — affects slug of `# [!NOTE] Foo`.
Task 1: minor (deferred): Html/InlineHtml dropped without separator (`one<br>two` → `onetwo`); raw <h2> not counted as section.
Task 1: minor (deferred): duplicate title: keys — Rust first, TS last; title fallback skips empty h1 (render.ts uses first h1).
Task 1: minor (deferred): dead-code warnings for folded fields until Task 2.
Task 1: fix round 1/5 (3 addressed, 0 open; commits 40c12d3..b1cc3c2)
Task 1: minor (deferred): wiki link spanning inline markup (`[[a *b* c]]`) stays literal in the index (run flushed at Start(Emphasis)); display text only.
Task 1: complete (commits fa90a28..b1cc3c2, review clean)
Task 2: dispatched (base b1cc3c2, sonnet)
Task 2: review 1 (fc91819): Needs fixes — I1 hits+snippets built for every matching doc before truncate(100) (plan-mandated; big sections threaten 200 ms); I2 no test for 200-char query cap (plan-mandated).
Ruling: R5 I1 and I2 accepted against plan text — spec §7 sets the 200 ms target and the cap is a Global Constraint — cost: small restructure of search_docs.
Ruling: R6 promote reviewer Minor "path tie-break" to the fix round — Task 3 feeds docs from a HashMap, so equal score+title results would reorder between runs — cost: none. Also take 200 chars before folding (part of I1's perf fix).
Task 2: minor (deferred): query trim/split use Unicode whitespace, not JS \s (BOM/NEL edge).
Task 2: minor (deferred): Filters rejects explicit null fields (TS never sends null; omission is fine).
Task 2: minor (deferred): whole-word find uses non-overlapping match_indices (rare miss).
Task 2: minor (deferred): tests lack positive whole-word, headings_only+title-only, score-formula cases; Filters.folder comment says top-level but any depth accepted.
Task 2: fix round 1/5 (3 addressed, 0 open; commits fc91819..4d521fa)
Task 2: complete (commits b1cc3c2..4d521fa, review clean)
Task 3: dispatched (base 4d521fa, sonnet)
Task 3: review 1 (60384ce): Needs fixes — all plan-mandated: I1 forget+start races old build thread (writes/marks done on new index); I2 build vs watcher race re-inserts stale/deleted docs; I3 folder+child in one batch reports a path twice; I4 missing temp `*.md` reports spurious Removed; I5 build swallows tree error (empty "done" index).
Ruling: R7 accept I1–I5 against plan text — spec §3.1 "still indexing until complete" and Review Focus 1/2 are the binding intent; Task 4 makes restart a normal path — cost: generation counter + touched-set + dedupe, ~40 lines. I4 fallback Removed limited to pictures (an unreadable doc deleted from the tree then emits nothing; tree catches up on next change).
Task 3: minor (deferred): apply_changes follows symlinks (is_dir/exists, document_paths on root.join) unlike build_tree; names exposed, content still guarded.
Task 3: minor (deferred): exists() treats permission/IO errors as removed.
Task 3: minor (deferred): Mutex poisoning → later panics; a panicking build thread leaves done=false forever ("still indexing" forever).
Task 3: minor (deferred): search scans under the index lock (CPU only); folder-appears branch applies 20k cap per folder; non-UTF-8 names emit bogus Removed.
Task 3: fix round 1/5 (4 addressed, 1 open — I2 residual: folder deleted mid-build can resurrect documents build already read (touched is exact-path); commits 60384ce..15f93be)
Task 3: minor (deferred): stale build may still emit one progress event in the window after the lock is released (screens don't check generation).
Task 3: fix round 2/5 (1 addressed, 0 open; commits 15f93be..4f50cc7)
Task 3: minor (deferred): no test that a sibling-prefix folder (Guidesx) is still indexed when Guides is touched.
Task 3: complete (commits 4d521fa..4f50cc7, review clean)
Task 4: dispatched (base 4f50cc7, sonnet)
Task 4: review 1 (6c049eb): Needs fixes — I1 watcher Err results dropped silently (missed changes → stale index); I2 handler reads files (whole subtree for a new folder) under the global index lock (plan-mandated).
Ruling: R8 on a watcher Err with the root still present: log, drop the index entry, and emit Changed with no changes — the screens' tree refresh calls get_tree → ensure, which rebuilds index and watcher — cost: one rebuild after an overflow.
Ruling: R9 I2 accepted against plan text: split apply_changes into a read phase (no lock) and a commit phase (under lock, records touched); the debouncer thread is sequential so ordering holds — spec §3.1 "never blocks"/build's own rule — cost: moderate refactor of Task 3 code, tests keep the apply_changes wrapper.
Task 4: minor (deferred): no test for vanish → Unavailable once → leaves search → ensure re-indexes; none for forget dropping the watcher.
Task 4: minor (deferred): search probes is_dir() for every collection on every call (dead network drive can hang a search) — plan-mandated.
Task 4: minor (deferred): existing-but-unreadable root re-starts indexing and re-emits Unavailable on each search.
Task 4: minor (deferred): watcher registered after build starts (tiny missed-change window); watch failure only logged; forget has no production caller yet; test string uses a literal line break.
Task 4: fix round 1/5 (2 addressed, 0 open; commits 6c049eb..5c6daa4)
Task 4: minor (deferred): read-to-commit window could commit a pre-restart read into a fresh generation (next change corrects).
Task 4: complete (commits 4f50cc7..5c6daa4, review clean)
Note for Task 8: collection-changed may arrive with empty `changes` (R8: watcher overflow) — store must still refresh the tree (get_tree re-indexes).
Task 5: dispatched (base 5c6daa4, haiku)
Task 5: minor (deferred): parsed search q not trimmed (dedupe vs addSearch); bookmarks deduped by id not key+slug; no bookmark cap; only onCollectionUnavailable listener tested; localeCompare without numeric.
Task 5: complete (commits 5c6daa4..bab4703, review clean)
Task 6: dispatched (base bab4703, sonnet)
Task 6: minor (deferred): WORD class [\p{L}\p{N}_] vs core is_alphanumeric (Alphabetic incl. combining marks) — whole-word highlight may disagree for Indic/decomposed text.
Task 6: minor (deferred): word-mode alternation leftmost-first (`wi wi-fi` marks only `Wi` in Wi-Fi); formatSize shows "1024 KB" near 1 MB; tests miss svg/math/.katex/.doc-meta skip, whole-word digits/_ and markMatches whole-word, empty describeDocument.
Task 6: complete (commits bab4703..56ca702, review clean)
Task 7: dispatched (base 56ca702, haiku)
Task 7: minor (deferred): port-styles test's negative assertion checks a deleted comment (should assert the old five-row .pane rule is gone; statusbar row 6 unasserted); Help exclusion asserted only via .promise; `.proto-note-s` survives in an indented selector line (pre-existing, unused).
Task 7: minor (deferred): `.result h2 mark` styling is a deliberate look change vs prototype (browser-default mark) — design to confirm.
Task 7: complete (commits 56ca702..3ed093f, review clean)
Task 8: dispatched (base 3ed093f, sonnet)
Task 8: review 1 (8473d5e): Needs fixes — I1 refreshTree (plan-mandated): change during first ensureTree dropped; overlapping refreshes resolve out of order; can resurrect a tree onUnavailable deleted.
Ruling: R10 accept I1 — spec §4.5 tree must follow disk — fix with per-folder refresh sequence, await an in-flight first load instead of dropping, assign only if latest and the folder wasn't dropped meanwhile — cost: ~15 lines.
Ruling: R11 promote Minor 3: empty `changes` (missed watcher events) bumps versions of every open document in that folder — spec §4.5 "an open document that changed reloads", and after missed events any may have — cost: open docs of that folder reload once (scroll kept).
Task 8: minor (deferred): refreshTree failures silent (no failedTrees/notice); listener rejections unhandled and unlisten dropped; search error leaves old searchIndexing; folder filter sent when scope fell back to all; re-search on any folder done; split core imports in test; subscribe test doesn't fire callbacks; no tests for runSearch error branch / scopeFor('collection').
Task 8: fix round 1/5 (2 addressed, 0 open; commits 8473d5e..44c544d)
Task 8: minor (deferred): ensureTree first load doesn't check treeSeq (in-flight first load can write trees after onUnavailable — pre-existing); failedTrees not cleared by change events after a failed first load.
Task 8: complete (commits 3ed093f..44c544d, review clean)
Task 9: dispatched (base 44c544d, haiku)
Task 9: minor (deferred): DetailsDialog effect tracks app.trees via ensureTree's sync read (re-runs on tree refresh); `failed` never cleared; failed tree → links counted as broken; opener captured at init; static dlg-title id.
Ruling: R12 cross-task: DocumentView's mount $effect also calls app.ensureTree synchronously, so since Task 8 every tree refresh (any file change in the folder) would re-run it — remount-like reload, lost find marks/scroll. Carry into Task 13: wrap DocumentView's (and DetailsDialog's) load in untrack — cost if wrong: one extra wrapper.
Task 9: complete (commits 44c544d..15d31c4, review clean)
Task 10: dispatched (base 15d31c4, haiku)
Task 10: minor (deferred, visible UX): suggestion list closes and reopens on every keystroke (refresh calls close) — flicker; prototype replaces in place. Candidate for final fix wave.
Task 10: minor (deferred): no timer cleanup on unmount; arrows don't reopen list; untranslated "Suggestions"/"Search all…"; no IME isComposing guard on Enter; long query overflows last row; Esc in type=search may also clear text (needs window).
Task 10: complete (commits 15d31c4..05779d9, review clean)
Task 11: dispatched (base 05779d9, haiku)
Task 11: review 1 (dfb9cd2): Needs fixes — I1 hits keyed by slug can collide on "" (intro + symbol-only heading) → each_key_duplicate; I2 highlights/summary/openResult q follow the live text box, not the query that produced the results.
Ruling: R13 accept both; I2 needs a small store change (Task 8 file): runSearch snapshots `resultsQuery {q, wholeWords}` with the results; view highlights and opens with it — cost: cross-task edit, one store test.
Task 11: minor (deferred): emoji-only heading's hit opens at document top (slug ""); folder cleared while tree loads; "still indexing" outside aria-live; scope label/whole read live options; Enter on empty box silent; strings English.
Task 11: fix round 1/5 (2 addressed, 0 open; commits dfb9cd2..7b343e0)
Task 11: minor (deferred, final-wave candidate): background re-runs (file change, indexing done, option toggle) search the live unsubmitted box text and can clear results if the box was emptied — reuse resultsQuery.q for re-runs; searchInDocument nulls results but not resultsQuery; openResult wholeWords reads live checkbox.
Task 11: complete (commits 05779d9..7b343e0, review clean)
Task 12: dispatched (base 7b343e0, haiku)
Task 12: review 1 (e7b084b): Needs fixes — I1 focus lost to <body> after Remove and after a confirmed Clear (prototype refocuses the filter) — plan-mandated.
Ruling: R14 accept I1 against plan text (accessibility basics are binding) and promote Minor 2 (tab arrow handler swallows Alt+←, the Global Constraint back shortcut) — cost: a few lines.
Task 12: minor (deferred): tablist tabindex=-1; no Home/End; tab/filter/sort reset on each visit; blank Favorites column header; per-row button labels lack row context; English-only strings.
Task 12: fix round 1/5 (2 addressed, 0 open; commits e7b084b..27cede9); report file committed by mistake, untracked in fc3b37d (controller housekeeping).
Task 12: complete (commits 7b343e0..fc3b37d, review clean)
Task 13: dispatched (base fc3b37d, sonnet) — carries R12 (untrack loads in DocumentView/DetailsDialog); step 6 manual check reserved for product owner.
Task 13: review 1 (4192949): Needs fixes — I1 live reload with highlights jumps to first match instead of keeping scroll (spec §4.5; plan-mandated); I2 same-document section request swallowed while highlights show, fires late on clear (plan-mandated).
Ruling: R15 accept I1, I2 against plan text (spec §4.5 binding); promote Minors 1 (find bar announces "No matches" before the document has rendered / after failed load), 2 (applyFind doesn't record progress/current section when no scroll event fires → bookmark lands on doc top), 4 (`/` branch also fires on Ctrl+/ Cmd+/) — all small, user-visible — cost: ~20 lines in DocumentView/App.
Task 13: minor (deferred): find scroll not protected against late layout shifts (images/diagrams above match); live-reload remount drops keyboard focus from the scroller; bookmark aria-pressed + changing label (same as favorites).
Task 13: fix round 1/5 (5 addressed, 0 open; commits 4192949..26d3417)
Task 13: minor (deferred, final-wave candidate): same-slug guard in DocumentView slug effect lacks `!f.applied` — a later bookmark to the search's starting section is swallowed while highlights stay.
Task 13: minor (deferred): match index resets to 1 after a reload; `/` blocked where it needs AltGr.
Task 13: complete (commits fc3b37d..26d3417, review clean)
Final review: dispatched (merge-base main..HEAD, opus)
Final review (opus, 94d05ef..26d3417): With fixes — I1 Windows: renamed/recycled/unplugged opened folder never reported (ReadDirectoryChangesW on root sees no event; notify swallows errors) → stays in search, R8 never fires on Windows. Must-fix minor: DocumentView same-slug guard needs `!f.applied`. Should-fix: suggestion flicker; background re-runs search unsubmitted text / openResult wholeWords live; IME Enter. Minors 3 (delete before build reaches doc emits nothing) and 4 (transient read failure drops doc from index).
Ruling: R16 one fix wave covering I1 (vanished(): probe thread every ~2 s + search's missing-root branch), the slug guard, flicker, re-runs with resultsQuery.q / wholeWords from resultsQuery, IME guard, and Minors 3–4 — all small and user-visible; the rest of the ledger minors wait (final reviewer triaged them "can wait") — cost: one more re-review.
Final fix wave: 7/7 addressed (commits 26d3417..2e3de68), re-review approved.
Final: minor (deferred): put() keeps a stale entry on OutsideCollection/NotFound read errors; stale suggestion row can open with newer q; directory replacing a document leaves stale entry; probe vs re-watch race within one tick; IME keyCode 229 quirk.
Plan 3 complete — awaiting product owner's manual check (Task 13 Step 6) before merge.
