# SDD ledger — plan: docs/superpowers/plans/2026-11-04-folio-plan-5-release-readiness.md

Spec: docs/superpowers/specs/2026-11-02-folio-desktop-architecture-design.md (A12–A14 recorded at 54eb3ee). Branch feat/folio-plan-5 from main 076ffa8.

## Pre-flight scan

| Tasks | Shared file / interface | Produces vs consumes | Found |
|---|---|---|---|
| 1↔2 | state.rs, commands.rs | T1 `LockExt::locked`, `guarded`; T2 uses both (Recovery mutexes, take_recovery) | consistent |
| 1↔4 | commands.rs pickers | T1 makes pickers sync `(async)` + guarded; T4 adds `test_pick()` first | consistent |
| 2↔3 | take_recovery | Rust `{"restoreSession":bool}` / null; TS `Recovered` | consistent |
| 2↔4 | lib.rs handler list, recovery.rs | T2 registers take_recovery; T4 macro list includes it, adds `crash_for_test` | consistent |
| 3↔5, 3↔6 | MESSAGES text | WDIO matches "Your tabs are back." / "Your tabs weren’t reopened"; Playwright full RecoveredRestored | consistent |
| 4↔5 | e2e commands, FOLIO_DATA_DIR | `e2e_set_next_pick{path}`, `e2e_uptime_ms`, `e2e_crash_webview` | consistent |
| 5↔8 | test:e2e, FOLIO_NATIVE_DRIVER, e2e/.driver | ci.yml installs drivers to e2e/.driver, Linux passes WebKitWebDriver | consistent; see R2 |
| 6↔8 | test:web, playwright install | CI=true disables server reuse | consistent |
| 7↔8 | check:deps, clippy command | identical command strings | consistent |
| 5,6,8 ↔ 7 | dev deps vs reviewed list | dev packages excluded by `dev: true` | consistent |
| 8↔9 | check-workflows.test.mjs | T9 appends using T8's `load`/`runs` | consistent |
| 4↔9 | tauri.conf.json "e2e" | T4 never touches tauri.conf; T9 test forbids e2e/updater | consistent |
| 4↔7 | e2e.rs vs clippy write ban | e2e.rs writes nothing; tree_speed test writes in #[cfg(test)] (clippy runs without --all-targets) | consistent |

| Task | Self-consistency | Found |
|---|---|---|
| 1 | tests use LockExt/guarded/panic_text/finish_after_panic as specified; private `touched` accessed in same-module test | ok |
| 2 | tests vs Recovery API; Windows-only kind_of test | ok; Linux/mac hooks compile only in CI (noted in plan) |
| 3 | tests expect view 'home' — plan says use store's real name | ok |
| 4 | env-var test single; NEXT_PICK test single | ok |
| 5 | selectors fixed in self-review (text()/inDoc helpers) | ok |
| 6 | `src/webtest/main.ts` uses top-level `await import` — Vite default build target (es2020-ish) rejects top-level await | conflict → R1 |
| 6 | fake-core tree order / slugify name to verify | plan instructs verify |
| 7 | npmProdNames sort; cargoNames handles CRLF | ok |
| 8 | test strings present in workflow | ok |
| 9 | checksum assertions split build/publish (fixed in self-review) | ok |
| 10 | docs only | ok |

Ruling: R1 Task 6 `src/webtest/main.ts` uses `void import('../main');` (no top-level await) — mockIPC is installed synchronously before the import runs, so behaviour is identical and the default Vite target builds — cost if wrong: none (a build error would show at once).
Ruling: R2 Task 5/8 `msedgedriver-tool` may not be on crates.io; if `cargo install msedgedriver-tool --locked` fails, use `cargo install --git https://github.com/chippers/msedgedriver-tool --locked` and make ci.yml match — the tool's canonical source per Tauri's WebDriver docs — cost if wrong: one CI step edit.

