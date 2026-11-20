# 02 · Microsoft Store submission checklist (MSI)

Partner Center product type: **EXE or MSI app**. Tick each item when done. Items marked **(you)** need a person: an account, a certificate or a decision.

## A. Before building

| # | Step | Evidence | Done |
|---|---|---|---|
| A1 | **(you)** Get a code-signing certificate from a CA in the Microsoft Trusted Root Program (OV or EV), or Azure Artifact Signing if you qualify. Microsoft requires the MSI **and every program file in it** to be signed. | Store policy 10.2.9; [MSI/EXE package requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/app-package-requirements) | |
| A2 | **(you)** Add it to GitHub as the secrets `WINDOWS_CERTIFICATE` (base64 PFX) and `WINDOWS_CERTIFICATE_PASSWORD`, or install it locally and write a Tauri signing config (`bundle.windows.certificateThumbprint`, `digestAlgorithm: sha256`, `timestampUrl`). | `docs/release/release-checklist.md` §2 | |
| A3 | **(you)** In Partner Center, Account settings → Legal info: the **publisher display name** is exactly `Sainath Racherla`. | Must equal the MSI `Manufacturer` (META-02) | |
| A4 | **(you)** Decide the version. The Store MSI is `0.1.0`; 0.1.0 never reached customers, so it can stay. Raise it only through the release checklist (three files). | `tauri.conf.json` | |
| A5 | Commit the changes from this work, so the build manifest records a clean commit. | `build-manifest.json` → `gitWorkingTreeClean: true` | |

## B. Build

| # | Step | Evidence | Done |
|---|---|---|---|
| B1 | Build the signed Store MSI: `.\scripts\windows\Build-MarkvyMicrosoftStore.ps1 -SigningConfig <signing config>` (or run the GitHub workflow with the secrets set). | `release/<version>-store/build-manifest.json` | |
| B2 | `signingStatus` is `signed-verified`; `validationStatus` is `static-checks-passed`. | build manifest; `msi-metadata.json` | |
| B3 | `markvy.exe` inside the MSI is signed too: `msiexec /a <msi> /qn TARGETDIR=C:\tmp\x`, then `Get-AuthenticodeSignature C:\tmp\x\PFiles\Markvy\markvy.exe` says `Valid`. | | |

## C. Test on a clean machine

| # | Step | Evidence | Done |
|---|---|---|---|
| C1 | Run **Actions → Microsoft Store MSI validation → Run workflow** on GitHub (a clean, elevated Windows runner), or on a clean VM in an elevated PowerShell: `.\scripts\windows\Test-MarkvyMicrosoftStore.ps1 -MsiPath <msi> -ExpectedVersion <version> -Install -Upgrade -PreviousMsiPath release\0.1.0\Markvy_0.1.0_x64_en-US.msi` | `results.md` | |
| C2 | MSI-001 to MSI-018 are all PASS (MSI-013/017 may stay NOT RUN if you skip the upgrade test). | `results.md` | |
| C3 | Watch one install on a desktop VM: `msiexec /i <msi> /qn` shows no window apart from a possible UAC prompt, and Markvy doesn't start by itself. | screenshot or note | |

## D. Host the installer

| # | Step | Evidence | Done |
|---|---|---|---|
| D1 | **(you, with authorization)** Create a GitHub Release (for example tag `v0.1.0`) and attach the signed MSI. Never replace an asset that has already been submitted; a new build gets a new release or a new file name. | release page | |
| D2 | Use the asset's **download** URL: `https://github.com/SainathR/Markvy/releases/download/v0.1.0/Markvy_0.1.0_x64_en-US.msi`. **Not** a `.../blob/...` link: that serves a web page (the cause of the first submission's inconclusive results). | | |
| D3 | Check the URL in a private browser window or with `Invoke-WebRequest -Method Head <url>`: it downloads a file (`application/octet-stream`), and the downloaded file's SHA-256 equals `SHA256SUMS.txt`. | | |

## E. Partner Center → Packages

| Field | Value |
|---|---|
| Package URL | the release asset URL from D2 |
| Architecture | **x64** |
| Language | **English (United States)** |
| App type | **MSI** |
| Installer parameters | Partner Center uses `/qn` for MSI automatically |
| Return codes | defaults (0 success, 3010 restart required) |

## F. Partner Center → other pages

| Page | Source |
|---|---|
| Store listing text and images | `docs/store/listing.md`, `docs/store/screenshots/`, `docs/store/art/` |
| Properties, product declarations, system requirements, age rating, notes for certification | `docs/release/store-product-declarations.md` |
| Privacy policy URL | `docs/release/privacy-policy.md`, published on a public page |

Add to **Notes for certification**: "Resubmission. The package URL now serves the MSI file itself; the previous URL served a GitHub web page. The installer carries the WebView2 offline installer and makes no network requests during setup."

## G. After submission

| # | Step | Done |
|---|---|---|
| G1 | Read the package validation results. Silent install, Add or Remove Programs and bundleware should now be reported. If one is still inconclusive, compare with your `results.md` and see `04-troubleshooting.md`. | |
| G2 | Record the Partner Center results in `03-validation-results.md` under "Partner Center". | |
