# Markvy release checklist

Use this to prepare the first release and every release after it. It covers what the product owner must provide (spec §9), what to do each release, two manual checks from Plan 1, and what the release notes may say.

## 1. Open decisions for the product owner

### Start-up speed (open)

Spec §7 sets a target: Markvy starts in under **1.5 seconds**.

| Measurement | Result |
|---|---|
| Development machine, `npm run bench:startup` (run without the test driver) | about **1.6 to 1.7 seconds** |
| Target in spec §7 | **under 1.5 seconds** |

Where the time goes: before Markvy's own code runs. Markvy's own set-up steps take about 0 ms, and set-up begins 1.3 to 1.6 seconds after the app starts. The cause of that earlier time is not yet isolated. It may be Tauri and WebView2 start-up, or antivirus scanning a freshly built program.

`bench:startup` fails when its median is 1.5 seconds or more, so the CI step will fail if the clean runner is also slow.

**The product owner must decide one of these:**

1. **Change the target.** For example, accept 2 seconds, and update spec §7.
2. **Fund start-up work.** Someone investigates the window creation time and tries to bring it under 1.5 seconds.

**What decides it.** The `bench:startup` step in CI on a clean Windows runner gives the deciding number. Look at that number first. A clean machine may be faster than the development machine.

Record the decision here:

- Decision: ____________
- Decided by, and date: ____________

### Other items that need confirmation

- The app ID `com.sainath.markvy` and the publisher name "Sainath Racherla" (Markvy is a personal project, 2026-11-19). See item 6 in section 2.
- The independent security review (item 5 in section 2).

## 2. Before the first release: what the product owner provides

Tick each one when done.

| # | What | Done |
|---|---|---|
| 1 | **The GitHub repository, with Actions enabled.** Push `main`. `ci.yml` must pass on all three platforms (Windows, macOS and Linux). | |
| 2 | **The Windows code-signing certificate**, added as two repository secrets: `WINDOWS_CERTIFICATE` (the certificate as a base64-encoded PFX file) and `WINDOWS_CERTIFICATE_PASSWORD`. | |
| 3 | **The Apple Developer Program membership**, and the six `APPLE_*` secrets listed below. | |
| 4 | **At least 5 UAT participants.** They run `uat-script.md`. | |
| 5 | **A decision on the independent security review** before public release. | |
| 6 | **Confirmation of the app ID `com.sainath.markvy` and the publisher name "Sainath Racherla".** The app ID can't change after the first release without losing people's saved settings. | |
| 7 | **For the Microsoft Store:** an individual Partner Center account, the reserved name "Markvy", and `privacy-policy.md` approved and published on a public web page. The Store route needs no code-signing certificate. See `microsoft-store.md`. | |

### The six Apple secrets

Set **all six together**. If you set only the certificate, notarization fails.

| Secret | What it is |
|---|---|
| `APPLE_CERTIFICATE` | The Developer ID certificate, base64-encoded |
| `APPLE_CERTIFICATE_PASSWORD` | The password for that certificate |
| `APPLE_SIGNING_IDENTITY` | The name of the signing identity |
| `APPLE_ID` | The Apple ID used for notarization |
| `APPLE_PASSWORD` | The app-specific password for that Apple ID |
| `APPLE_TEAM_ID` | The Apple Developer team ID |

Without the secrets, the build still works. It makes **unsigned** installers. Windows and macOS then show warnings when people install. Don't publish an unsigned build as a public release unless the product owner agrees.

## 3. Each release

