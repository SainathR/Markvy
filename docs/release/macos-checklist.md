# Markvy on macOS: manual checklist

Run this on a real Mac before each release. Automated whole-app tests can't drive a Mac web view (spec §7), so a person has to do it.

**Why it matters.** Windows and Linux are tested automatically. This list is the only whole-app check on macOS.

## Before you start

- Use a Mac with no earlier copy of Markvy. If one is installed, drag it to the Bin first.
- Download the `.dmg` from the draft release. Check it against `SHA256SUMS.txt` (see `release-checklist.md`).
- Fill in the box below.

| Item | Your answer |
|---|---|
| Tester | |
| Date | |
| Markvy version | |
| macOS version | |
| Mac type (Apple Silicon or Intel) | |
| Build tested (signed and notarized, or unsigned) | |

Mark each row **Pass** or **Fail**. Write what you saw in Notes. If a row fails, say what happened instead.

## Checklist

| # | Step | Expected | Pass / Fail | Notes |
|---|---|---|---|---|
| 1 | Open the `.dmg`. Drag Markvy to Applications. Open Markvy from Applications. | Markvy opens with no Gatekeeper warning. **An unsigned build shows a warning.** Write down which build you tested in the box above, and what the warning said. | | |
| 2 | Look at Home. | "Welcome to Markvy" and "No saved session yet." show. | | |

### The 12 scenarios

Use the real file pickers, not drag and drop. These match the 12 scenarios in `uat-script.md`.

| # | Scenario | Steps | Expected | Pass / Fail | Notes |
|---|---|---|---|---|---|
| 3 | 1. First-time user opens the application | Quit and reopen Markvy if needed. Look at Home. | The welcome screen shows. "No saved session yet." shows. | | |
| 4 | 2. Open one document | In TextEdit, make a file `Trip plan.md` that says `# Trip plan` and a line with `[[Checklist]]`. Make `Checklist.md` in the same folder. In Markvy choose "Open a document". Pick `Trip plan.md` in the file picker. | "Trip plan" shows as the page title. The link "Checklist" opens the second page. | | |
| 5 | 3. Browse a wiki | Choose "Open a folder". Pick a folder of documents. Open a few pages from the library panel and by links. | The folder's tree shows. Links open the right pages. | | |
| 6 | 4. Search for a topic | Choose "Explore the sample library". In the search box ("Search documents") type `printing`. Press Return. | "Introduction to Digital Services" is in the results. | | |
| 7 | 5. Go to the matching section | Select the "Printing from a public computer" result. | The page opens at that section. The section is on screen. | | |
| 8 | 6. Open several tabs | Hold Command or Ctrl and click a link in a document. (The Help screen lists the shortcut as Ctrl + click.) | The page opens in a new tab. Two tabs show. | | |
| 9 | 7. Read side by side | Select "Read side by side". Then select "Back to single page". | A second pane with its own tabs shows. Then one pane again. | | |
| 10 | 8. Change reading preferences | Select "Appearance". Select "Smaller text". Press Escape. | The text in the document is smaller. | | |
| 11 | 9. Bookmark a section | Select "Bookmark this section". | A message says `Bookmarked “…”` with the section name. | | |
| 12 | 10. Return to a previous session | Quit Markvy (Command + Q). Open it again. Choose "Restore previous session". | Your tabs come back. | | |
| 13 | 11. Spot a broken link | In the sample library open "Introduction to Digital Services", then "Security and Privacy", then "Troubleshooting". Select the "Printer Manual" link. | A dialog titled "This page can’t be found" opens. Escape closes it. | | |
| 14 | 12. Understand the internet picture prompt | Go back to "Introduction to Digital Services". Select "Review and show picture". | A dialog titled "Show a picture from the internet?" names `images.example.org`. "Keep hidden" closes it. The picture stays hidden. | | |

### Pictures, live reload, crashes, themes and sessions

| # | Step | Expected | Pass / Fail | Notes |
|---|---|---|---|---|
| 15 | **Local pictures.** In the sample library open "Architecture". | The picture from `Images/architecture.svg` shows in the page. No broken-picture icon. | | |
| 16 | **Live reload.** Open a document from a folder you made. Scroll down part of the way. In TextEdit, open the same file. Change a line. Save. | Markvy shows the change within a few seconds. The page stays where you scrolled to. | | |
| 17 | **Crash reload, first time.** Open a document. Open Activity Monitor. Find the process called "Markvy Web Content" (or `com.apple.WebKit.WebContent` that belongs to Markvy). Choose it. Choose "Force Quit". | The window reloads. Your tabs come back. A message says "Markvy had a problem and reloaded. Your tabs are back." | | |
| 18 | **Crash reload, second time.** Within one minute of step 17, force-quit the same process again. | The window reloads. Your tabs do **not** come back. Home shows. A message says "Markvy had a problem again and reloaded. Your tabs weren’t reopened, in case one of them caused it. You can reopen them with Restore previous session." | | |
| 19 | Choose "Restore previous session" after step 18. | Your tabs come back. | | |
| 20 | **Dark mode.** Open Preferences. Under "Colour theme" choose Automatic. In System Settings › Appearance choose Dark, then Light. | Markvy follows: Night when the Mac is dark, Paper when it is light. | | |
| 21 | **Reduced motion.** In System Settings › Accessibility › Display turn on "Reduce motion". Switch to Markvy. Scroll to a section from the contents panel. | Markvy doesn't animate the scroll. Turn the setting off again afterwards. | | |
| 22 | **Quit and reopen.** Open two or three documents. Quit Markvy. Open it again. Choose "Restore previous session". | The same tabs come back. | | |

## Result

- Rows passed: ____ of 22
- Rows failed (list numbers): ____________
- Build tested: ____________
- Signed off by: ____________  Date: ____________

Any failed row blocks the release until the product owner decides otherwise. Write the decision here.
