# Markvy user acceptance test (UAT)

**Do not dismiss usability problems merely because a feature works technically.**

If a person got stuck, it is a finding. It does not matter that the button was there.

## What this test is for

Spec §1, criterion 4: the 12 scenarios must pass with at least 5 real users on the desktop build before release.

- **Who.** At least 5 people who don't use Markdown. Mix ages and computer confidence. Don't pick people who built Markvy.
- **What.** The installed desktop build (not the prototype page). Use the release candidate, on the computer type the person normally uses.
- **When.** Before the release is published.

You are testing Markvy, not the person. No answer is wrong.

## Before each session

- Install the build. Start it once and close it, or use a fresh user account, so the first-time screen shows.
- Have a folder ready with two files: `Trip plan.md` and `Checklist.md` (see Scenario 2).
- Task 12 involves a picture on the internet. Markvy only downloads it if the participant allows it, so you don't need to do anything.
- Turn on screen recording only if the participant agrees.
- Print one record sheet per participant (see below).

## Facilitator script

Read this out. Use your own words if you prefer, but keep the meaning.

> **Thank you for helping.** Markvy is a program for reading documents. We're testing the program, not you. If something is confusing, that is useful for us to know.
>
> **Before we start.** You don't have to take part. You can stop at any time and you don't need to give a reason. I'll write notes about what happens. I won't write down your name on the notes. I'll use a number instead. The notes are only used to improve Markvy. Is that all right?
>
> **Think aloud.** While you work, please say what you're looking at, what you expect, and what you're thinking. Say it even if it seems obvious. If you're confused, say so.
>
> **Helping.** I'll give you tasks one at a time. I won't tell you where to click. If you're stuck, I'll wait. I can't answer questions about how the program works until we're done. Please do what you'd do on your own.

Get a clear "yes" before you start. Write the participant number and the date on the record sheet. Don't write their name there.

### Rules for you, the facilitator

- Read each task exactly as written. Don't add hints. Don't say where a button is.
- **Don't help unless the person has been stuck for 2 minutes.** Use a timer.
- If you help, write down **when** and **what you said**. Mark the task "with help".
- If they give up before 2 minutes, mark the task "no". Then move to the next one.
- Don't react to mistakes. Say "Thank you, that's helpful" and go on.
- Write down things they say aloud. Quote them.
- After the last task, ask: "What was the most confusing part?", "What would you change?" and "Is anything missing?"

## The 12 tasks

Read one task at a time. Start the timer when the person starts. Stop when they say they're done, or when they're stuck for 2 minutes.

| # | Task (read this aloud) | The task counts as done when |
|---|---|---|
| 1 | "You've just installed a new program called Markvy. Open it and tell me what you see and what you think it's for." | They have opened Markvy and said what it is for. |
| 2 | "You've been sent a document called Trip plan. It's on this computer in the folder called [folder name]. Open it and read it." | The "Trip plan" page is on screen. They follow its link to "Checklist". |
| 3 | "Now look at the example library that comes with Markvy. Find the page called Introduction to Digital Services." | The "Introduction to Digital Services" page is on screen. |
| 4 | "Find out where this library says anything about printing." | They have searched for "printing" and found results. |
| 5 | "Go to the part about printing from a public computer." | The "Printing from a public computer" section is on screen. |
| 6 | "Open two pages at the same time, so you can switch between them without losing your place." | Two tabs are open. |
| 7 | "Now read two pages next to each other, on the same screen." | Two pages show side by side. |
| 8 | "The text is a bit small for you. Make it easier to read." | The text size or another reading setting has changed. |
| 9 | "You want to come back to this section later. Mark it somehow." | A bookmark exists for the section. |
| 10 | "Close the program. Open it again. Get back to what you were reading." | The earlier tabs are back. |
| 11 | "One of the links in these pages doesn't work. Find it and tell me what's wrong." | They have opened the broken link (the one for "Printer Manual") and said it points to a missing page. |
| 12 | "One of these pages has a picture that doesn't show. Tell me why, and decide whether you want to see it." | They have opened the picture prompt, said why the picture is hidden, and made a choice. |

Facilitator notes (not read out). Don't share these with the participant.

