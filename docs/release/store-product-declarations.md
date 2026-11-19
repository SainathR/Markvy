# Microsoft Store: product declarations and notes for certification

What to tick on the **Properties › Product declarations** page in Partner Center for Markvy 0.1.0, and why. Also the text for **Notes for certification**.

Sources (both last updated 2026-04-09, read 2026-11-19):

- [Product declarations for MSI/EXE apps](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/product-declarations)
- [Product declarations for MSIX apps](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/product-declarations)

Microsoft's note on the page: "Your selections may affect the way your product is certified or displayed or whether it's offered to certain users." Tick a box only when it is true. A wrong tick can fail certification or bring bad reviews.

## Check the product type first

The list you see depends on the product type you chose when you reserved the name.

| You see | Product type | Route |
|---|---|---|
| 4 boxes: drivers or NT services, accessibility, pen and ink, generative AI | **EXE or MSI app** | Installer linked by URL. Needs a code-signing certificate and your own hosting (`microsoft-store.md`, "Fallback"). |
| 7 boxes: purchases outside the Store, accessibility, alternate drives, OneDrive backup, game clips, pen and ink, generative AI | **MSIX or PWA app** | The route `microsoft-store.md` recommends. No certificate needed. |

If you created an **EXE or MSI** product but want the MSIX route, create a new **MSIX or PWA app** product for Markvy (you may have to release the name from the first product before you can reserve it again). Check this in Partner Center before you go further; the product type decides which packages you can upload.

## Answers: EXE or MSI product (the 4 boxes)

| # | Declaration | Tick? | Why |
|---|---|---|---|
| A | This product depends on non-Microsoft drivers or NT services. | **No** | Markvy installs no drivers and no Windows services. It is one program (`markvy.exe`) plus the sample library. It uses Microsoft Edge WebView2, which is a Microsoft component, not a driver or service of ours. |
| B | This product has been tested to meet accessibility guidelines. | **No, not yet** | See "Accessibility: what it would take" below. Microsoft lists five things that must all be done first; Markvy has done one and part of another. |
| C | This product supports pen and ink input. | **No** | A pen works as a pointer (click, select, scroll), like a mouse, but Markvy has no drawing, handwriting or Windows Ink features. This box is for apps with inking. |
| D | This product incorporates generative AI features. | **No** | Markvy contains no AI models and calls no AI services. It never generates text, images, audio, video or code. |

## Answers: MSIX product (the 7 boxes)

Three of these are ticked by default. Change them as shown.

| Declaration | Default | Tick? | Why |
|---|---|---|---|
| This product allows users to make purchases, but does not use the Microsoft Store commerce system. | off | **No** | Markvy is free and sells nothing. |
| This product has been tested to meet accessibility guidelines. | off | **No, not yet** | As B above. |
| Customers can install this product to alternate drives or removable storage. | on | **Yes** (leave on) | Markvy runs from any drive. Nothing ties it to the system drive. |
| Windows can include this product's data in automatic backups to OneDrive. | on | **No** (untick) | Markvy's data folder holds your library (recent file paths, bookmarks, open tabs) and drafts of unsaved edits. The privacy statement says this data stays on your computer and is never sent anywhere. A backup to OneDrive would break that promise. If you ever want backups, change the privacy statement first. |
| Customers can use Windows 10/11 features to record and broadcast clips of this game. | off | **No** | Games only. Markvy is in Productivity. |
| This product supports pen and ink input. | off | **No** | As C above. |
| This product incorporates generative AI features. | off | **No** | As D above. |

## Accessibility: what it would take

Microsoft's five conditions, and where Markvy stands today:

