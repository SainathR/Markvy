# 05 · Release handoff: Markvy Store MSI

| # | Item | Value |
|---|---|---|
| 1 | Release version | **0.1.0** (unchanged) |
| 2 | Git commit | built from `3aa131c` plus this work's uncommitted changes (`gitWorkingTreeClean: false`). Rebuild after committing. |
| 3 | MSI | `release/0.1.0-store/Markvy_0.1.0_x64_en-US.msi` (300,740,608 bytes, x64, per-machine, carries the WebView2 offline installer) |
| 4 | SHA-256 | `c774980342b7d9ee2c6bf345f4cb47f66422cfb7554f0760e0dcccf68ad9ede9` |
| 5 | Signature | **Not signed.** No certificate is available on the build machine or in the repository. |
| 6 | Validation | Static checks pass (identity, architecture, UpgradeCode unchanged, per-machine, no download during setup, WebView2 offline, no automatic launch). Install, registration, bundleware, launch, uninstall and upgrade tests: NOT RUN here. See `03-validation-results.md`. |
| 7 | Unresolved blockers | Code-signing certificate. Install tests on a clean elevated machine. |
| 8 | Manual tasks | Certificate and secrets; Partner Center publisher name check; run the validation workflow; create the GitHub Release; update the Partner Center package URL. |
| 9 | Submission | `02-submission-checklist.md`, sections D and E |
| 10 | Rollback | below |

## What changed and why

| Validation (first submission) | Cause found | Fix |
|---|---|---|
| Silent install: inconclusive | The package URL served GitHub's HTML file page, so there was no installer to run. | Submit a GitHub Release asset URL that serves the MSI. |
| Add or Remove Programs: inconclusive | Same: nothing was installed, so there was no entry to read. The MSI's own metadata was already correct (Markvy, Sainath Racherla, 0.1.0, per-machine). | Same URL fix; UpgradeCode pinned so the identity can't drift. |
| Bundleware: inconclusive | Same cause. Separately, the old MSI could download and run Microsoft's WebView2 bootstrapper from the internet during setup. | Store overlay: WebView2 **offline** installer inside the MSI, so setup makes no network requests. |

## Rollback

- **Configuration:** revert the commit that adds `tauri.microsoftstore.conf.json` and the `bundle.windows.wix.upgradeCode` line. The GitHub and NSIS builds don't use the overlay, and the pinned UpgradeCode equals the value Tauri derived before, so neither change affects existing installs.
- **Partner Center:** a failed submission changes nothing for customers. Fix the package and resubmit with a new URL.
- **Published build:** if a Store build has a problem after release, submit the previous good MSI again under a new URL. Its version must be equal or higher, unless downgrades are allowed: Tauri's default `allowDowngrades: true` lets Windows Installer replace a newer build.
- **On a test PC:** `msiexec /x <msi> /qn` removes Markvy; user data in `%APPDATA%\com.sainath.markvy` stays.
