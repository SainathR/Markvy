---
title: Security and Privacy
author: Tomás Ortega
updated: 2026-10-12
tags: [security, privacy]
status: Reviewed
---

# Security and Privacy

Patrons trust us with their reading history, their contact details and sometimes their documents. This guide explains how we protect that information.

> [!IMPORTANT]
> Never write down a patron's library card number or PIN, even on a sticky note.

## Patron privacy

We keep only the information needed to lend items:

- Name and contact details
- Current loans and holds
- Fines owed

Reading history is **not** kept after an item is returned, unless the patron turns it on in their account.

## Passwords and staff accounts

Every staff member has their own account. Shared accounts are not allowed.

1. Use a passphrase of at least four random words.
2. Turn on two-step sign-in.
3. Lock your screen whenever you leave the desk (press <kbd>Windows</kbd> + <kbd>L</kbd>).

## Public computer reset

Every public computer erases its own files when a session ends. The reset is controlled by a small settings file:

```yaml
# session-reset.yaml: applied at every sign-out
erase:
  downloads: true
  browser_history: true
  saved_passwords: true
keep:
  printer_settings: true
idle_timeout_minutes: 10
```

> [!WARNING]
> Files saved to a public computer are erased at sign-out. Remind patrons to use a USB drive or email the file to themselves.

## Remote images

Some documents show pictures stored on other websites. Loading such a picture tells that website who is reading. Our reading software asks before it loads a remote picture, and you can say no.

## Links to other websites

Links to other websites open in your normal web browser, not inside the handbook. Before you click, check that the address looks right, for example `https://www.example.org/library`.

## Reporting a problem

If you think a patron's information has been exposed, tell the duty manager straight away and write down what happened. Then follow the [Troubleshooting](Troubleshooting.md) guide to secure the computer.

> [!CAUTION]
> Don't try to recover deleted files yourself. You could overwrite evidence.