| Microsoft's condition | Markvy now | To do |
|---|---|---|
| Accessible names and roles on every control | Built in and covered by the screen-reader steps (Part B) in `accessibility-pass.md` | Run Part B with **Narrator**, not only NVDA. |
| Full keyboard use: tab order, activation, arrow keys, shortcuts | Built in and covered by Part A of `accessibility-pass.md` | Run Part A. It hasn't been run yet. |
| Text contrast of at least 4.5:1, and colour never the only signal | axe-core found no contrast problems in any theme | None for contrast. Check the "colour alone" rule during Part A. |
| No high-priority errors in **Accessibility Insights** or **Inspect** (Microsoft's checking tools) | Not done | Run Accessibility Insights for Windows on the main screens and fix what it reports. |
| Main tasks checked end to end with **Narrator, Magnifier, On-Screen Keyboard, Windows High Contrast and high DPI** | Not done. Markvy has its own "High contrast" setting, but its screens don't yet adapt to the Windows High Contrast themes (the `forced-colors` CSS media query). | Add `forced-colors` styles, then test each tool. |

When every row is done and the results are recorded in `accessibility-pass.md`, tick the accessibility box in a later update. Ticking it makes Markvy show up for customers who filter for accessible apps.

## Notes for certification

Partner Center: **Submission options › Notes for certification**. Up to 2,000 characters (the text below is about 1,500 with the blanks filled). Testers read it; customers never see it. Fill in the date and the URL, and update it for every submission (Microsoft asks for the date and what changed).

It answers each point Partner Center lists: drivers and NT services, test accounts, hidden or conditional features, background audio, and dependencies on other products.

> Date: ____. First submission of Markvy 0.1.0, a desktop app for reading and editing Markdown files.
>
> Drivers and NT services: none. Markvy installs no drivers or services and changes no Windows settings.
>
> Test accounts: none needed. There is no sign-in, account or purchase. Markvy works fully offline.
>
> Background audio: none. Markvy plays no audio.
>
> Dependencies: Microsoft Edge WebView2 Runtime, which is part of Windows 11. No other products are needed.
>
> To test reading: on the first screen choose "Explore the sample library". It opens example pages with search, tabs, side-by-side reading, bookmarks, diagrams and formulas.
>
> Conditional features - editing: the sample library is read-only on purpose, so the Edit buttons are hidden there. To test editing, choose "Open a folder", create a new empty folder in the dialog and select it. Then choose "New page", type some text and press Save (Ctrl+S). Rename and delete also work; deleted pages go to the Recycle Bin. Editing can be switched off in Preferences ("Allow editing"), which hides these buttons everywhere.
>
> Conditional features - internet pictures: Markvy makes no network requests by itself. If a page contains a picture stored on a website, Markvy asks before downloading it. The sample page "Introduction to Digital Services" has one, so you can see the question.
>
> Region: no differences. The interface is in English.
>
> Privacy statement: ____ (URL).

## System requirements

Partner Center: **Properties › System requirements**. This appears in the Store listing. Microsoft warns customers whose device misses a **Minimum** item, and may stop them rating or reviewing Markvy, so tick only what Markvy truly needs.

| Feature | Minimum | Recommended | Why |
|---|---|---|---|
| Touch screen | — | — | Not needed. |
| Keyboard | **Ticked** | **Ticked** | Searching, editing and naming pages need typing. Every feature also works from the keyboard alone. |
| Mouse | — | **Ticked** | Not needed (keyboard-only use is supported), but most people will use one. |
| Camera | — | — | Not used. |
| NFC HCE | — | — | Not used. |
| NFC Proximity | — | — | Not used. |
| Bluetooth LE | — | — | Not used. |
| Telephony | — | — | Not used. |
| Microphone | — | — | Not used. |
| Memory | **4 GB** | **8 GB** | Measured 2026-11-19 on Windows 11: Markvy and its web view use about 290 MB of private memory on the start screen. 4 GB is the Windows 11 minimum. 8 GB is recommended for editing very large pages (about 1 MB of text), which is slow. |
| DirectX | Not specified | Not specified | Markvy needs no particular DirectX version. |
| Dedicated GPU memory | Not specified | Not specified | Not needed. |
| Processor | `x64 processor, 1 GHz or faster` | `x64 processor, 2 GHz or faster, 4 cores` | Markvy 0.1.0 is built for x64 only. Windows 11 on Arm runs x64 apps through emulation, but that hasn't been tested. |
| Graphics | (leave blank) | (leave blank) | Nothing specific needed. |

**Store listing › Additional system requirements** (optional, separate field). Suggested text:

> Windows 10 or Windows 11, 64-bit (x64). Microsoft Edge WebView2 Runtime (included in Windows 11).

## Packages (EXE or MSI product)

Partner Center: **Packages**. One row per installer.

| Field | Answer | Why |
|---|---|---|
| Package URL | The HTTPS address of the signed installer, with the version in it (for example `https://…/0.1.0/Markvy_0.1.0_x64_en-US.msi`) | The file behind the URL must never change; each version gets a new URL. |
| Architecture | **x64** | Markvy 0.1.0 is built for 64-bit Intel and AMD PCs only. Not `neutral` (that means the installer runs unchanged on every architecture) and not `arm64` (no Arm build exists yet). |
| Language | **English (en-US)** | The interface is English only. |
| App type | **MSI** (`Markvy_0.1.0_x64_en-US.msi`) | The Store installs an MSI silently with `/qn` on its own. If you use the NSIS `Markvy_0.1.0_x64-setup.exe` instead, choose **EXE** and give the silent switch `/S`. |

Both installers must be signed with a trusted code-signing certificate before you submit (`microsoft-store.md`, "Fallback").

## Age ratings (IARC questionnaire)

Partner Center: **Age ratings**. Required on the first submission (Store policy 11.11). Answer about the app itself, not advertising (Markvy has none).

| Question | Answer | Why |
|---|---|---|
| App type | **All Other App Types** | Markvy is a productivity tool: not a game, not a social or communication app. |
| Downloaded app: ratings-relevant content (sex, violence, language) in the package? | **No** | The package holds the program and the sample library (8 short pages about using a document library, a glossary and diagrams). Checked 2026-11-19: nothing ratings-relevant. |
| User content sharing: can users interact or exchange content with other users through voice, text, images or audio? | **No** | Markvy has no chat, no sharing, no accounts and no connection between users. It opens files on the user's own computer. |
| Online content: does the app feature or promote content that isn't part of the download? | **No** | Markvy features and promotes no content. It shows only documents the user opens from their own computer. The only online items are pictures already inside a user's own document, shown after the user agrees, and links the user opens in their own browser. Markvy has no catalogue, feed, store or AI-generated content. |
| Promotion or sale of age-restricted products or activities? | **No** | Markvy sells and promotes nothing. |
| Does the app share the user's current and precise location with other users? | **No** | Markvy never reads the location. |
| Can users purchase digital goods? | **No** | Free, with no in-app purchases. |
| Cash rewards, gift cards, play-to-earn, crypto rewards or NFTs? | **No** | None. |
| Is the app a web browser or search engine? | **No** | Its search covers only the folder the user opened on their computer. Web links open in the user's own browser. |
| Is the app primarily a news or educational product? | **No** | It is a document reader and editor (Productivity). |
| Will it use ratings obtained directly from a ratings board, or be distributed on physical media in any region? | **No** | Store download only; no separate rating. |

With these answers, expect the lowest age rating in every region (for example PEGI 3 or ESRB Everyone). The exact labels come from IARC after you submit. If Markvy later adds sharing, accounts, online content or AI features, answer the questionnaire again.

## After submission

- Keep this file next to `microsoft-store.md` and update it whenever Markvy gains a feature that changes an answer (for example AI features, inking, or OneDrive backup).
- If certification fails on a declaration, the report names it. Fix the answer or the app and resubmit.
