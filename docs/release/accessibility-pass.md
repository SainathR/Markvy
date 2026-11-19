# Markvy accessibility pass: keyboard and screen reader

Run this before each release (spec §7). Automated axe-core checks run on every screen. They found no colour-contrast problems in any theme. They can't tell whether Markvy is pleasant to use with a keyboard or a screen reader. A person has to check.

No findings file exists yet. If one is added, link it here as the list of open decisions.

## What you need

| Platform | Screen reader | Notes |
|---|---|---|
| Windows | NVDA | Free from nvaccess.org. Install it before the test. |
| macOS | VoiceOver | Built in. Turn it on with Command + F5. |
| Linux | Orca | Built in on most desktops. Turn it on in Settings › Accessibility. |

Do Part A with the keyboard on all three platforms. Do Part B with the screen reader for your platform.

Start with the **Paper** theme. Then repeat Part A, section 1, once in **Night** and once with **High contrast** turned on in Preferences.

## Part A: keyboard only

Put the mouse aside. Use only Tab, Shift + Tab, Enter, Space, Escape and the arrow keys. In the library tree and the radio groups, the arrow keys move between items.

Two rules apply to every row:

- **Focus is always visible.** You can see which control is selected.
- **Focus is never lost.** After any action, focus lands somewhere sensible. It never vanishes and never gets trapped.

### 1. The seven screens

| # | Screen | How to get there | Check | Pass / Fail |
|---|---|---|---|---|
| A1 | Home ("Welcome to Markvy") | Start Markvy. | Tab reaches "Open a folder", "Open a document", "Explore the sample library", and each recent document and folder. Enter activates each. | |
| A2 | Reading workspace | Open the sample library, then any document. | Tab reaches the library panel, the tabs, "Back (Alt + Left)", "Forward (Alt + Right)", the toolbar buttons, the document and the contents panel ("On this page"). Left and right arrows move between tabs. | |
| A3 | Search | Press `/` or Ctrl + K. | The search box has focus. Tab reaches the "Where to search" choices (arrow keys switch between them), "Headings only", "Whole words" and the results. Enter on a result opens it. | |
| A4 | Side by side | Select "Read side by side". | Tab reaches both panes. The divider ("Resize the two reading panes") can be reached and moved with the arrow keys. "Close this side" and "Back to single page" work. | |
| A5 | Reading preferences | Select "Preferences". | Tab reaches the "Colour theme" choices (arrows move between them), "Reading font", each slider (arrows change the value), "High contrast", "Reduce motion", "Interface language" and "Restore default settings". | |
| A6 | Library | Select "Library". | Tab reaches the list tabs. Left and right arrows move between them. Tab then reaches "Filter this list", "Sort by", and each row's "Details for…" and "Remove…" buttons. | |
| A7 | Privacy, security and help | Select "Help for this screen", then "All help topics". | Tab reaches the two radio groups ("Links to websites", "Pictures from the internet"), "Clear history", "Reset workspace", "Open log folder" and the questions under "Common questions". Enter or Space opens each question. | |

### 2. The four dialogs

For each dialog, check all four things:

1. Focus moves into the dialog when it opens.
2. Tab and Shift + Tab stay inside the dialog.
3. Escape closes it.
4. After it closes, focus returns to the control that opened it.

| # | Dialog | How to open it | Pass / Fail |
|---|---|---|---|
| A8 | "This page can’t be found" | In the sample library open Introduction to Digital Services, then Security and Privacy, then Troubleshooting. Tab to the "Printer Manual" link and press Enter. | |
| A9 | "Open this website?" | Open the README document. Tab to the "library website" link and press Enter. | |
| A10 | "Show a picture from the internet?" | In "Introduction to Digital Services", Tab to "Review and show picture" and press Enter. | |
| A11 | "Document details" | Tab to "Document details" in the toolbar and press Enter. | |

Check these other dialogs the same way: "Clear history?" and "Reset the workspace?" (both on the Privacy screen), "Remove “…” from your folders?" (on Home), and the dialog that "Help for this screen" opens.

### 3. Other keyboard checks

| # | Check | Expected | Pass / Fail |
|---|---|---|---|
| A12 | Press Tab once on a fresh screen. | A "Skip to the document" link appears first. Enter moves focus into the document area. | |
| A13 | Press `[` and `]`. | They hide and show the library panel and the contents panel. Focus is not lost. | |
| A14 | Open "Appearance". Press Escape. | The popover closes. Focus returns to the "Appearance" button. | |
| A15 | Press Alt + Left and Alt + Right in a tab with history. | Back and forward work. | |

## Part B: screen reader

Turn on the screen reader for your platform. Listen to what it says. Write what you heard in the record table below, in your own words.

Wording differs a little between NVDA, VoiceOver and Orca. For example, one may say "button" and another "toggle button". What must always be heard is the **name** (the words in quotes below) and the **role**.

