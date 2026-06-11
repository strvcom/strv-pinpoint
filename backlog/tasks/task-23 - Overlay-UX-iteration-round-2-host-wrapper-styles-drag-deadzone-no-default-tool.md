---
id: TASK-23
title: >-
  Overlay UX iteration (round 2): host-wrapper styles, drag deadzone, no default
  tool
status: In Progress
assignee: []
created_date: '2026-06-11 13:33'
updated_date: '2026-06-11 15:10'
labels:
  - feature
dependencies: []
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Living iteration card for the current round of overlay UX tweaks (dogfooded via pnpm dev:overlay hot loop from TASK-22). Keep updating this card as new requests arrive in the same session. Items so far: (1) host-wrapper styles; (2) drag deadzone; (3) no default tool. Item 4 (animated tool indicator) split to its own card.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Host [data-pinpoint] wrapper: investigate the reported scrolling issue and simplify its styles. The interactive sub-layers (Toolbar fixed, MarksLayer fixed inset:0, Hover/Marquee fixed) already self-position vs the viewport, and cards/badges set pointer-events:auto while layers set none. Determine the minimal host styles such that: (a) page behind the overlay stays scrollable + interactive, (b) screenshot-hide via [data-pinpoint]{visibility:hidden} still works, (c) FAB + cards stay interactive. Verify live (no scroll regression, page clickable behind overlay).
- [ ] #2 Drag deadzone: a click with sub-pixel/tiny pointer movement must TOGGLE the FAB (open/close), not start a drag; same for annotation cards (no accidental drags). Root cause: useDrag computes a 3px moved flag only for onEnd, but the FAB onMove sets dragMovedRef + repositions on every pointermove. Fix in useDrag so onMove only fires after movement crosses a ~4-5px deadzone; covers FAB + card drag. Add/extend a useDrag unit test asserting sub-threshold moves do not trigger onMove and a clean click is not treated as a drag.
- [ ] #3 No default selected tool: opening the FAB must NOT auto-activate the Pick tool (handleOrbClick currently dispatches setMode 'pick' on open). After change, opening shows the toolbar with no active tool (mode null) until the user clicks Pick or Screenshot. Initial state already has mode:null.
- [ ] #4 Toggle-off active tool: clicking the currently-selected tool deselects it (mode -> null, back to no-tool state)
- [ ] #5 Neutral cursor while selecting: with Pick or Screenshot active, page elements show the default cursor (not their own pointer/text cursors); the overlay's own cursors are preserved
- [ ] #6 Screenshot marquee drag works: click-drag on the page creates and expands a region of the dragged size (was stuck at ~0x0 due to an effect re-running mid-drag and resetting drag state)
<!-- AC:END -->
