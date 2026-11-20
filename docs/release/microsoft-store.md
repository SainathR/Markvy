# Publishing Markvy in the Microsoft Store

Researched November 2026 from Microsoft Learn, the Microsoft Store Policies (v7.20, 2026-09-14) and the Tauri 2 docs. Sources are linked in each section. Check them again before you submit, because Microsoft changes these pages often.

## The decision: submit an MSIX package

There are two ways to put a desktop app in the Store. We recommend **MSIX**.

| | MSIX (recommended) | MSI or EXE installer linked by URL |
|---|---|---|
| Code-signing certificate | **Not needed.** The Store signs the package. | **Required** for the installer and every program file in it, from a CA in the Microsoft Trusted Root Program. You pay for it. |
| Hosting | The Store hosts it, free. | You host it on an HTTPS URL that never changes. Each version needs a new URL. |
| Updates for existing users | **Windows updates the app** from the Store (it checks every 24 hours). | The Store does **not** update existing users. Markvy would need its own updater, which breaks the "no update checks" promise. |
| Test releases (package flights), private listing | Yes | No |
| Extra review | The `runFullTrust` capability must be justified in Partner Center. | None |

Sources: [MSIX package requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements), [MSI/EXE package requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/app-package-requirements), [Win32 apps in the Store](https://learn.microsoft.com/en-us/windows/apps/distribute-through-store/how-to-distribute-your-win32-app-through-microsoft-store), [MSI/EXE updates](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/publish-update-to-your-app-on-store).

The MSI route stays available as a fallback if you ever buy a code-signing certificate (see "Fallback" at the end).

---

## Mandatory steps

### 1. Open an individual developer account in Partner Center

Markvy is Sainath Racherla's personal project, so it is published from an **Individual** account.

- Start at **https://storedeveloper.microsoft.com**. Registration is free when you start there; other entry points may still show the old paid flow. ([Open a developer account](https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account))
- Choose **Individual**. Microsoft allows it for apps published "not in relation to their business, trade, or profession". An individual account can't be turned into a company account later; if Markvy ever moves to a company, the app would be transferred to that company's account instead.
- Sign in with a **personal Microsoft account** (outlook.com, hotmail.com or similar), not a work account. Use one you will keep for years: it owns the app.
- Have ready a **government photo ID**. Microsoft checks it with a selfie during registration.
- The **publisher display name** you enter is what the Store shows as the publisher (for example "Sainath Racherla"). It must match the name in the privacy statement.
- Time: usually minutes; longer if Microsoft reviews the ID by hand.
- Use a separate email address for Markvy support (for example a new outlook.com address). It appears publicly in the listing and the privacy statement.

### 2. Reserve the name "Markvy"

In Partner Center: **Apps and games › New product › MSIX or PWA app**, then reserve **Markvy**. A reservation lasts 3 months. ([Reserve your app's name](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/reserve-your-apps-name))

Then open **Product management › Product identity** and copy three values. The package must use them exactly (they are case-sensitive):

- `Package/Identity/Name`
- `Package/Identity/Publisher` (starts with `CN=`)
- `Package/Properties/PublisherDisplayName`

### 3. Publish a privacy policy on a public web page

Required for every desktop (Win32) app, whatever it collects (policy 10.5.1). The text is ready in `privacy-policy.md` next to this file. Fill in its blanks (date, support email), put it on any public web page you control, and use that URL in the listing. Free options: GitHub Pages (a public repository with the statement as a page, for example `https://<your-github-name>.github.io/markvy/privacy`) or a free site builder such as Google Sites. The page must stay online for as long as Markvy is in the Store.

### 4. Build the MSIX package

`scripts\windows\Build-MarkvyMsix.ps1` packs the release build with the Windows SDK's `makeappx` (install the Windows 10/11 SDK). Don't use the MSIX Packaging Tool to capture the installer: a capture also records whatever else changed on the PC (browser data, sign-in caches, your own library).

1. Build Markvy: in `app`, run `npm run tauri build -- --no-bundle`. (The script looks for `markvy.exe` in `%LOCALAPPDATA%\folio-target\release`; pass `-Exe` for another place.)
2. Pack with the three values from step 2:
   `.\scripts\windows\Build-MarkvyMsix.ps1 -IdentityName '<Name>' -Publisher 'CN=<Publisher>' -PublisherDisplayName '<PublisherDisplayName>'`
   It writes `release\<version>-msix\Markvy_<version>.0_x64.msix`, unsigned: the Store signs it. The version comes from `tauri.conf.json` with a fourth number 0; pass `-Version` to override it. It includes the sample library and keeps the `runFullTrust` capability.
3. For a test install on your own PC, add `-Sign`. It signs with a self-signed certificate whose subject is the publisher and exports its public part, `Markvy-test-signing.cer`. Trust it once from an administrator PowerShell (`Import-Certificate -FilePath <cer> -CertStoreLocation Cert:\LocalMachine\TrustedPeople`), then install with `Add-AppxPackage <msix>`.
4. Check the smoke test in `release-checklist.md` section 4. Check especially that the sample library opens, that preferences and drafts survive a restart, and that uninstalling removes Markvy.

**What changes under MSIX.** Windows gives Markvy a private copy of its settings folder (drafts, library, preferences), deleted on uninstall. Documents the person opens are read and saved in place as usual. WebView2 is part of Windows 11 and is on almost every Windows 10 PC ([WebView2 distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)).

### 5. Fill in the submission

Create a submission for Markvy in Partner Center and complete each page.

| Page | What to enter |
|---|---|
| **Pricing and availability** | Free. Markets: all, or only the ones you choose. Visibility: public, or "direct link only" for a soft launch. ([Pricing and availability](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/price-and-availability)) |
| **Properties** | Category: **Productivity**. Privacy policy URL from step 3. Support contact (a website or a support email). Product declarations: see `store-product-declarations.md`. ([App properties](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/enter-app-properties)) |
| **Age ratings** | Complete the IARC questionnaire. Markvy has no user-to-user communication, no purchases and no generated content, so expect the lowest rating. ([Age ratings](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/age-ratings)) |
| **Packages** | Upload the `.msix` (one per architecture; x64 to start). |
| **Store listing (English)** | Description, at least 1 screenshot, and the optional fields. Text ready to paste is below. |
| **Submission options** | Justify `runFullTrust` (text below). Add the notes for certification (text in `store-product-declarations.md`). |

**Screenshots.** At least one, up to ten. PNG, at least 1366 × 768. Suggested set: the Home screen, a page from the sample library, two pages side by side, a page in edit mode, the Search screen. ([Screenshots and images](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/screenshots-and-images))

### 6. Pass certification

Submit. Microsoft says certification takes up to three business days; the listing appears about 15 minutes after it passes. ([Certification process](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/app-certification-process)) The checks most relevant to Markvy (policies v7.20, [Store Policies](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies)):

- 10.1: the name and description must be accurate; no marketing words in the name; at most 7 search terms.
- 10.1.2: the app must be fully working (the sample library helps the tester see that).
- 10.2.3: no malware, no bundled offers.
- 10.2.8: ask before changing Windows settings (Markvy doesn't make itself the default for `.md` files).
- 10.4.2: start quickly, stay responsive, don't close unexpectedly. **Works offline** is checked.
- 10.5: privacy policy present; data sent over the internet uses modern encryption (Markvy fetches internet pictures only after approval, over http or https).

If it fails, the report names the policy. Fix it and resubmit.

### 7. Each update

Raise the version in the three files listed in `release-checklist.md` section 3, rebuild the MSIX with the version `X.Y.Z.0`, and submit an update with the new package and a "What's new" note. Windows delivers it to existing users.

---

## Optional steps

| Step | Why |
|---|---|
| Run the **Windows App Certification Kit (WACK)** on the MSIX before submitting | Catches most certification failures on your own PC. |
| Use **package flights** | Send a test version to named testers (for example the UAT group) through the Store before everyone gets it. MSIX only. |
| Start with **"direct link only"** visibility | A soft launch to staff before the app is searchable. |
| Add the **Store badge** to your website or the privacy page | A "Get it from Microsoft" link. ([Store badge](https://learn.microsoft.com/windows/apps/publish/microsoft-store-app-badge)) |
| Upload the **`.msixupload`** (package plus symbols) instead of the bare `.msix` | Crash reports in Partner Center analytics show readable stack traces. |
| **Translate the listing** | Only if you target non-English markets. Markvy's screens are English only. |
| **Automate submissions** with the `microsoft/store-submission` GitHub Action | Once the GitHub repository exists, `release.yml` could submit each update. Works only after the first manual submission. |
| **winget and Intune** | Store apps can also be installed with `winget` (the `msstore` source) and pushed to an organisation's PCs with Intune by its IT team. Nothing extra to build. |
| Mention in the release notes that Store copies **update through Windows** | Markvy itself still makes no update checks; Windows does it for Store apps. |

---

## Text to paste into Partner Center

Keep these in line with `release-checklist.md` section 8 (what Markvy may claim). Don't use the words "secure" or "certified".

**Short description (under 270 characters)**

> Read Markdown documents and wikis like a well-designed book, and edit them the way you would in Word. Works offline, with no accounts and no tracking.

**Description**

> Markvy opens Markdown documents and wiki folders on your computer and shows them like a well-designed book. You don't need to know Markdown.
>
> Read: open a single document or a whole folder. Use tabs, read two pages side by side, follow the contents panel, search the folder, and bookmark the places you want to come back to. Diagrams, formulas, tables and links between pages show as they should. Markvy remembers your tabs for next time.
>
> Edit: select Edit this page and change it like a Word document, with a toolbar for headings, lists, links, tables and pictures. Markvy changes your file only when you press Save, and only the parts you edited. Unsaved changes are kept on your computer, so a crash doesn't lose them. Create, rename and delete pages; links to a renamed page are updated.
>
> Private by design: Markvy works offline. It has no accounts, no analytics and no crash reporting. It reads only files inside the folder you open. Pictures from the internet are shown only if you allow it.
>
> A sample library is included so you can try Markvy straight away.

**Features (one per line, up to 20)**

> Read Markdown documents and wiki folders like a book
> Tabs and side-by-side reading
> Search across a whole folder
> Bookmarks and reading progress
> Edit pages like a Word document, then Save
> Create, rename and delete pages; links update on rename
> Paste pictures into a page
> Diagrams (Mermaid) and formulas (KaTeX)
> Text size, themes and reading fonts
> Works offline; no accounts, analytics or crash reporting

**Search terms (at most 7)**

> markdown, wiki, reader, editor, documentation, notes, md

**Justification for `runFullTrust`**

> Markvy is a desktop app built with Tauri (Rust and the system WebView2). It opens Markdown files and folders that the user chooses anywhere on their computer, and saves the user's edits back to those files when they press Save. It needs full trust to read and write those user-selected files and folders. It does not install drivers or services, run at start-up, or change Windows settings.

**Notes for certification**

See `store-product-declarations.md`, which also covers the product declarations.

---

## Fallback: MSI installer linked by URL

Use this only if MSIX can't be made to work. Everything below is mandatory on that route.

1. **Buy a code-signing certificate** from a CA in the Microsoft Trusted Root Program, (Azure Artifact Signing accepts individuals only in the US and Canada) ([Artifact Signing quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)). Add it to `release.yml` as described in `release-checklist.md` section 2. Every `.exe` and `.dll` and the installer itself must be signed.
2. **Bundle WebView2 offline.** Create `app/src-tauri/tauri.microsoftstore.conf.json` with `{"bundle":{"windows":{"webviewInstallMode":{"type":"offlineInstaller"}}}}` and bundle with it ([Tauri: Microsoft Store](https://v2.tauri.app/distribute/microsoft-store/)). The publisher name ("Sainath Racherla") must not equal the product name ("Markvy"); it doesn't.
3. **Host the installer** on an HTTPS URL that includes the version and never changes.
4. In Partner Center choose **EXE or MSI app**, give the URL, and for the NSIS `-setup.exe` give the silent switch `/S` (the Store installs an MSI with `/qn` itself).
5. **Add an updater.** The Store doesn't update existing users on this route. That needs the Tauri updater plugin and a change to the privacy promises ("no update checks"), which is a product owner decision.

## Not verified

- Whether Microsoft routinely approves `runFullTrust` for desktop apps like Markvy. Reports differ; expect a short delay or a question from the reviewers.
- The current price of Artifact Signing and of commercial certificates (fallback route only).
- The exact pixel sizes Partner Center wants for the box-art logo on the MSI route.
