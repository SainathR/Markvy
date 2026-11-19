---
title: Diagrams
author: Digital Services Team
updated: 2026-08-30
tags: [technical, diagrams]
status: Current
---

# Diagrams

Pictures of the most common processes. Each diagram is drawn from a short text description, so it's easy to keep up to date.

## How an e-book loan works

```mermaid
%% Steps a patron goes through to borrow an e-book
flowchart TD
  A[Patron chooses a title] --> B{Copy available?}
  B -- Yes --> C[Catalogue checks loan limit]
  B -- No --> H[Place a hold]
  C -- Under limit --> D[Provider issues licence]
  C -- At limit --> E[Ask patron to return a title]
  D --> F[Book appears in the app]
```

## Self-checkout conversation

```mermaid
%% Messages exchanged when a patron uses the self-checkout kiosk
sequenceDiagram
  participant P as Patron
  participant K as Kiosk
  participant C as Catalogue
  P->>K: Scans library card
  K->>C: Is this card valid?
  C-->>K: Yes, 2 loans, no fines
  P->>K: Scans book
  K->>C: Record loan
  C-->>K: Due 23 November
  K-->>P: Prints receipt
```

## Daily opening routine

![The daily opening routine: switch on computers, check printers, start the session manager, open the desk](../Images/workflow.svg)

## Estimating hold waiting times

When all copies are on loan, the expected wait for a hold is roughly

$$
W \approx \frac{q}{c} \times L
$$

where $q$ is the patron's place in the queue, $c$ is the number of copies and $L$ is the loan period in days. Fifth in line for a title with 3 copies and a 21-day loan means waiting about 35 days.
