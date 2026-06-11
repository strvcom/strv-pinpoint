---
id: TASK-24
title: 'Overlay: animated sliding indicator behind tool toggles'
status: Done
assignee: []
created_date: '2026-06-11 13:35'
updated_date: '2026-06-11 16:33'
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
- [x] #1 An indicator element animates behind the active tool toggle when switching between the two tools (slide transition), inside the overlay shadow CSS
- [x] #2 With no tool selected (default open state) the indicator is hidden; selecting a tool floats it in behind that button; deselecting floats it out
- [x] #3 Replaces the current .pp-active solid-background treatment without regressing button hover/active affordances; verified live
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done. Single .pp-tool-indicator pill slides behind the active tool (translateX 0->38) and floats in/out (opacity+scale) driven purely by mode; lastToolRef keeps it at the last slot so deselect floats out in place. .pp-active is now color-only. Geometry from constants (TOOL_W=34/GAP=4), not offsetWidth, so it stays unit-testable under happy-dom. 6 new Toolbar tests; 225 pass. Live-verified on examples/vite-react: pre-merge full slide (Pick x=665 -> Screenshot x=703, screenshots captured) + post-merge open=hidden (no-default-tool). Merged cleanly onto TASK-23 (which landed mid-task): TASK-23 #3/#4 (no-default-tool + toggle-off) now drive mode->null, which the indicator already handles, so AC2's 'default-open hidden' is fully live. Only the generated overlay bundle conflicted (regenerated from merged source). Decision logged 2026-06-11. Merge d600e8e on main.
<!-- SECTION:NOTES:END -->