| # | Where | Do this | Must be announced |
|---|---|---|---|
| B1 | Home | Start Markvy. | The page title "Welcome to Markvy". |
| B2 | Home | Tab to a folder's star and remove buttons. | "Add … to favorites" or "Remove … from favorites" (button, with pressed or not pressed). "Remove … from your folders" (button). |
| B3 | Home | Tab to a recent document's reading bar. | "…% read" (image). |
| B4 | Reading workspace | Tab to the toolbar. | "Bookmark this section, button". After you press it: "Remove bookmark for this section". |
| B5 | Reading workspace | Tab to the favorites button. | "Add to favorites" or "Remove from favorites", with pressed state. |
| B6 | Reading workspace | Tab through the tabs and the breadcrumbs. | The navigation "Open documents". Each tab's name. "Close …" on each close button. The navigation "Location". |
| B7 | Reading workspace | Move into the document. | The region "Document". Headings, links and tables are read as headings, links and tables. |
| B8 | Reading workspace | Read the progress bar. | "Reading progress", with a value from 0 to 100. |
| B9 | Contents panel | Tab to the section list and the arrows next to sections. | The navigation "Sections". "Subsections of …" with expanded or collapsed. |
| B10 | Notices | Press "Bookmark this section". | The notice text, for example `Bookmarked “…”`, is read **as a status message**, and focus does not move. |
| B11 | Notices | After a crash reload (see the macOS and Linux crash steps in `macos-checklist.md` and `release-checklist.md`). | "Markvy had a problem and reloaded. Your tabs are back." is read as a status message. |
| B12 | Search | Search for `printing`. | "Search for" on the box. After you press Enter, the summary (for example "… matching sections in … documents") is read without moving focus. |
| B13 | Search | Tab to the "Where to search" choices. | The group name "Where to search". Each choice's name and whether it is selected. |
| B14 | Preferences | Tab to "Colour theme". | The group "Colour theme". Each theme's name (Automatic, Paper, Sepia, Slate, Rose, Night, Dusk, Ember) and whether it is selected. |
| B15 | Preferences | Move a slider. | The slider's label ("Text size", "Reading width", "Line spacing", "Interface zoom") and the new value. |
| B16 | Preferences | Tab to the two switches. | "High contrast" and "Reduce motion", each with checked or unchecked. |
| B17 | Library | Tab to the list tabs. | The tab list "Library lists". Each tab's name and count, and which one is selected. |
| B18 | Library | Tab to a row's buttons. | "Details for …" and "Remove … from this list". |
| B19 | Privacy, security and help | Tab to the radio groups. | The group names "Links to websites" and "Pictures from the internet". Each choice with its small print. |
| B20 | Every dialog (A8 to A11) | Open each one. | The **dialog title** is read when it opens: "This page can’t be found", "Open this website?", "Show a picture from the internet?", "Document details". The role "dialog" is announced. |
| B21 | Dialogs | Tab to each button. | The button names, for example "Keep hidden", "Show this picture", "Cancel", "Open in browser", "OK". |
| B22 | Side by side | Move to the divider. | "Resize the two reading panes" and its role. |
| B23 | Appearance | Open "Appearance". | The dialog name "Appearance". "Smaller text" and "Larger text". The size ("… px") is read when it changes. |
| B24 | Editing | Tab to the Edit button in the reading toolbar. | "Edit this page, button". While editing: "Editing this page", pressed. |
| B25 | Editing | Tab to the editing toolbar. | Each button by name (for example bold, italic, link, picture), and the text area as "Document text", multi-line text box. |
| B26 | Leave dialog | While editing with unsaved changes, select "Done". | The dialog title "Unsaved changes" is read, with "Save your changes to this page?". Buttons "Discard", "Keep draft", "Save". |
| B27 | Conflict dialog | Change the file in another program, then save in Markvy. | The dialog is announced as a dialog, with its title. The buttons include "Combine both" when that is possible. |
| B28 | File-action dialog | Choose Rename, New page or Delete from the library. | The dialog title ("Rename", "New page", "New folder" or "Move to the Recycle Bin"). The "File name" field, and its problem or link-count message read as a status. |
| B29 | Library context menu | Focus a page in the library, press Shift + F10. | "Actions for …", menu. Then "New page", "Rename", "Delete", each as a menu item. Arrow keys move; Escape closes and focus returns to the page. |

## Record table

Add one row per step you ran. Copy the table into a spreadsheet if that is easier.

| Screen | Assistive technology | Step | Expected | Heard or seen | Pass / Fail | Notes |
|---|---|---|---|---|---|---|
| | | | | | | |
| | | | | | | |
| | | | | | | |

Tester: ____________  Date: ____________  Markvy version: ____________  Platform: ____________

## If a step fails

- Write it down at once, with the step number.
- Lost or invisible focus, a dialog with no title, or a notice that isn't announced blocks the release until the product owner decides otherwise.
- Don't fix it in this document. Raise it with the team.
