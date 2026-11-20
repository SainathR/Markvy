# 04 · Troubleshooting the Markvy Store MSI

## Where the logs are

| What | Where |
|---|---|
| Build output and manifest | `release/<version>-store/build-manifest.json`, `msi-metadata.json` |
| Silent install / uninstall log | `Test-MarkvySilentInstall.ps1 -LogDirectory` (default `%TEMP%\markvy-install-logs\Markvy-install-<time>.log`) |
| Full test run | `Test-MarkvyMicrosoftStore.ps1 -EvidenceDirectory` → `results.md`, `results.json`, sub-folders per step |
| GitHub run | Actions → "Microsoft Store MSI validation" → artifact `markvy-store-msi-validation` |
| Markvy's own log | `%APPDATA%\com.sainath.markvy\logs\markvy.log` |

## Partner Center says "inconclusive" for silent install, Add or Remove Programs and bundleware

1. **Check that the package URL downloads the MSI itself.** Open it in a private browser window: it must download a file, not show a page. GitHub `.../blob/...` links show a page; that was the cause for the first 0.1.0 submission. Use a GitHub Release asset (`https://github.com/SainathR/Markvy/releases/download/v<version>/Markvy_<version>_x64_en-US.msi`).
2. **Check the URL never changes content.** Partner Center caches the file; a new build needs a new URL.
3. Run `Test-MarkvyMicrosoftStore.ps1 -Install` on a clean VM (or the GitHub workflow). If MSI-004 to MSI-008 pass there, resubmit and add a certification note.

## MSI exit codes

| Code | Meaning | What to do |
|---|---|---|
| 0 | Success | |
| 3010 / 1641 | Success, restart needed / started | Markvy needs no restart; if you see this, look for a locked file in the log |
| 1602 | Cancelled | Something showed UI; make sure `/qn` was passed |
| 1603 | Fatal error | Find the first `Return value 3` in the verbose log and read the lines above it |
| 1605 | Product not installed | Uninstall of something that isn't there |
| 1618 | Another installation is running | Wait for Windows Update or another installer to finish, then retry |
| 1619 / 1620 | Package could not be opened | Wrong path, a download that is an HTML page, or a damaged file: compare the SHA-256 |
| 1625 | Forbidden by policy | Usually not elevated. A per-machine MSI cannot ask for elevation under `/qn`; run PowerShell as administrator |
| 1633 | Wrong processor type | x64 MSI on an Arm or 32-bit system |
| 1638 | Another version installed | Uninstall it, or check the UpgradeCode (below) |

`Test-MarkvySilentInstall.ps1` prints the 25 log lines before the first `Return value 3`. That action is usually the cause; later `Return value 3` lines are the rollback.

## Silent install problems

- **A window appeared.** Under `/qn` Windows Installer shows no dialogs. A window means something the MSI started showed one. Check the CustomAction table (`Test-MarkvyMsiMetadata.ps1`, META-10 and META-11). Tauri's `LaunchApplication` runs only when `AUTOLAUNCHAPP` is set.
- **It hangs.** The script gives up after `-TimeoutMinutes` (default 20) and reports FAIL. Look at the end of the log for the action that was running.
- **UAC prompt.** Allowed by Microsoft. Partner Center's runner is elevated; a local test must run in an elevated PowerShell.

## WebView2

- The Store MSI must carry the **offline** WebView2 installer: `src-tauri/tauri.microsoftstore.conf.json` sets `webviewInstallMode.type = "offlineInstaller"`. META-08 fails if any custom action downloads something; META-09 fails if the offline installer isn't inside the MSI.
- On a machine without WebView2, installing Markvy also installs **Microsoft Edge WebView2 Runtime**, which adds its own entry in Installed apps. It is Microsoft's runtime that Markvy needs, not bundled third-party software; `Test-MarkvyBundleware.ps1` lists it as a known prerequisite. Windows 11 and up-to-date Windows 10 already have it, so usually nothing extra appears.
- Don't switch to `skip`: Markvy would fail to start on a PC without the runtime.

## Registry and uninstall entry

- The MSI is per-machine (`ALLUSERS=1`), so the entry is under `HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\{ProductCode}`. An entry under HKCU means a per-user install happened (for example the NSIS `setup.exe` in its default mode), which Microsoft's check doesn't look for.
- **Two entries:** an older build was installed with a different UpgradeCode. Check META-05; it must stay `{A0568F55-DEF4-5F54-894F-D253A53D88FF}`.
- Fix names at the source (`productName`, `bundle.publisher`, `version` in `tauri.conf.json`), never by editing the registry.

## Publisher mismatch

Microsoft compares the entry's **Publisher** with the **publisher display name** in Partner Center (Account settings → Legal info). Both must be exactly `Sainath Racherla`, with the same spelling, spaces and capitals. If you change one, change the other: `bundle.publisher` in `tauri.conf.json`, then rebuild.

## Bundleware findings

`Test-MarkvyBundleware.ps1 -Mode Compare` sorts new entries into Markvy, known prerequisites and unexpected. "Unexpected" entries during a test usually come from something else installing at the same time (Windows Update, Store app updates): retake the baseline right before installing, on an idle VM. A real unexpected entry would come from a custom action; Markvy's MSI has none beyond Tauri's standard ones.

## Signing verification

- `Get-AuthenticodeSignature <msi>` must say `Valid`; `signtool verify /pa /v <msi>` must exit 0.
- `NotSigned`: no certificate was configured. Add the `WINDOWS_CERTIFICATE` and `WINDOWS_CERTIFICATE_PASSWORD` secrets (release checklist §2) or pass `-SigningConfig` to the build script.
- `UnknownError` or "not trusted": a self-signed or test certificate. The Store needs a certificate from a CA in the Microsoft Trusted Root Program.
- Also check `markvy.exe` inside the MSI (`msiexec /a <msi> /qn TARGETDIR=C:\tmp\x`, then `Get-AuthenticodeSignature C:\tmp\x\PFiles\Markvy\markvy.exe`): Microsoft requires every PE file to be signed.

## UpgradeCode and upgrades

- The UpgradeCode is pinned in `tauri.conf.json` (`bundle.windows.wix.upgradeCode`). Never change it: Windows would treat the next version as a different app and leave two entries.
- Each build gets a new ProductCode; that's expected.
- Test an upgrade with `Test-MarkvyMicrosoftStore.ps1 -Upgrade -PreviousMsiPath <old msi>`.

## Reproducing a run

```powershell
# On a clean Windows VM, PowerShell as administrator, from the repository root
.\scripts\windows\Build-MarkvyMicrosoftStore.ps1
.\scripts\windows\Test-MarkvyMicrosoftStore.ps1 -MsiPath .\release\0.1.0-store\Markvy_0.1.0_x64_en-US.msi -ExpectedVersion 0.1.0 -Install -Upgrade -PreviousMsiPath .\release\0.1.0\Markvy_0.1.0_x64_en-US.msi -EvidenceDirectory C:\evidence
```

Or run the GitHub workflow "Microsoft Store MSI validation" (after pushing), which does the same on a fresh runner.
