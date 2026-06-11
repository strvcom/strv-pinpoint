---
id: TASK-24
title: 'Overlay: animated sliding indicator behind tool toggles'
status: In Progress
assignee: []
created_date: '2026-06-11 13:35'
updated_date: '2026-06-11 16:16'
labels:
  - feature
dependencies: []
references:
  - docs/superpowers/plans/2026-06-11-tool-indicator.md
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Polish (item 4 of the round-2 batch): a background highlight that slides/floats behind the active tool button when switching tools (Pick to Screenshot), and floats in/out as a tool is selected or deselected. Ties into the no-default-tool change (TASK-23 #3): with no tool selected the indicator is hidden, and floats in behind the chosen tool. Currently the active tool is shown via .pp-active (solid background on the button) in styles.ts/Fab.tsx; this replaces that with an animated moving pill behind the two tool buttons. Design the motion (slide vs fade-in-place), handle the 2-button group geometry in Fab.tsx, keep it inside the shadow-DOM CSS.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An indicator element animates behind the active tool toggle when switching between the two tools (slide transition), inside the overlay shadow CSS
- [ ] #2 With no tool selected (default open state) the indicator is hidden; selecting a tool floats it in behind that button; deselecting floats it out
- [ ] #3 Replaces the current .pp-active solid-background treatment without regressing button hover/active affordances; verified live
<!-- AC:END -->
