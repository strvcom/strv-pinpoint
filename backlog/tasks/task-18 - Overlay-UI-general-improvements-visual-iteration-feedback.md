---
id: TASK-18
title: 'Overlay UI: general improvements (visual-iteration feedback)'
status: Done
assignee: []
created_date: '2026-06-09 17:41'
updated_date: '2026-06-10 00:04'
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
- [x] #1 Copy button is inactive/disabled while there is nothing to copy (no annotations yet)
- [x] #2 Copy button shows 'Copied ✓' only briefly, then reverts to 'Copy' after a short timeout
- [x] #3 Clicking a floating number badge immediately toggles its annotation box (open if closed, close if open) — currently needs a second click
- [x] #4 Remove the redundant 'include screenshot of this' control from the screenshot/region tool
- [x] #5 Picked (selected) elements include a screenshot by default
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered via TASK-21 (overlay declarative render layer): all 5 fixes implemented natively on the Preact model and live-verified on the example app — Copy disabled-when-empty + transient Copied; one-click badge toggle (double-click bug gone); no camera toggle on screenshot cards; picked elements default wantScreenshot=true. The original task-18 plan (against the old monolith) is superseded.
<!-- SECTION:NOTES:END -->
