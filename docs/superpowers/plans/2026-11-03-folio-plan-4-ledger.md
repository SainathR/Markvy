# SDD ledger — plan: docs/superpowers/plans/2026-11-03-folio-plan-4-privacy-and-help.md

Branch feat/folio-plan-4 from main ce0a473. Spec amendments A8–A10 committed b682e0d. Approved by product owner ("Approve, subagent-driven").

## Pre-flight scan

| Tasks | Produces → consumes | Found |
|---|---|---|
| T1/T2 | error codes, net module; T2 wraps T1's fetch_remote_image in `logged` and adds a state param | consistent |
| T1/T2 (check-readonly.mjs) | T1 refactors to scan()+findNetwork; T2 edits ALLOWED_FILES + message | consistent, sequential |
| T1–T2/T3 | command names/args fetch_remote_image{url}, open_external{url}, open_log_folder, forget_collection{collectionId} → core.ts | match |
| T3/T4 | RemoteImage type, Prefs.remoteImages → EnhanceContext.remoteImages, remote.ts | consistent |
| T3/T6 | allowSite/forbidSite/clearHistory/resetLibrary/closeCollection, isAppError/errorDetails → store | consistent |
| T4/T6 | hostOf/dataUrl → store | consistent |
| T5/T8 | Help CSS (.promise, .help-grid, .radio-list, .shortcuts, .faq) → HelpView | consistent |
| T6/T7–T9 | store fields/methods (externalUrl, imageReview, brokenLink, helpOpen, lastError, shownImages, report, …) | consistent |
| T7/T9, T8/T9 | dialogs + HelpView mounted in App; HelpView uses Dialog for confirms | consistent |
| T1 self | 8 net tests + 1 errors test; serve() helper | consistent |
| T2 self | external/log/state/commands tests; NUL-byte hygiene step | consistent |
| T3 self | edits existing library test key (allowedImageSites now owned) | consistent |
| T4 self | render.test may need its helper for a context override (brief allows) | consistent |
| T5 self | removes DROP; test updated | consistent |
| T6 self | replaces describeError notices with report(); resetPrefs keeps privacy prefs | consistent |
| T7–T9 self | components without unit tests; svelte-check + T9 manual | see R1 |

Ruling: R1 component tasks (T7–T9) carry no unit tests, verified by svelte-check, the store's tests and Task 9's manual checklist — same as Plans 2–3 — cost if wrong: a component regression surfaces only in the manual check.

