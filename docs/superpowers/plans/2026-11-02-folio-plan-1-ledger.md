# SDD ledger — plan: docs/superpowers/plans/2026-11-02-folio-plan-1-core-foundation.md

Spec: docs/superpowers/specs/2026-11-02-folio-desktop-architecture-design.md (approved 2026-11-02)
Branch: feat/folio-plan-1 (from main 1fcc8f2)

## Pre-flight scan
| Tasks | Shared file / interface | Finding |
|---|---|---|
| 1↔2..7 | src-tauri/src/lib.rs | 2-6 add `pub mod` lines; 7 replaces whole file listing all 8 mods. Consistent. |
| 1↔7 | tauri.conf.json | 7 adds bundle.resources; needs tests/fixtures/sample-wiki to exist — 7 creates .keep. OK |
| 7↔9 | tests/fixtures/sample-wiki/.keep | 9 deletes .keep after writing files. OK |
| 1↔8 | vite.config include scripts/**/*.test.mjs | matches 8's test file name. OK |
| 1↔12 | App.svelte, base.css | 1 placeholders, 12 full replacement. OK |
| 2→3..7 | AppError variants | 7 codes identical in errors.rs, core.ts ErrorCode, MESSAGES. OK |
| 4→7→12 | DocumentText {text,size,modifiedMs,lossy} | serde camelCase matches TS. OK |
| 5→7 | LoadResult {library,reset}, fresh() | used by state.rs/lib.rs/commands. OK |
| 6→7→12 | Collection/TreeNode/Tree/NodeKind | Rust camelCase/lowercase match TS types. OK |
| 9→11 | fixture paths, .svg image names | render.test expects Images/architecture.svg, flowchart TD (index.html updated to TD). OK |
| 10→11 | toHtml/sanitize/slug exports | names match imports in enhance/render. OK |
| 11→12 | renderDocument(text, EnhanceContext) | App passes {collectionId,path,files,assetUrl}. OK |
| 1 self | cargo check needs ../dist (generate_context) | Step 5 runs `npm run build` before `cargo check`. OK |
| 2..7 self | tests vs code | tests reference only defined items. OK |
| 8 self | check ignores #[cfg(test)] | reader/paths tests write fixtures inside cfg(test). OK |
| 10/11 self | counts 18 / links 5 / render 10 | corrected in plan before commit. OK |

Ruling: work on branch feat/folio-plan-1 in this checkout instead of a git worktree — repo lives in OneDrive; a second worktree copy would also sync and double disk/sync load — cost if wrong: none functional; branch isolates main.
Ruling: Task 0 (install Rust + MSVC build tools) is a system install a person must run; execution paused before Task 1 until toolchain present — cost if wrong: delay only.

