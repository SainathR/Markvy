# 03 · Validation results

Run 2026-11-20 on the build machine: Windows 11 Home 10.0.26300, **not elevated**, WebView2 157 already installed, no Windows Sandbox. Markvy was **not** installed on this machine and the tests that install software were not run here (they change the computer for all users and need elevation; they are opt-in).

Artifact under test: `release/0.1.0-store/Markvy_0.1.0_x64_en-US.msi`, SHA-256 `c774980342b7d9ee2c6bf345f4cb47f66422cfb7554f0760e0dcccf68ad9ede9`, 300,740,608 bytes, built from `3aa131c` plus the uncommitted changes of this work.

Evidence folder: `release/0.1.0-store/evidence/` (local, kept out of git by the `/release/` rule).

## Build checks (Build-MarkvyMicrosoftStore.ps1)

| Check | Status | Result |
|---|---|---|
| `npm ci` from `package-lock.json` | PASS | installed (npm 11.17.0, Node 24.19.0) |
| `npm run check:readonly` | PASS | |
| `npm run check` (svelte-check) | PASS | 947 files, 0 errors, 0 warnings |
| `npm test` (Vitest) | PASS | 33 files, 369 tests |
| `cargo test` | PASS | 170 passed, 2 ignored |
| `tauri build --bundles msi --config tauri.microsoftstore.conf.json` | PASS | MSI built |
| `check-workflows.test.mjs` with the new Store guards (run after the build) | PASS | 32 tests |
| `windows-store-scripts.test.mjs` (new): scripts parse, exit codes 2 for a missing MSI, bundleware baseline/compare, consistency with `tauri.conf.json` | PASS | 8 tests. It found and fixed a bug: `Write-Error` under `$ErrorActionPreference = "Stop"` ended the scripts with exit 1 instead of the documented code. |
| `/verify` (gstack checks) | PASS | `READY_FOR_SHIP tree=cfed6ae6703c checks=tests not_covered=none` |

These ran on the code as it stands after this work; there were no failures before or after the changes.

## Test matrix (Test-MarkvyMicrosoftStore.ps1)

| ID | Test | Status | Actual | Expected | Evidence |
|---|---|---|---|---|---|
| MSI-001 | MSI metadata | **PASS** | ProductName Markvy; Manufacturer Sainath Racherla; ProductVersion 0.1.0; ProductCode {FB541314-4697-4428-A3AD-B77DB83E295C}; UpgradeCode {A0568F55-DEF4-5F54-894F-D253A53D88FF} (unchanged); ALLUSERS 1 | as left | `evidence/msi-metadata.json` |
| MSI-002 | Architecture | **PASS** | Template `x64;0` | x64 | same |
| MSI-003 | MSI signature | **BLOCKED** | `NotSigned` (Get-AuthenticodeSignature); `signtool verify /pa /v` (Windows SDK 10.0.28000, 2026-11-20): "No signature found", exit 1. `markvy.exe` inside the MSI (`msiexec /a`): `NotSigned` | Valid, trusted CA, for the MSI and `markvy.exe` | same |
| MSI-004 | Silent installation | NOT RUN | needs an elevated clean machine | exit 0, no UI | — |
| MSI-005 | Installer exit code | NOT RUN | | 0 or 3010 | — |
| MSI-006 | Installed apps registration | NOT RUN | | one HKLM entry "Markvy" 0.1.0 | — |
| MSI-007 | Publisher metadata | NOT RUN | (static: Manufacturer = Sainath Racherla, PASS) | Sainath Racherla | — |
| MSI-008 | Bundleware comparison | NOT RUN | | only Markvy (+ WebView2 runtime if it was missing) | — |
| MSI-009 | Application launch | NOT RUN | | process alive after 10 s | — |
| MSI-010 | Smoke test | NOT RUN | | window "Markvy"; sample library installed | — |
| MSI-011 | Silent uninstallation | NOT RUN | | exit 0 | — |
| MSI-012 | Reinstallation | NOT RUN | | exit 0, one entry | — |
| MSI-013 | Upgrade from previous 0.1.0 MSI | NOT RUN | previous MSI available: `release/0.1.0/Markvy_0.1.0_x64_en-US.msi` | one entry, app starts, data kept | — |
| MSI-014 | Offline installation (static) | **PASS** | no custom action downloads anything; `MicrosoftEdgeWebView2RuntimeInstaller.exe` is in the Binary table and runs as `InvokeStandalone /silent /install` only when WebView2 is missing | no network dependency | `evidence/msi-metadata.json` |
| MSI-015 | Installation log | NOT RUN | | "completed successfully", no `Return value 3` | — |
| MSI-016 | Artifact integrity | **PASS** | SHA-256 matches `SHA256SUMS.txt` | match | `SHA256SUMS.txt` |
| MSI-017 | Registration after upgrade | NOT RUN | | one entry, 0.1.0 | — |
| MSI-018 | Registration after uninstall | NOT RUN | | no entry | — |

MSI-014 is a static check. A true offline install test (network disabled on a VM without WebView2) has not been run.

## Previous submission (release/0.1.0, for comparison)

| Check | Status | Actual |
|---|---|---|
| Package URL `.../blob/main/release/0.1.0/...msi` | **FAIL** | serves `text/html` (GitHub page, ~194 KB), not the MSI |
| Same file at `raw.githubusercontent.com/...` | PASS | `application/octet-stream`, 6,352,896 bytes |
| META-08 no download during setup | **FAIL** | `DownloadAndInvokeBootstrapper` (PowerShell `Invoke-WebRequest`) |
| META-09 WebView2 offline installer | **FAIL** | absent |
| META-12 signature | BLOCKED | `NotSigned` |
| Identity (name, publisher, version, UpgradeCode, per-machine) | PASS | same values as the new MSI except ProductCode |

Evidence: `%TEMP%\markvy-evidence\previous-0.1.0-metadata.json` on the build machine.

## Script self-checks (no installation)

| Script behaviour | Status | Evidence |
|---|---|---|
| `Test-MarkvySilentInstall.ps1` refuses when not elevated (exit 3, BLOCKED) | PASS | `evidence/script-checks/Markvy-install-*.json` |
| `Test-MarkvySilentInstall.ps1` refuses on a SHA-256 mismatch (exit 2) | PASS | same |
| `Test-MarkvyBundleware.ps1` baseline (345 entries) and compare; reports "No Markvy entry" when nothing was installed (exit 1) | PASS | `evidence/script-checks/arp-before.json`, `bundleware-no-install.json` |
| `Test-MarkvyMsiMetadata.ps1 -CheckRegistration` reports REG-01 "none" when Markvy isn't installed | PASS | `evidence/script-checks/registration-not-installed.json` |

## Partner Center

| Check | Result |
|---|---|
| (first submission) Malware | Passed |
| (first submission) Silent install, Add or Remove Programs, Bundleware | Inconclusive (explained by the URL serving a web page) |
| (first submission) Code signing | Reported "Passed", but the MSI has no signature; the result cannot describe the MSI |
| Resubmission | not yet submitted |

## Remaining corrective actions

1. Sign the MSI and `markvy.exe` with a trusted certificate (MSI-003). **Blocking.**
2. Run the install tests on a clean elevated machine: the GitHub workflow or a VM (MSI-004 to MSI-013, MSI-015, MSI-017, MSI-018).
3. Host the signed MSI at a GitHub Release asset URL and resubmit.
