# 01 · Repository audit: Markvy MSI for the Microsoft Store

Audit date: 2026-11-20. Repository: `SainathR/Markvy`, branch `main` at `3aa131c`. Host: Windows 11 Home 10.0.26300, not elevated, WebView2 157.0.4341.60 installed, Windows SDK signtool 10.0.26100 available, no Windows Sandbox (Home edition).

Evidence files referenced below were written to `%TEMP%\markvy-evidence\` on the build machine; the key ones are copied into `release/0.1.0-store/`.

## 1. Existing configuration

| # | Item | Found | Evidence |
|---|---|---|---|
| 1 | Tauri versions | `tauri` crate **2.12.5**, `tauri-build` 2.7.4, `tauri-utils` 2.10.2, `@tauri-apps/cli` **2.12.4** | `app/src-tauri/Cargo.lock`, `app/package-lock.json` |
| 2 | Package manager | npm (lockfile v3), Node 20 in CI | `app/package-lock.json`, `.github/workflows/*.yml` |
| 3 | Build commands | `npm ci`, `npm run tauri build -- --bundles msi,nsis` (release.yml), `beforeBuildCommand` runs `check:readonly` and `vite build` | `release.yml`, `tauri.conf.json` |
| 4 | Windows packaging | `bundle.targets: "all"`; no `bundle.windows` section; no custom WiX template, fragments or `src-tauri/wix`/`windows` folders | `tauri.conf.json`; `ls app/src-tauri` |
| 5 | Publisher | `bundle.publisher: "Sainath Racherla"` → MSI `Manufacturer` | `tauri.conf.json`; MSI Property table |
| 6 | Name and version | `productName: "Markvy"`, `version: "0.1.0"` | `tauri.conf.json` |
| 7 | Identifier | `com.sainath.markvy` (unchanged by this work) | `tauri.conf.json` |
| 8 | WiX | Tauri's built-in template only | generated `release/wix/x64/main.wxs` |
| 9 | UpgradeCode | `{A0568F55-DEF4-5F54-894F-D253A53D88FF}`, not set in config; Tauri derives it as UUID v5 of `"Markvy.exe.app.x64"` in the DNS namespace (recomputed: identical) | previous MSI Property table; Tauri config schema `WixConfig.upgradeCode` |
| 10 | Product registration | `ALLUSERS=1` (per-machine), `ARPNOMODIFY=1`, `ARPNOREPAIR=yes`, `ARPPRODUCTICON`, `SetARPINSTALLLOCATION`; Windows Installer writes the uninstall entry under HKLM | previous MSI Property and CustomAction tables |
| 11 | WebView2 install mode | not set, so Tauri's default **`downloadBootstrapper`** | previous MSI: custom action `DownloadAndInvokeBootstrapper` |
| 12 | Language / architecture | Summary `Template` = `x64;0`; file name `_x64_en-US` | previous MSI summary information |
| 13 | Signing | `release.yml` imports `WINDOWS_CERTIFICATE` and passes `certificateThumbprint`, `digestAlgorithm sha256`, `timestampUrl` through a generated `tauri.signing.json`. No certificate exists locally. | `release.yml` lines 57-72 |
| 14 | Embedded executables signed? | When a thumbprint is configured, Tauri signs `markvy.exe` and then the MSI. With no certificate, neither is signed. | Tauri signing docs; `Get-AuthenticodeSignature` |
| 15 | Custom actions | `LaunchApplication` (type 210), `WixUIValidatePath`, `WixUIPrintEula`, `SetARPNOMODIFY`, `SetARPINSTALLLOCATION`, `DownloadAndInvokeBootstrapper` (type 1058) | previous MSI CustomAction table |
| 16 | Launches the app or shows UI during install? | `LaunchApplication` runs only when `AUTOLAUNCHAPP` is set (`AUTOLAUNCHAPP AND NOT Installed`), which `/qn` never sets. The WiX UI dialogs are skipped under `/qn`. | InstallExecuteSequence |
| 17 | Bundled resources that run installers | Only WebView2: the bootstrapper download (previous MSI). Resources are the Markdown sample library only. | CustomAction table; `bundle.resources` |
| 18 | Existing release validation | `release.yml` builds, collects installers and SHA-256s; no MSI inspection or install test | `.github/workflows/release.yml` |
| 19 | Previous MSI inspectable? | Yes: `release/0.1.0/Markvy_0.1.0_x64_en-US.msi`, 6,352,896 bytes, the file submitted | committed in `c1d6f6c`; `previous-0.1.0-metadata.json` |
| 20 | Self-update, prerequisites, downloads during setup | No updater (enforced by `check-workflows.test.mjs`). **Yes: WebView2 bootstrapper download** via PowerShell `Invoke-WebRequest` to `go.microsoft.com/fwlink/p/?LinkId=2124703` when WebView2 is missing. | CustomAction `DownloadAndInvokeBootstrapper` target |

## 2. Findings

### Confirmed

**F1. The submitted package URL does not serve the MSI.**
`https://github.com/SainathR/Markvy/blob/main/release/0.1.0/Markvy_0.1.0_x64_en-US.msi` returns `text/html`: GitHub's file viewer page (about 194 KB, title "Markvy/release/0.1.0/Markvy_0.1.0_x64_en-US.msi at main · SainathR/Markvy · GitHub"). The binary is only at the `raw` address (`application/octet-stream`, 6,352,896 bytes). Partner Center therefore had a web page, not an installer, to run.
*Evidence:* browser fetch of both URLs on 2026-11-20 (document `contentType`, response headers).
*Assessment:* this alone explains why Microsoft "could not identify" whether the install was silent, the app name and publisher, or the application entry: there was no installation to observe. It is the most likely cause of all three inconclusive results.

**F2. The MSI downloads WebView2 from the internet during setup when it is missing.**
Custom action `DownloadAndInvokeBootstrapper` (condition `NOT(REMOVE OR INSTALLED_WEBVIEW2_VERSION)`) runs PowerShell `Invoke-WebRequest` and then the bootstrapper. Microsoft's MSI/EXE requirements need an offline installer, and Tauri's Store guide requires `webviewInstallMode: offlineInstaller`.
*Evidence:* `previous-0.1.0-metadata.json`, check META-08 FAIL and META-09 FAIL.

**F3. The previous MSI is not Authenticode-signed.**
`Get-AuthenticodeSignature` → `NotSigned`; `signtool verify /pa` → "No signature found".
*Evidence:* META-12 in `previous-0.1.0-metadata.json`.
*Note:* Partner Center reported "Code signing: Passed" for the submission. That cannot describe this file; it is consistent with F1 (Partner Center examined something other than the MSI). Treat the earlier signing result as not applicable.

**F4. The UpgradeCode is implicit.**
It is derived from `productName`. It is correct today but would silently change if the product name ever changed, which would break upgrades.

### Not defects (checked)

- **Name and publisher in the MSI are correct**: `ProductName=Markvy`, `Manufacturer=Sainath Racherla`, `ProductVersion=0.1.0`, per-machine (`ALLUSERS=1`). The registration Windows Installer creates from these is the standard Add or Remove Programs entry.
- **No unexpected UI or app launch under `/qn`**: see item 16.
- **No unrelated software**: the only third-party installer is Microsoft's WebView2 runtime (F2).

### Still to verify (needs an installing test machine)

- **V1.** The new MSI installs silently with exit 0 under `msiexec /qn` (per-machine; needs elevation, which Partner Center's runner has).
- **V2.** Exactly one HKLM uninstall entry `Markvy` / `Sainath Racherla` / `0.1.0` appears.
- **V3.** The bundleware comparison shows nothing but Markvy (plus "Microsoft Edge WebView2 Runtime" only on machines without it).
- **V4.** Upgrading from the previous 0.1.0 MSI leaves one entry and keeps the user's data folder.
- **V5.** Partner Center's publisher display name matches `Sainath Racherla` exactly. This is account configuration, not code.

## 3. Changes made

| Change | Why | Upgrade impact |
|---|---|---|
| `tauri.conf.json`: `bundle.windows.wix.upgradeCode = "A0568F55-DEF4-5F54-894F-D253A53D88FF"` | F4: pins the value Tauri already used for 0.1.0 | None. Same value; it now cannot drift. |
| New `src-tauri/tauri.microsoftstore.conf.json`: MSI only, `webviewInstallMode: { type: offlineInstaller, silent: true }` | F2, following Tauri's Microsoft Store guide. Kept as an overlay, so GitHub and other installers are unchanged. | None. The MSI grows from 6.1 MB to 286.8 MB because it now carries the WebView2 offline installer, which runs only when WebView2 is missing (`InvokeStandalone`, condition `NOT(REMOVE OR INSTALLED_WEBVIEW2_VERSION)`, arguments `/silent /install`). |
| `scripts/windows/*.ps1`, `MarkvyStore.psm1` | Repeatable build, static checks, silent install, registration, bundleware and end-to-end tests | None |
| `.github/workflows/microsoft-store-msi-validation.yml` | Install tests on a clean, disposable, elevated Windows runner; run by hand; publishes nothing | None |
| `app/scripts/check-workflows.test.mjs` | Guards the overlay, the pinned UpgradeCode and the workflow's safety rules | None |

Not changed: identifier, product name, version, publisher, signing setup, release.yml, NSIS settings, application code.

## 4. Upgrade compatibility

- The UpgradeCode is unchanged, so Windows Installer recognises the Store MSI as the same product as the previous MSI.
- Tauri's template uses `MajorUpgrade` with `AllowDowngrades` (Tauri's default `allowDowngrades: true`), so installing a build over another one with the same version replaces it rather than adding a second entry. Every Tauri build gets a new ProductCode.
- User data lives in `%APPDATA%\com.sainath.markvy`, outside the install folder, and the MSI never touches it, so an upgrade keeps it.
- To be confirmed on a test machine: test MSI-013/017 (`Test-MarkvyMicrosoftStore.ps1 -Upgrade -PreviousMsiPath release\0.1.0\Markvy_0.1.0_x64_en-US.msi`).