Toolchain: rustup 1.29.2 / rustc 1.99.1 installed via winget; VS 2022 BuildTools VCTools installed (retried after msiexec 1618 conflict).
Task 1: dispatched (base 1fcc8f2, model sonnet)
Task 1: implementer DONE (65d1ecf). Stray ../.gitignore created by implementer (contained only its own line) removed by controller.
Task 1: minor (deferred): android/ios/Square*Logo icon variants committed though desktop-only
Task 1: minor (deferred): capabilities $schema points to gitignored gen/schemas (editor hints only)
Task 1: minor (deferred): esbuild postinstall not in npm allowScripts warning
Task 1: complete (commits 1fcc8f2..65d1ecf, review clean)
Task 2: dispatched (base 65d1ecf, model haiku)
Ruling: commit trailers name the model that actually wrote each commit (subagent harness attribution), not a fixed Opus line — honest attribution — cost if wrong: cosmetic. Tasks 1-2 commits carry the Opus trailer.
Task 2: minor (deferred): only 2 of 7 codes have wire-format tests; redundant use std::io in tests
Task 2: complete (commits 65d1ecf..a7d95fa, review clean)
Task 3: dispatched (base a7d95fa, model haiku)
Task 3: review Important (plan-mandated): no Windows test exercises the canonical starts_with rejection; plan claimed junction needs admin (mklink /J does not).
Ruling: add #[cfg(windows)] junction-escape test via mklink /J — the brief text deferred it on a false premise; spec says every access goes through the guard, so its rejection branch must be tested on the dev platform — cost if wrong: one extra test.
Ruling: fold Minor 1 (long-path \?\ mismatch false rejection) into fix round — compare std::fs::canonicalize forms for containment, return dunce form — user works in deep OneDrive paths — cost if wrong: small diff.
Ruling: fold Minor 5 (strengthen spaces/accents assertion) into fix round — trivial.
Task 3: minor (deferred): in-root symlinks followed by resolve while tree hides them; "." resolves to root; root error cause dropped; TOCTOU inherent
Task 3: fix round 1/5 (3 addressed, 0 open — junction test, std-canonical containment, stronger accent assert; commits 7349f5e..a58037d)
Task 3: minor (deferred): resolve canonicalizes target twice; could use dunce::simplified(&std_full)
Task 3: complete (commits a7d95fa..a58037d, review clean)
Task 4: dispatched (base a58037d, model haiku)
Task 4: minor (deferred): read unbounded after metadata cap check (use take(MAX_BYTES+1)); size from metadata
Task 4: minor (deferred): no tests for UTF-16 BE / odd length / unpaired surrogate / exact 10MB boundary; UTF-32 LE BOM misread as UTF-16
Task 4: complete (commits a58037d..265bda7, review clean)
Task 5: dispatched (base 265bda7, model haiku)
Ruling: Task 5 implementer concern 1 (non-UTF-8 library.json -> Internal, not backup+reset) fixed before review — spec §3.1 says a damaged file is renamed to .bak and a fresh one started; invalid UTF-8 is damage — cost if wrong: none.
Task 5: minor (deferred): no fsync before rename (atomic, not durable); second damage overwrites existing .bak
Ruling: Task 5 Important (plan-mandated) no fsync — fix: write temp via File::create + write_all + sync_all before rename — a power loss could otherwise truncate library.json and the next load resets the user library — cost if wrong: negligible perf.
Ruling: fold Minor 4 (non-UTF-8 test asserts backup bytes equal original + fresh version 1) into the round — trivial.
Task 5: minor (deferred): fixed .bak overwritten on second reset; UTF-8 BOM in library.json triggers reset; no test that .tmp is gone; comment wording; Task 6 must tolerate missing collections key
Task 5: fix round 1/5 (2 addressed, 0 open — fsync before rename, stronger non-UTF-8 test; commits 3b61f91..e2729e7)
Task 5: minor (deferred): parent dir not synced after rename ("durable" wording overstates); partial .tmp left on write failure (harmless)
Task 5: complete (commits 265bda7..e2729e7, review clean)
Task 6: dispatched (base e2729e7, model haiku)
Ruling: Task 6 Important (plan-mandated) all-or-nothing collections parse — fix: parse entries one by one, skip only malformed ones — otherwise one bad entry erases every remembered folder on next save — cost if wrong: none.
Ruling: fold Minors into round: test missing collections key -> empty; root read_dir NotFound -> CollectionUnavailable (Review Focus 4); collections_to_json uses root.to_string_lossy() to avoid panic on non-UTF-8 root.
Task 6: minor (deferred): false truncated when cap hit with only empty dirs left; no tests for serialized shapes / symlink skip / available=false; traversal unbounded by folder count/depth; unreadable subfolders silently dropped
Task 6: fix round 1/5 (4 addressed, 0 open — per-entry collections parse, missing-key test, root NotFound->CollectionUnavailable, lossy root; commits 72baaeb..675d9ba)
Task 6: minor (deferred): non-UTF-8 root saved lossy (collection becomes unavailable); skipped malformed entries not logged
Task 6: complete (commits e2729e7..675d9ba, review clean)
Task 7: dispatched (base 675d9ba, model sonnet)
Ruling: accept Task 7 change to app/vite.config.ts (server.watch.ignored **/src-tauri/**) — standard Tauri setting; without it tauri dev crashes on Windows (EBUSY on target dll) — cost if wrong: none (vite need not watch Rust output).
Ruling: Task 7 Important 1 — add library_lock Mutex<()> in AppState (created in new) held across load-modify-save in save_library and persist_collections — concurrent saves can corrupt library.json — cost if wrong: none.
Ruling: Task 7 Important 2 — extract pure serve_asset(state,&path)->Option<(&str,Vec<u8>)> from respond and test it (traversal, .md, unknown collection, good image) instead of adding tauri test feature — keeps deps unchanged — cost if wrong: small refactor.
Ruling: fold Minor 1 partially — serve_asset refuses images over reader::MAX_BYTES (404) — bounded read; async protocol deferred.
Task 7: minor (deferred): setup swallows library load error into fresh library (next save could overwrite real file); pick_folder adds to memory before persist; lock().unwrap() poisoning; save_library does not check version; no test that persist/save exclude sample; sync protocol handler blocks webview on large images
Ruling: cargo builds use CARGO_TARGET_DIR=%LOCALAPPDATA%/folio-target (outside OneDrive) for remaining tasks — OneDrive locks files in app/src-tauri/target causing Access denied — cost if wrong: one extra full rebuild.
Task 7: fix round 1/5 (2 addressed, 0 open — library_lock serialization, serve_asset + tests + size cap; commits 8e7efb2..ee46df7)
Task 7: minor (deferred): image size cap untested; save_library lock path untested directly
Task 7: complete (commits 675d9ba..ee46df7, review clean)
Task 8: dispatched (base ee46df7, model haiku)
Ruling: Task 8 Important 1-3 (plan-mandated) fixed now — spec makes this the CI gate for read-only: strip only #[cfg(test)] mod blocks by brace matching (other cfg(test) items stay scanned, fail-safe); scan src recursively plus build.rs and fail if no .rs files; add patterns File::options, create_new, hard_link, symlink, grouped use std::fs::{..} imports of mutators; strip // comments (Minor 5) — cost if wrong: small script change.
Task 8: minor (deferred): aliasing/subprocess/FFI bypasses uncatchable by regex — add clippy.toml disallowed-methods in Plan 5; no CI workflow exists yet (Plan 5)
Task 8: fix round 1/5 (4 addressed, 0 open — test-mod-only stripping, recursive scan + build.rs, extra patterns, comment stripping; commits 68c431b..e6bd9c7)
Task 8: minor (deferred): unbalanced brace literal in a mid-file test mod fails open; :// in string hides later call on same line; use std::fs::* / aliases undetected; CLI test cwd-dependent; Node >=18.17 needed (no engines field)
Task 8: complete (commits ee46df7..e6bd9c7, review clean)
Task 9: dispatched (base e6bd9c7, model haiku)
Task 9: minor (deferred): fixture .md files are CRLF on disk with LF last line (index.html CRLF, autocrlf); committed blobs LF. Ruling: keep — Windows users' real files are CRLF, so tests reading CRLF fixtures are realistic; Tasks 10-11 told to expect CRLF — cost if wrong: Linux CI sees LF only (Plan 5 adds .gitattributes if needed).
Task 9: complete (commits e6bd9c7..f387515, review clean)
Task 10: dispatched (base f387515, model haiku)
Ruling: Task 10 Important 1 (plan-mandated) mathBlock ReDoS — replace regex with non-overlapping form ^\$\$[ 	]*
([\s\S]*?)
[ 	]*\$\$[ 	]*(?:
+|$) plus timed test — untrusted docs must not hang UI — cost if wrong: one-line $$..$$ display math unsupported (already unsupported).
Ruling: Task 10 Important 2 (plan-mandated) frontmatter swallows text between leading horizontal rules — only treat block as frontmatter when at least one line is key: value (empty block allowed) — reader must not lose text — cost if wrong: none.
Ruling: fold Minor 3 — sanitizer FORBID_ATTR adds id (documents cannot collide with app element ids; headings use data-slug).
Task 10: minor (deferred): toHtml unsafe alone (Task 11 render composes sanitize); remote <img>/<input>/<button> allowed by sanitizer (CSP blocks remote img, Task 11 placeholders); one-line $$a$$ unsupported; [[ rescans quadratic; friendlyName / only; sanitizer edge tests (entity javascript:, svg href) missing
Task 10: fix round 1/5 (3 addressed, 0 open — mathBlock regex, frontmatter gate, forbid id; commits 543962d..0ee47a0)
Task 10: minor (deferred): comment/list-only YAML blocks render as text; ---

--- dropped as empty block; heading ids must be added after sanitize
Task 10: complete (commits f387515..0ee47a0, review clean)
Task 11: dispatched (base 0ee47a0, model sonnet)
Ruling: accept Task 11 test fixture-root change (fileURLToPath instead of new URL(..., import.meta.url)) — Vite rewrites the URL literal under jsdom; same directory, no assertion change.
Ruling: add @types/node devDependency and "node" to tsconfig types (in Task 11 fix round) — tests legitimately import node:fs; Task 12 runs svelte-check over src — cost if wrong: one dev dependency.
Ruling: Task 11 Important 1 — forbid video/audio/source/picture/track/image/use tags and srcset/poster attrs in sanitizer; images() builds fresh <img> (src/alt/title only); render parses+enhances inside an inert document (createHTMLDocument) then adoptNode — output must not reference the internet even before CSP — cost if wrong: authors lose embedded video/audio (out of scope for v1).
Ruling: Task 11 Important 2 — enhance first strips data-kind/path/slug/url/target/src/alt from every element (only enhance sets them) — prevents forged link/remote-image metadata.
Ruling: Task 11 Important 3 — anchors left unclassified (no href, or SVG anchors) lose href and xlink:href.
Ruling: Task 11 Important 4 — replace vacuous onerror render test with forged data-kind anchor, svg xlink link, srcset image, video, onclick paragraph cases.
Ruling: fold Minors — CODE_LABELS own-property lookup; anchor and internal-link slugs passed through slugify so #Passwords matches data-slug=passwords; plus @types/node ruling.
Task 11: minor (deferred): mailto labelled "opens in your web browser"; file:/data: links stripped by DOMPurify before refused applies; leading ../ beyond root resolves to same-named in-root file; empty alt <p>; alt duplicated in figcaption; fileIndex built twice; resolveWiki first-match order depends on files order
Task 11: fix round 1/5 (7 addressed, 0 open; commits 20f4afc..9e15367)
Ruling: Task 11 re-review out-of-scope finds <input type=image src=remote> and background= attr still load remote images — same constraint as Important 1, so fix in round 2: FORBID_ATTR background; enhance removes any input not type=checkbox (task lists need checkboxes) — cost if wrong: none.
Task 11: minor (deferred): SVG feImage/gradient/pattern and MathML href survive sanitizer (no id so unreferenceable; CSP blocks)
Task 11: fix round 2/5 (2 addressed, 0 open — background attr, non-checkbox inputs; commits 9e15367..87799f1)
Task 11: complete (commits 0ee47a0..87799f1, review clean)
Ruling: Task 12 Step 6 (9-step manual check in the running window) cannot be observed by a subagent; implementer runs all automated checks plus a launch smoke run; the manual checklist goes to the user at finish — cost if wrong: visual defects found later by the user.
Task 12: dispatched (base 87799f1, model sonnet)
Ruling: Task 12 Important 1 — request token (seq) bumped in selectCollection and openDocument; results dropped when stale; capture collection/tree before await — slow/unplugged drives make the race realistic.
Ruling: Task 12 Important 2 — add onauxclick={onPageClick} so middle-click cannot open/navigate; Rust on_navigation allow-list deferred to Plan 4 (link dialog).
Ruling: fold Minors — describeError uses Object.hasOwn + ErrorCode allow-list with tests (unknown code, Internal with details); selectCollection clears notice; broken-link notice becomes MESSAGES.BrokenLink without the raw target (global rule: never show raw paths; plan-mandated text overridden).
Task 12: minor (deferred): LibraryReset notice cleared by first document open; no explanation when every collection unavailable; no App.svelte component tests; isWindows via userAgent; enhance missing-image text shows raw src (Plan 4 messages pass)
Task 12: fix round 1/5 (4 addressed, 1 new open — auxclick runs app navigation on right/middle click; commits 56d9ddb..2bfd124)
Task 12: minor (deferred): onMount late selectCollection can override a folder picked during startup; TreeTruncated notice overwritten by openDocument
Task 12: fix round 2/5 (1 addressed, 0 open — auxclick returns after preventDefault; commits 2bfd124..45d497e)
Task 12: minor (deferred): auxclick branch untested (DOM events); right-click context menu still appears
Task 12: complete (commits 87799f1..45d497e, review clean)
Final review: dispatched (range 1fcc8f2..45d497e, model opus)
Final review: With fixes — Important: I1 MathML href navigation escape + no nav guard (macOS/Linux); I2 sync commands block UI (spec 5); I3 failed startup load then save erases collections.
Ruling: fix I1-I3 plus minors M1-M6,M8 in one wave (final-fix-brief.md) — nav guard pulled forward from Plan 4 because CSP does not govern navigation (earlier ledger reasoning wrong) — cost if wrong: small.
Ruling: final minors deferred to later plans: canonicalize failure on virtual drives (manual check), non-UTF-8 root serialization (Plan 5), core:default capability breadth (narrow when image features enabled), panic-to-error ownership (Plan 4), .bak overwrite (Plan 2), lock poisoning (Plan 4).
Final fix wave: dispatched (base 45d497e, model sonnet)
Final fix wave: re-review all addressed (commits 45d497e..6b3e706)
Task final: parked — App.svelte loadLibrary startup error hides all collections (incl. sample) for the session — Ruling: real, deferred to start of Plan 2 (screen rework touches onMount) — cost if wrong: a user with unreadable library sees only an error until restart/fix.
Task final: parked — responder dropped if asset::respond panics inside spawn_blocking — Ruling: same panic sources as before; panic-to-error owned by Plan 4.