| # | Step | Done |
|---|---|---|
| 0 | Before the first tag only: run `release.yml` once by hand (**Actions**, then **Release**, then **Run workflow**, the `workflow_dispatch` trigger) and download its artifacts. CI never bundles installers, so this is the first time they are built. | |
| 1 | Make sure `ci.yml` is green on `main` on all three platforms. | |
| 2 | Raise `version` in `app/src-tauri/tauri.conf.json`, `app/src-tauri/Cargo.toml` and `app/package.json`. All three must match. | |
| 3 | Tag `vX.Y.Z` (for example `v0.2.0`) and push the tag. The release workflow runs on the tag and publishes a **draft** release with `SHA256SUMS.txt`. | |
| 4 | Open the workflow summary. Windows and macOS must each say **signed: yes** (Linux says "not applicable": it has SHA-256 checksums only). A line "Unsigned build" means the secrets are missing. Stop and fix that, or get the product owner's written agreement. | |
| 5 | Download each installer. Check it against `SHA256SUMS.txt` (see "Checking the checksums"). | |
| 6 | Run `macos-checklist.md` on a real Mac. | |
| 7 | Run the installer smoke tests (section 4) on Windows and Linux. | |
| 8 | Run the Linux crash-reload check (section 5). | |
| 9 | Run `accessibility-pass.md` with NVDA, VoiceOver and Orca. | |
| 9a | Editing: the 6 editing scenarios (`app/e2e/specs/editing.e2e.ts`) pass on Windows. A no-op save leaves a file byte-identical on macOS and Linux (run the vitest round-trip suite there: `npx vitest run src/lib/editor`). | |
| 9b | Editing speed (spec §7): a typical page opens for editing in under 300 ms and saves in under 200 ms; a 1 MB page opens in under 1 s; typing on a 1 MB page keeps every frame under 50 ms. Measured in the page's own clock by `app/e2e/specs/editing-speed.e2e.ts` (2026-11-17, Windows, WebView2 157). **Met:** typical page open 27-108 ms (the editor's code is now fetched when an editable page is shown; before that the first open took up to 445 ms), save 27-58 ms; the spec asserts both. **Not met (known failures, skipped in the spec with the measured numbers):** 1 MB open 9.8-14.9 s (was 14.5 s); 1 MB typing 1.0-1.9 s per key (longest task; was 0.85 s, the same within noise), because the browser lays out all 36,000 blocks on every key. 1 MB save (not a spec target) 0.55-1.03 s. Both 1 MB targets need a design change (render and parse only the part of the page on screen); see the Task 14 report. | |
| 10 | For the first release, and after big changes to screens: run `uat-script.md` with at least 5 people. | |
| 11 | Write the release notes as `release-notes-X.Y.Z.md` (copy the last one) and check them against section 8. | |
| 12 | **Publish the draft release.** | |
| 13 | Microsoft Store: build the MSIX with version `X.Y.Z.0` and submit it as an update (`microsoft-store.md`, steps 4 and 7). | |

### Checking the checksums

On Windows (PowerShell), for each file:

```
Get-FileHash .\<installer file name> -Algorithm SHA256
```

On macOS or Linux:

```
shasum -a 256 --ignore-missing -c SHA256SUMS.txt
```

