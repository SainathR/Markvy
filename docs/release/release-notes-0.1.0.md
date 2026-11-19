# Markvy 0.1.0 release notes

**Draft.** Fill in the signing line and the known issues from UAT before you publish. Every claim here follows `release-checklist.md` section 8.

## What Markvy is

Markvy opens Markdown documents and wiki folders on your computer and shows them like a well-designed book. You don't need to know Markdown to read or edit them.

## What's in this release

**Reading**

- Open a single document or a whole folder. A sample library is included so you can try Markvy straight away.
- Tabs, two pages side by side, a contents panel, breadcrumbs and reading progress.
- Search across the folder you opened.
- Bookmarks, and your tabs come back when you reopen Markvy.
- Reading preferences: text size, themes and fonts (Literata, Figtree and Lexend).
- Diagrams (Mermaid), formulas (KaTeX), tables, footnotes and wiki-style links between pages.
- Broken links are marked, and you are told what is wrong.

**Editing**

- Select **Edit this page** to change a page the way you would in Word, with a toolbar for headings, lists, links, tables and pictures.
- Press **Save** (Ctrl + S) to write your changes. Markvy changes only the parts of the file you edited.
- Unsaved changes are kept as a private draft on this computer, so they survive a crash or closing the window.
- Create pages and folders, rename a page (links to it are updated), and delete pages to the Recycle Bin.
- Paste or insert a picture. It is saved in an `images` folder next to the page.
- Editing can be turned off in Reading preferences, so Markvy only reads.

## Your files and your privacy

- The screens have no file-system permission. They reach files only through the commands Markvy gives them.
- Markvy changes your files only when you press Save, rename or delete. Unsaved changes are kept in its own folder on this computer and are never sent anywhere.
- Every file Markvy reads must be inside a folder you opened. This includes pictures.
- Documents are cleaned before display. A strict content security policy applies. Diagrams run with Mermaid's strict setting. Formulas run with KaTeX's trust setting off.
- Internet pictures are fetched only after you allow it. Only pictures of up to 5 MB are accepted.
- Only web and email links leave Markvy.
- No analytics, crash reporting or update checks. No automatic updates.
- Works offline.

**Limitation.** The questions before opening a website or showing a picture from the internet are asked by the screens. If a flaw ever let a document get past the cleaning and the content security policy, it could make Markvy contact a website, or open one in the browser, without asking. No independent review of these protections has been done yet.

## Installers

| Platform | File | Signed |
|---|---|---|
| Windows | `Markvy_0.1.0_x64_en-US.msi` | ____ (take from the release workflow summary) |
| Windows | `Markvy_0.1.0_x64-setup.exe` | ____ |
| macOS | `Markvy_0.1.0_universal.dmg` | ____ |
| Linux | `.deb` and `.AppImage` | not applicable (check `SHA256SUMS.txt`) |

Updates are downloaded by hand from the release page. Markvy never checks for updates itself. If you installed Markvy from the Microsoft Store, Windows updates it from the Store.

## Known issues

- **Very large pages are slow to edit.** A page of about 1 MB takes 10 to 15 seconds to open for editing, and each key press takes 1 to 2 seconds to show. Typical pages open in under a tenth of a second. Reading large pages is not affected.
- **Start-up time.** Markvy takes about 1.6 to 1.7 seconds to start on the test machine, against a target of 1.5 seconds. The product owner's decision is recorded in `release-checklist.md` section 1.
- From UAT, the accessibility pass and the macOS checklist: ____ (list anything the product owner chose not to fix, or write "None").
