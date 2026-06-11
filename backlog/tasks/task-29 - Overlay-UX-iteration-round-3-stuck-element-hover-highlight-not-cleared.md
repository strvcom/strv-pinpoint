---
id: TASK-29
title: 'Overlay UX iteration (round 3): stuck element-hover highlight not cleared'
status: In Progress
assignee: []
created_date: '2026-06-11 17:25'
updated_date: '2026-06-11 17:25'
labels:
  - bug
dependencies: []
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found live on the vite-plain example: the blue element-hover highlight (HoverLayer) gets stuck on screen and never clears when (a) the cursor leaves the browser window/tab, (b) the toolbar is closed, or (c) the Pick tool is disabled/deselected. Root cause: usePicker updates the hover rect on mousemove only while mode==='pick', and only clears it (onHover(null)) on a successful pick-click; nothing clears it when picking stops, so HoverLayer keeps rendering the last rect. Fix: in usePicker, clear the hover (onHover(null)) whenever mode !== 'pick' (covers tool-disable / toolbar-close / mode-switch) and add a document mouseout handler that clears it when the pointer leaves the window (relatedTarget == null). Living iteration card — append further round-3 overlay UX bugs here as found.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Hover highlight disappears immediately when the Pick tool is deselected or the toolbar is closed (mode leaves 'pick')
- [ ] #2 Hover highlight disappears when the cursor leaves the browser window/tab while picking
- [ ] #3 usePicker unit test covers the clear-on-mode-change and clear-on-window-leave paths
<!-- AC:END -->