- Task 2: Put the document in a folder the person can find. The expected action is to use "Open a document" on Home. Say the folder name, not the path.
- Task 6: Ctrl + click on a link is one way. Another is to open a second document from the library panel. Either is fine.
- Task 8: The text-size setting is under "Appearance" or "Preferences". Don't say so.
- Task 10: Note whether they see and use "Restore previous session".
- Tasks 11 and 12: Start both from the sample library. Task 11 is in the "Troubleshooting" page. Task 12 is in "Introduction to Digital Services". If the person has lost their place, point them to the library panel without naming the page.
- Task 12: Note whether they understand that the picture is on another website and that loading it would tell that website. The prompt says this.

## Record sheet

Use one sheet per participant. Fill it in during the session.

**Participant number:** ______  **Date:** ______  **Facilitator:** ______  **Platform:** ______  **Markvy version:** ______

**Computer confidence (1 low to 5 high):** ______  **Uses a screen reader or magnifier? (yes / no):** ______

For each task, write **yes**, **with help** or **no**.

| # | Completed (yes / with help / no) | Time | Confusing interactions | Missing functionality | Navigation difficulties | Visual problems | Accessibility issues | User suggestions |
|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | |
| 2 | | | | | | | | |
| 3 | | | | | | | | |
| 4 | | | | | | | | |
| 5 | | | | | | | | |
| 6 | | | | | | | | |
| 7 | | | | | | | | |
| 8 | | | | | | | | |
| 9 | | | | | | | | |
| 10 | | | | | | | | |
| 11 | | | | | | | | |
| 12 | | | | | | | | |

**When I helped (task, minute, what I said):**

**Things they said aloud that stood out:**

**Closing questions:** most confusing part, what to change, what is missing.

### What the six categories mean

| Category | Write here |
|---|---|
| Confusing interactions | Something they didn't understand or did the wrong way first. |
| Missing functionality | Something they looked for and couldn't find. |
| Navigation difficulties | Trouble getting to a page, section or screen. |
| Visual problems | Text they couldn't read, unclear icons, colours, sizes. |
| Accessibility issues | Trouble with keyboard, screen reader, magnifier or contrast. |
| User suggestions | Their own ideas, in their words. |

## Counting up

After all sessions, fill in this table.

| Task | Participants who did it (yes) | With help | No |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| 6 | | | |
| 7 | | | |
| 8 | | | |
| 9 | | | |
| 10 | | | |
| 11 | | | |
| 12 | | | |

A task **passes** when every participant completed it without help. Any "with help" or "no" is a finding, even if only one person had it. The product owner decides what to fix before release.

## Editing (non-technical participant)

Run these after the 12 scenarios, on the same build. The participant works in a copy of a folder that is under version control (for example `git init` it first), so that you can check what changed.

Say in your own words: "This folder has some pages. I'll ask you to change a few things."

| # | Task | Done without help | Notes |
|---|---|---|---|
| E1 | Fix a sentence on a page: there is a spelling mistake in the second paragraph of `Trip plan`. Save it. | | |
| E2 | Add a row to the table on a page, and save. | | |
| E3 | Create a new page called "Meeting Notes". | | |
| E4 | Rename it to "Team Meeting Notes". Open another page that links to it and check the link still works. | | |
| E5 | Delete "Team Meeting Notes". Find it in the Recycle Bin. | | |
| E6 | Take a screenshot, paste it into a page, and save. | | |

**Pass criteria.** Every task is done without help, and `git diff` in the folder shows only the lines the participant meant to change (plus the new picture file under `images/`). You run `git diff`, not the participant. Any other changed line is a finding of severity Blocker.

## Findings log

Add one row for each problem. Merge the same problem from different people into one row and count them.

| # | Finding | How many participants | Severity | Proposed change | Decision |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

**Severity.**

- **Blocker.** People couldn't finish a task, or could be misled about what Markvy does with their files or the internet.
- **Serious.** Most people needed help, or got confused.
- **Minor.** Some people hesitated but got through.
- **Idea.** A suggestion, not a problem.

**Decision.** Write: Fix before release, Fix later, or No change, with the product owner's name and the date. Write a reason when the answer is No change.

## When you're done

- Keep the record sheets. Don't put participant names on them.
- Fill in the counting table and the findings log.
- Give them to the product owner. The release checklist asks for them (see `release-checklist.md`).