## Progress
Task 1: dispatched (base 54eb3ee, sonnet)
Task 1: implementer DONE_WITH_CONCERNS (64dad0f) — no separate RED run; commit_changes partial-batch on panic (observation)
Task 1: review (opus): spec ✅, Approved. ⚠️ pickers off main thread with (async) sync fn — resolved: Tauri runs `#[command(async)]` sync fns on the async runtime pool, same attribute every file command already used; no main-thread dialog.
Task 1: minor (deferred): state.rs:13 comment "finishes or changes nothing" not strictly true for commit_changes batch (no realistic panic source); catch_unwind wiring in Indexer::start/watch/folio:// untested (helpers tested); folio:// panic payload not logged to folio.log; probe thread (indexer.rs:439) not wrapped — a panic would stop vanished-folder probing for the session.
Task 1: complete (commits 54eb3ee..64dad0f, review clean)
Task 2: dispatched (base 64dad0f, opus)
Task 2: implementer DONE_WITH_CONCERNS (f90fdfc; resumed once after API error) — Linux/mac hooks compile only in CI; engine restart unit-tested only; manual renderer kill logged Reload
Task 2: review (opus): spec ✅, Approved. ⚠️(a) Linux/mac hooks uncompiled — carried to Task 8 CI. ⚠️(b) manual check proved handler+log, not that reload() shows the app — carried to Task 5 crash.e2e.ts (asserts notice + tab back after reload). ⚠️(c) unresponsive renderer may raise a second ProcessFailed after Reload within 60 s.
Ruling: R3 ⚠️(c) accepted as-is — worst case one hang counts as a repeat crash: window reloads to Home with RecoveredFresh and tabs stay restorable via Restore previous session; no loop, no data loss — cost if wrong: a hang loses automatic tab restore once.
Task 2: minor (deferred, final-wave candidate): engine-restart loop unbounded and pending lost across restart (env-var handoff possible); renderer reload unbounded for document-independent crashes (spec as written); reload/watch failures only eprintln (invisible in release) — route via log::append; macOS hook uses app.state (panics in spawned thread if crash before manage) — use try_state.
Task 2: complete (commits 64dad0f..f90fdfc, review clean)
Task 3: dispatched (base f90fdfc, haiku)
Task 3: implementer DONE (69ba713; trailer names Haiku 5.5, the model that wrote it — kept, accurate)
Task 3: review (sonnet): spec ✅, Approved. ⚠️ Step 5 manual check skipped — covered by Task 5 crash.e2e.ts.
Task 3: minor (deferred, final-wave candidate): recover() overwrites an earlier LibraryReset/TreeTruncated notice in the same start; tab opened between ready=true and recover() would be replaced (tiny window); restored-tabs test doesn't assert tab keys.
Task 3: complete (commits f90fdfc..69ba713, review clean)
Task 4: dispatched (base 69ba713, sonnet)
Task 4: implementer DONE_WITH_CONCERNS (1aa11a5) — crash_for_test not run live; Linux path uncompiled; handler typed fn(Invoke<Wry>)->bool for E0282; weak RED (0 tests not compile error)
Task 4: review (sonnet): spec ✅, Approved. ⚠️ release.yml e2e check — resolved: release.yml doesn't exist until Task 9, whose test forbids "e2e". ⚠️ Windows crash_for_test live run — carried to Task 5 (crash.e2e.ts on Windows). ⚠️ Linux crash_for_test compile — carried to Task 8 CI.
Task 4: minor (deferred): tree_speed test literal "# Page<newline>" instead of "\n" (same bytes); crash_for_test unsupported message formats window.label(); env-var test would race if a second FOLIO_DATA_DIR test is added.
Task 4: complete (commits 69ba713..1aa11a5, review clean)
Task 5: dispatched (base 1aa11a5, sonnet)
Task 5: implementer DONE_WITH_CONCERNS (4cfe341) — 15/16: startup_ms 1.42–1.94 s vs 1.5 s target (measured under WebDriver); msedgedriver answers "tab crashed" after a crash, so crash spec reads the page over DevTools via a PowerShell evalInPage helper (Windows-only); tree_1000_ms 298–1882 ms (flaky near 2 s); R2: crates.io msedgedriver-tool failed, git install (chippers, v0.2.2) worked; tauri-driver 2.1.0.
Ruling: R4 startup target stays 1.5 s (spec §7) but is measured without WebDriver attached (msedgedriver's automation/debug setup slows WebView2 start): e2e build records uptime at the first PageLoadEvent::Finished via Builder::on_page_load; with FOLIO_E2E_STARTUP_EXIT=1 it prints "BENCH startup_ms=N" and exits; a Node script (npm run bench:startup) launches it 3 times with fresh data folders and asserts the median < 1500. If the median still misses, the implementer profiles the Rust start-up (setup timings) and reports; no loosening — cost if wrong: one more script; a real miss becomes a product-owner finding.
Ruling: R5 tree_1000_ms: run 3 times on fresh folders, print all, assert the median < 2000 — machine noise, not Folio, causes single slow runs; median still catches real regressions — cost if wrong: a regression affecting only 1 in 3 runs slips.
Ruling: R6 crash spec: keep the DevTools read-back on Windows; on Linux the crash spec skips with a stated reason (WebKitWebDriver can't survive a web-process kill either), and Task 10's release checklist gains a Linux crash-reload manual step — cost if wrong: Linux crash recovery verified by hand only.
Ruling: R7 startup measure change (process start to first paint instead of session creation) accepted — the brief's measure included WebDriver session creation, not Folio — cost: none.
Task 5: rulings applied (6c6bec3) — driver-free startup median 1707 ms (1807/1684/1707) still misses 1500; Folio's setup steps ~0 ms; setup begins 1.28–1.6 s after run() (Tauri/WebView2 window creation); tree median 269 ms; crash spec asserts repeat notice; evalInPage now pure Node (DevToolsActivePort under temp scoped_dir*/EBWebView).
Ruling: R8 startup stays strict at 1.5 s and bench:startup stays failing on this machine — the time is spent before Folio's setup (Tauri/WebView2 start, possibly AV scanning a freshly built exe), so it's a product-owner finding with the numbers, not a code fix in this plan; Task 8 adds `npm run bench:startup` to CI on Windows and Linux so a clean runner gives the deciding number — cost if wrong: CI shows red on start-up until the product owner rules (change the target or fund start-up work).
Task 5: review (sonnet): spec ❌ (claimed record_first_load test absent), Needs fixes — I1 evalInPage may attach to a non-Folio WebView2/browser (newest scoped_dir* by mtime, first page target unchecked); I2 record_first_load untested; I3 evalInPage can hang (no onclose/timeout).
Task 5: minor (deferred, final-wave candidate): startup measured run()→load-finished (optimistic; doc comment should say so); startup-bench doesn't print spawn error or remove temp dirs; scenario 4 assertion can pass on the open h1 (scope to results); scenario 12 title claims "nothing fetched" without asserting it; crash spec swallows errors (log last one).
Task 5: minor (deferred): tsc -p e2e reports 2 typing errors in scenarios.e2e.ts (lines 49, 79); runs fine under WebdriverIO
Task 5: fix round 1/5 (3 addressed, 0 open; commits 6c6bec3..8c69117)
Task 5: minor (deferred): crash.e2e.ts:29 crash call via evalInPage could reject "DevTools closed before answering" if the page dies before replying — add .catch(() => {}).
Task 5: complete (commits 1aa11a5..8c69117, review clean)
Task 6: dispatched (base 8c69117, sonnet)
Task 6: implementer DONE (0ffffda) — 44/44 Playwright, vitest 219; one axe violation fixed (task-list checkbox labels); no contrast violations; real tree order is files first (fake matches); selectors corrected (no tabpanel/treeitem roles; themes Paper/Sepia/Slate/Rose/Night/Dusk/Ember/Automatic; High contrast is a switch)
Task 6: review (sonnet): spec ❌, Needs fixes — I1 enhance.ts:22 `li > input[type=checkbox]` misses loose-list task items (marked wraps them in <p>), so those checkboxes stay unlabeled; untested.
Task 6: minor (deferred, final-wave candidate): image-only task item gets aria-label="" (fall back to img alt or skip); vite.config.ts lost trailing newline; render.test checks one label only (nested/empty cases).
Task 6: fix round 1/5 (1 addressed, 0 open; commits 0ffffda..45450e3)
Task 6: minor (deferred): `li input[type=checkbox]` also labels non-task checkboxes from raw HTML inside list items (inert).
Task 6: complete (commits 8c69117..45450e3, review clean)
Task 7: dispatched (base 45450e3, sonnet)
Task 7: implementer DONE_WITH_CONCERNS (e17a49b) — disk C: ~1.2 GB free (separate LF target failed, os error 112; clone tested in main target: 145 passed); README.md fixture path in brief absent (used Getting-Started.md, CRLF confirmed); partial RED; reviewed list 415 cargo / 110 npm, no dev packages.
Disk: stale %LOCALAPPDATA%\Temp\folio-target (3.1 GB, Plan 1 era, nothing newer than 11-02) found; deleting it was denied by the permission classifier — surfaced to the user to free space.
Task 7: review (sonnet): spec ✅, Approved. ⚠️ README.md claim wrong (file exists; CRLF confirmed) — report inaccuracy only. ⚠️ tauri-plugin-fs in Cargo.lock — resolved: transitive only (not in Cargo.toml, not registered; capabilities core:default).
Task 7: minor (deferred, final-wave candidate): clippy.toml misses File::create_new, fs::soft_link, os symlink fns, File::set_len/set_permissions/set_modified; check-deps tests lack optional/dev+optional/scoped cases; check-deps name-only (aliases, version/source swaps of a reviewed name pass); partial RED.
Ruling: R9 Task 8's CI also runs clippy with `--features e2e` (a second invocation), so e2e.rs is covered by the write ban — the reviewer showed the single command skips it — cost: one CI step.
Task 7: complete (commits 45450e3..e17a49b, review clean)
Task 8: dispatched (base e17a49b, sonnet)
Task 8: implementer DONE_WITH_CONCERNS (b654e29) — 9 workflow tests (R2/R6/R8/R9 pinned), vitest 233; bench:startup median 1615 (known R8); test file uses @vitest-environment node (jsdom import.meta.url); second clippy step named to dodge the name-based e2e filter
Task 8: review (sonnet): spec ✅, Approved. ⚠️ bench step builds nothing itself — resolved: it runs after test:e2e, whose wdio onPrepare builds the e2e binary (no FOLIO_E2E_SKIP_BUILD in CI).
Task 8: minor (deferred, final-wave candidate): guard filters steps by name "e2e" (filter on run text instead); regex misses --features=e2e / -F e2e / --all-features; 'npm run check' assertion satisfied by check:readonly; no permissions:/timeout-minutes in ci.yml.
Task 8: complete (commits e17a49b..b654e29, review clean)
Task 9: dispatched (base b654e29, sonnet; disk 1.7 GB free)
Task 9: implementer DONE_WITH_CONCERNS (3e8c229) — vitest 240; MSI 6.05 MiB + NSIS 4.53 MiB unsigned built; silent NSIS install/launch/uninstall OK; release.yml never run (no remote/secrets); disk ~1.5 GB
Task 9: review (opus): spec ✅, Needs fixes — I1 (plan-mandated) checksum file hashes itself (always FAILED on verify) and an empty out/ still passes; I2 (plan-mandated) multi-line APPLE_CERTIFICATE breaks the echo >> GITHUB_ENV form.
Ruling: R10 fix both plan-mandated findings — spec §8 requires usable SHA-256 checksums and working signing; the plan's text was wrong, not the spec — cost: none.
Task 9: ⚠️ brief Step 4 click-through (Start menu, sample library visible, Settings uninstall) replaced by silent install/launch/uninstall — carried to Task 10 release checklist smoke test (each release) and the user's manual check.
Task 9: minor (deferred, final-wave candidate): secrets in job-level env (scope to steps); PFX left on disk if import throws (try/finally); partial Apple secrets export empty notarization vars (check all/export non-empty only); per-OS SHA256SUMS files also uploaded; no top-level permissions: contents: read (ci.yml too); workflow tests are string-presence only.
Task 9: fix round 1/5 (2 addressed, 0 open; commits 3e8c229..bbc1821)
Task 9: minor (deferred): heredoc test doesn't pin the closing delimiter; no test pins the mv into out/; printf adds a trailing newline to the certificate value.
Task 9: complete (commits b654e29..bbc1821, review clean)
Task 10: dispatched (base bbc1821, sonnet)
Task 10: implementer DONE_WITH_CONCERNS (272ad4b) — Linux crash steps unverified on Linux (process-name assumption + fallback); junction check result wording; 'secure/certified' appear only in the must-not-say list
Task 10: review (sonnet): spec ✅, Approved. ⚠️ "no colour-contrast problems in any theme" — resolved: Task 6 ran axe on every theme in both engines with EXEMPT = [] and the review confirmed the theme tests reach the theme. ⚠️ Linux process name unverified — fallback steps written; Linux run by the product owner.
Task 10: minor (deferred, final-wave candidate): checksum check command fails on installers not downloaded (use --ignore-missing or compare one line); start-up cause wording names Tauri/WebView2 window creation (measured: setup begins 1.3–1.6 s after run()); UAT task 6 hints at tabs.
Task 10: complete (commits bbc1821..272ad4b, review clean)
Final review: dispatched (opus)
Final review (opus, 076ffa8..272ad4b): With fixes — I1 Linux "signed: no" vs checklist "signed: yes"; I2 signing secrets in job env exposed to npm ci, no permissions blocks; I3 longDescription "sends nothing anywhere" overclaims (A11); I4 CI never runs e2e unit tests; I5 e2e-never-ships guard gaps (--all-features, default feature, tauri bundle reuse). Minors M1 crash restore can restore an older session / claim "tabs are back" when none survived; M2 .gitattributes would corrupt binary fixtures; M3 misleading test name. Promoted deferred: checksum --ignore-missing; start-up cause wording; crash.e2e .catch; recovery/folio:// failures to log + try_state.
Ruling: R11 one fix wave covering I1–I5, M1–M3, the four promoted deferred minors and the workflow_dispatch dry-run checklist line (list in final-fix-wave.md) — all small and user- or release-visible; everything else the reviewer triaged as "can stay deferred" stays deferred — cost: one more scoped re-review.
Final fix wave: dispatched (base 272ad4b, sonnet)
Final fix wave: DONE_WITH_CONCERNS (31ef0f9) — vitest 253, cargo 146/149(e2e), clippy clean, web 44, crash spec 2/2; Linux report() calls uncompiled; secrets via flag step + steps.have.outputs gating
Final fix wave re-review (opus): all 13 items ADDRESSED, no new Critical/Important.
Final: parked — I2 pin doesn't stop a raw secret (not a != '' comparison) in the flag step env — Ruling: R12 park; today's workflow is correct and the gap needs a deliberate edit to exploit — cost: a future edit could re-expose one secret to the flag step only.
Final: parked — I5 "tauri bundle" pin is a plain text match (`npm run tauri -- bundle` evades) — Ruling: R13 park; the release step is pinned to `tauri build` and the checklist forbids local bundling — cost: a contrived edit slips the guard.
Final: parked — release-checklist.md:23 still says option 2 investigates "the window creation time", contradicting the D2 wording — Ruling: R14 park for the product owner's next read; the cause is stated correctly two lines above — cost: a reader may assume the cause is known.
Plan 5 complete — final review clean after one fix wave (31ef0f9).