## Tasks
Task 1: dispatched (base b682e0d, sonnet)
Task 1: review 1 (2e55f33, opus): Needs fixes — I1 ureq connect phase uses default 30 s, so the spec's 10 s limit fails for hosts that drop packets (plan-mandated; DNS unbounded in ureq).
Ruling: R2 accept I1 (.timeout_connect) and promote cheap hardening minors: no https→http downgrade on redirect (https_only when the approved URL is https), refuse URLs carrying a username/password, mime must match ^image/[a-z0-9.+-]+$, a redirect-to-file: test, TcpListener in NETWORK_PATTERNS — spec §6 network rules are binding and these are a few lines — cost: a picture behind an https→http redirect won't load.
Task 1: minor (deferred): redirects may leave the approved host (browser-like); redirects(5) follows 4 hops; check script ignores Cargo.toml package renames; no slow-drip/lying-length tests; User-Agent names ureq; ImageFailed loses the underlying error (nothing in the log for TLS/proxy failures).
Task 1: fix round 1/5 (6 addressed, 0 open; commits 2e55f33..ed72eb7) — found & fixed a ureq 2.12.1 panic on host-less redirect Location: redirects now followed by hand (each hop re-checked, shared 10 s budget).
Task 1: minor (deferred): any 3xx treated as redirect (fails closed); no block on loopback/private addresses (spec silent); no system proxy used — pictures won't load on proxy-only networks.
Task 1: complete (commits b682e0d..ed72eb7, review clean)
Task 2: dispatched (base ed72eb7, sonnet)
Task 2: review 1 (22e0987, opus): Needs fixes — CRITICAL (plan-mandated) `mailto:` keeps `/ \ " space ..` unencoded, so a document link like `mailto:x/../../Windows` reaches Windows as a folder path (opens Explorer) and quotes/spaces could inject mail-handler arguments; `https://../Windows` host resolves under cwd.
Ruling: R3 accept the critical: strict mailto (address + optional ?query; refuse / \ " whitespace and control chars), http(s) host must have a real label (no empty/dot-only labels), and refuse anything that exists as a local path; fix the false doc comment; tests for each. Promote log Minors 1–2 (interleaved lines from parallel commands; failed rotation drops entries / blocks logging) — cheap correctness — cost: a few lines.
Task 2: minor (deferred): forget racing get_tree/search can resurrect an index+watcher for an unlisted folder; failed persist after remove leaves memory/disk out of step; log entries carry no context beyond the code; open_log_folder on Windows may open the parent with `logs` selected (manual check); ShellExecuteExW called without CoInitialize (manual check).
Task 2: fix round 1/5 (2 addressed, 1 open — mailto fragment not refused (`#\..\Windows\...` reaches ShellExecute); commits 22e0987..3a66988)
Ruling: R4 also promote two out-of-scope privacy items into round 2: mailto query keys allowlisted to to/cc/bcc/subject/body (blocks `attach=` local-file attachment tricks), and refuse userinfo in http(s) links (spoofing `trusted.com@evil.com`) — cheap, privacy-relevant — cost: exotic mailto keys (e.g. in-reply-to) refused.
Task 2: minor (deferred): concurrent rotation can lose the old log; `mailto:?to=a@b` refused (usability).
Task 2: fix round 2/5 (3 addressed, 0 open; commits 3a66988..27d6fc5)
Task 2: minor (deferred): raw `;` in a mailto query not refused (only matters for a handler splitting on `;`); to/cc/bcc values checked raw only.
Task 2: complete (commits ed72eb7..27d6fc5, review clean)
Task 3: dispatched (base 27d6fc5, sonnet)
Task 3: minor (deferred, final-wave candidate): stray edit `LibraryTab ='recent'` (missing space) in library.ts.
Task 3: minor (deferred): isAppError doesn't type-check details; closeCollection leaves back/forward history entries into the removed folder (Back shows NotFound); extra library tests (toRaw writes allowedImageSites, forbid absent host).
Task 3: complete (commits 27d6fc5..bdb5037, review clean)
Task 4: dispatched (base bdb5037, sonnet)
Task 4: minor (deferred): enhance re-implements hostOf (keep raw-src fallback); host not bold as in prototype; author `<figure class="remote-img">` inflates details count / is skipped by find (cosmetic); dataUrl mime check case-sensitive.
Task 4: complete (commits bdb5037..8a6c304, review clean)
Task 5: dispatched (base 8a6c304, haiku)
Task 5: minor (deferred, final-wave candidate): restore `.toc-link`/`.divider` assertions in port-styles test; `.result`/`.findbar` assertions satisfied by OVERRIDES substrings (pre-existing).
Task 5: complete (commits 8a6c304..a6dd044, review clean)
Task 6: dispatched (base a6dd044, sonnet)
Task 6: review 1 (1b877d0): Needs fixes — all plan-mandated: I1 forgetCollection sets the new active folder without loading its tree (sidebar stuck on "Loading…"); I2 listCollections failure leaves the removed folder listed/active and the success notice hides the error; I3 a picture fetch in flight re-shows after block/reset (§4.3 "never show").
Ruling: R5 accept I1–I3; promote cheap minors: resetWorkspace also clears search state (results, resultsQuery, query.q, searchIndexing) and open dialog state (imageReview, brokenLink, externalUrl, detailsKey); forbidSite drops already-shown pictures of that host; "Don't ask again" switches to direct only after the link actually opened; forgetCollection bumps treeSeq like onUnavailable — cost: ~25 lines + tests.
Task 6: minor (deferred): stale lastError with same code as a later direct notice could show Copy details wrongly; reset saves an empty session object rather than null (harmless); favoriteCollections/find entries for a removed folder remain (filtered in display).
Task 6: fix round 1/5 (7 addressed, 0 open; commits 1b877d0..44602f7)
Task 6: minor (deferred, final-wave candidate): resetWorkspace doesn't bump searchSeq (an in-flight search can write results after reset).
Task 6: complete (commits a6dd044..44602f7, review clean)
Task 7: dispatched (base 44602f7, haiku)
Task 7: minor (deferred, final-wave candidate): ExternalLinkDialog's first focusable is the "Don't ask again" checkbox (stray Space toggles a persistent pref) — focus Cancel/primary instead; long host in "Always show pictures from {host}" button unbounded (needs overflow-wrap).
Task 7: minor (deferred): straight apostrophes in HelpDialog; empty folder name renders `in “”`; home help says "its folder opens too" (true per A1).
Task 7: complete (commits 44602f7..0797a9a, review clean)
Task 8: dispatched (base 0797a9a, haiku)
Task 8: review 1 (34315ea, opus): Needs fixes — both plan-mandated wording overclaims vs spec §1 criterion 5: I1 limitation omits that the website-link question is also asked only by the window, and a bypass could make Folio contact any website (data in the address), not just "fetch a picture"; I2 "only files it writes are settings and log" ignores WebView2's profile/cache under %LOCALAPPDATA%, and the build check only covers Folio's own code.
Ruling: R6 accept I1–I2 with the reviewer's narrower wording, plus Minors on lines 71 ("Everything it reads comes through Folio…") and 73 ("Every document…") — spec §1 criterion 5 outranks the plan text; the spec §6 limitation paragraph should be widened to match (proposed amendment A11, for the product owner at finish) — cost: none in code.
Task 8: minor (deferred): "Link/Picture setting saved." shown even when settings can't be saved (start-up read failed); promise cards h3 under h1; helpTitle says "security" (allowed); radio accessible names include the <small> text.
Task 8: fix round 1/5 (2 addressed + 2 minors, 0 open; commits 34315ea..33747f8)
Task 8: complete (commits 0797a9a..33747f8, review clean)
Task 9: dispatched (base 33747f8, sonnet) — step 7 manual check reserved for product owner.
Task 9: minor (deferred, final-wave candidate): failing always-allowed pictures refetched on every remount / any other success (cache failures for the run); focus after "Remove from list" falls to body (move to Folders heading).
Task 9: minor (deferred): find highlights don't cover a swapped-in picture's caption; MESSAGES.BrokenLink possibly unused.
Task 9: complete (commits 33747f8..ae5f0cc, review clean)
Final review: dispatched (opus)
Final review (opus, ce0a473..ae5f0cc): With fixes — I1 Copy details unreachable for the checklist's error path (onUnavailable sets notice without lastError); I2 ExternalLinkDialog says "Folio itself doesn't connect to websites" (false since net.rs — criterion 5); I3 website dialog's first focus is the "Don't ask again" checkbox. Fix-before-merge trivials: LibraryTab spacing, port-styles .toc-link/.divider assertions, resetWorkspace searchSeq++, long host wrap in dialog buttons. Recommended: failed allowed pictures refetched per remount; focus loss after picture swap / folder removal; forbidSite doesn't bump imageGen; external-link icon missing (help text mentions it); punycode display of look-alike hosts.
Ruling: R7 one fix wave covering I1–I3, the four trivials, and the recommended minors 5–9 (all small, user-visible); checklist wording (file: → ftp:/tel:, Copy details via picture failure) fixed in the manual checklist, not code; housekeeping (unused BrokenLink/help key, untranslated help label, straight apostrophes) included as trivial; in-pane document errors without Copy details left as-is (scope ruling, Plans 2–3 behaviour) — cost: one more re-review.
Final fix wave: 14/14 addressed (commit a25880d), re-review approved.
Final: minor (deferred): a fetch in flight during reset/block that then fails is remembered as failed (skips auto-load until explicit Show); forbidSite's generation bump also drops other sites' in-flight fetches (placeholder until next mount).
Proposed amendment A11 (for product owner): widen spec §6 "Stated limitation" to match the Privacy & Help wording — both the website-link question and the picture question are asked by the window; a bypass could make Folio contact or open a website without asking.
Plan 4 complete — awaiting product owner's manual check (Task 9 Step 7, with checklist corrections: use ftp:/tel: for refused links; Copy details via a failed picture).