(Use `sha256sum --ignore-missing -c SHA256SUMS.txt` if `shasum` isn't there.) `--ignore-missing` skips the files you didn't download. Every listed file you did download must say **OK**. Any other result blocks the release.

Release installers come only from `release.yml` (`tauri build`). Never ship a local `tauri bundle` made after the whole-app tests: those tests leave an e2e binary in the same target folder.

## 4. Installer smoke tests

The automated release test only used a silent install. These steps check what a silent install can't: the installer's own screens, the Start menu, and uninstalling. Use a clean machine or a clean virtual machine for each.

### Windows: NSIS installer (`setup.exe`)

1. Run the NSIS `setup.exe`. Go through the installer screens. Write down any warning (an unsigned build shows one).
2. Start Markvy **from the Start menu**.
3. Expected: Markvy opens. Select "Explore the sample library". The sample library opens and "README" shows.
4. Close Markvy.
5. Open Settings › Apps. Find Markvy. Uninstall it.
6. Expected: Markvy is gone from the Start menu and from Settings › Apps.

Result: pass / fail. Notes: ____________

### Windows: MSI

Repeat the same six steps with the MSI installer on a clean machine (or uninstall the NSIS one first).

Result: pass / fail. Notes: ____________

### Linux: .deb

1. Install it: `sudo apt install ./Markvy_*.deb`.
2. Start Markvy from the applications menu.
3. Expected: Markvy opens. "Explore the sample library" opens the sample library.
4. Close Markvy.
5. Remove it: `sudo apt remove markvy`.
6. Expected: Markvy is gone from the applications menu.

Result: pass / fail. Notes: ____________

### Linux: AppImage

1. Make the file runnable: `chmod +x Markvy_*.AppImage`.
2. Start it by double-clicking, or run `./Markvy_*.AppImage`.
3. Expected: Markvy opens. "Explore the sample library" opens the sample library.
4. Close Markvy. Delete the file.
5. Expected: nothing is left behind except Markvy's settings folder.

Result: pass / fail. Notes: ____________

## 5. Linux crash-reload check

The automated crash test runs only on Windows. This is the by-hand check for Linux. (macOS has its own steps in `macos-checklist.md`.)

You will end Markvy's web process on purpose. Be careful to end **Markvy's own** process and no other.

**Find Markvy's web process.**

1. Start Markvy. Open the sample library, then any document.
2. In a terminal, find Markvy's own process: `pgrep -x markvy`. It prints a number. This is Markvy's process ID. Write it down.
3. List the web processes that belong to it: `pgrep -a -P <that number> -f WebKitWebProcess`. It should print one line.
   - If it prints nothing, the web process is not a direct child. Run `ps -eo pid,ppid,args | grep WebKitWebProcess`. Follow the `ppid` column up (`ps -o ppid= -p <pid>`) until you reach Markvy's process ID. Use that web process's ID, and end it with `kill <id>` in step 4.
   - Close other programs that use WebKit first, so there is no doubt which process is Markvy's.

**Do the check.**

4. End it: `pkill -P <that number> -f WebKitWebProcess`. This is the same as `pkill -f WebKitWebProcess`, but limited to Markvy's own process. **Don't run `pkill -f WebKitWebProcess` on its own.** It would also end the web views of other programs.
5. Expected: the Markvy window reloads. Your tabs come back. A message says "Markvy had a problem and reloaded. Your tabs are back."
6. Open a document. Within one minute of step 4, repeat steps 2 to 4. The web process has a new ID, so list it again.
7. Expected: the window reloads. The tabs do **not** come back. Home shows. A message says "Markvy had a problem again and reloaded. Your tabs weren’t reopened, in case one of them caused it. You can reopen them with Restore previous session." (This is the `RecoveredFresh` notice.)
8. Choose "Restore previous session". Expected: the tabs come back.

Result: pass / fail. Notes: ____________

## 6. Manual checks carried over from Plan 1

Both checks are on Windows. Use a test folder, not real documents.

### A folder reached through a junction is refused when it points outside the collection

Markvy refuses to read anything outside the folder you opened, even if a shortcut inside the folder points there. A junction is that kind of shortcut. Creating one needs an administrator.

**Steps.**

1. Make two folders: `C:\MarkvyTest\Docs` and `C:\MarkvyTest\Outside`.
2. In `Outside`, make `Secret.md` that says `# Secret` and a line `Nobody should see this.`
3. In `Docs`, make `Home.md` that says `# Home`.
4. Open Command Prompt **as administrator**. Run: `mklink /J C:\MarkvyTest\Docs\Link C:\MarkvyTest\Outside`
5. In Markvy, choose "Open a folder". Pick `C:\MarkvyTest\Docs`.
6. Try to reach `Secret.md` through `Link`. If "Link" shows in the library panel, open it.

**Expected.**

- The text "Nobody should see this." never appears in Markvy.
- If Markvy shows an error, it says: "This link points outside the folder you opened, so Markvy won’t open it."

Write down what the library panel shows for "Link" (not shown, or shown and refused). Both are acceptable. Reading the file is not.

**Clean up.** Run `rmdir C:\MarkvyTest\Docs\Link` (this removes the junction only). Then delete `C:\MarkvyTest`.

Result: pass / fail. Notes: ____________

### A folder on a virtual drive opens and reads

**Steps.**

1. Make `C:\Docs` with a document `Hello.md` that says `# Hello`.
2. In Command Prompt run: `subst X: C:\Docs`
3. In Markvy, choose "Open a folder". Pick drive `X:`.
4. Open `Hello.md`.

**Expected.** The folder opens. "Hello" shows as the page title. Nothing says the folder can't be reached.

**Clean up.** Run `subst X: /D`.

Result: pass / fail. Notes: ____________

## 7. Checks that run automatically (for reference)

You don't run these by hand. They run in CI.

- `ci.yml`: builds and tests on Windows, macOS and Linux for every change. It includes the read-only check, the dependency review and the speed checks.
- Whole-app tests on Windows and Linux use `tauri-driver` (`cargo install tauri-driver --locked`). On Windows they also need `msedgedriver.exe` in `app/e2e/.driver` of the **same version as the WebView2 Runtime** (Installed apps → Microsoft Edge WebView2 Runtime), not of Edge: download it from `https://msedgedriver.microsoft.com/<version>/edgedriver_win64.zip`. `ci.yml` does this.
- The Windows crash test is automated. Linux and macOS crash checks are by hand (section 5 and `macos-checklist.md`).
- axe-core found no colour-contrast problems in any theme.

## 8. What the release notes may claim

Say only what Markvy **enforces** (spec §6). Don't add to it.

**You may say:**

- The screens have no file-system permission. They reach files only through the commands Markvy gives them.
- Markvy changes your files only when you press Save, rename or delete. Unsaved changes are kept in its own folder on this computer and are never sent anywhere.
- Every file Markvy reads must be inside a folder the person opened. This includes pictures.
- Documents are cleaned before display. A strict content security policy applies. Diagrams run with Mermaid's strict setting. Formulas run with KaTeX's trust setting off.
- Internet pictures are fetched only after the person allows it. Only pictures of up to 5 MB are accepted.
- Only web and email links leave Markvy.
- No analytics, crash reporting or update checks. No automatic updates.
- Works offline.

**You must not say:**

- The words "secure" or "certified", about Markvy or its protections. They stay out until an independent security review has been done (spec §6, "Wording").
- Anything that says Markvy is "safe from" attacks, or "can't be hacked".

**You must also include the limitation** wherever you list the protections (A11): the questions before opening a website or showing a picture from the internet are asked by the screens. If a flaw ever let a document get past the cleaning and the content security policy, it could make Markvy contact a website, or open one in the browser, without asking. No independent review of these protections has been done yet.

Also state in the notes:

- Whether each platform's installer is signed. Take it from the workflow summary.
- That updates are downloaded by hand from the release page.
- Any known issue from the UAT, the accessibility pass or the macOS checklist that the product owner chose not to fix.
