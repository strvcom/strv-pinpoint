---
id: TASK-18
title: 'Overlay UI: general improvements (visual-iteration feedback)'
status: In Progress
assignee: []
created_date: '2026-06-09 17:41'
updated_date: '2026-06-09 17:51'
labels:
  - feature
dependencies: []
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Running list of overlay UX fixes gathered while iterating visually on the overlay against examples/vite-react. Open/accumulating — do not close until Lucas signals the feedback round is complete. Each AC is one discrete fix.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Copy button is inactive/disabled while there is nothing to copy (no annotations yet)
- [ ] #2 Copy button shows 'Copied ✓' only briefly, then reverts to 'Copy' after a short timeout
- [ ] #3 Clicking a floating number badge immediately toggles its annotation box (open if closed, close if open) — currently needs a second click
- [ ] #4 Remove the redundant 'include screenshot of this' control from the screenshot/region tool
- [ ] #5 Picked (selected) elements include a screenshot by default
<!-- AC:END -->
