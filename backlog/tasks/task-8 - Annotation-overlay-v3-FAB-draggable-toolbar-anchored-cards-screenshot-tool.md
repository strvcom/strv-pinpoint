---
id: TASK-8
title: >-
  Annotation overlay v3 (FAB + draggable toolbar + anchored cards + screenshot
  tool)
status: To Do
assignee: []
created_date: '2026-06-07 19:39'
labels:
  - feature
dependencies: []
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Collapse controls behind a single DRAGGABLE FAB (defaults bottom-right, inline-editor style). FAB expands to a toolbar: Pick / Screenshot / Send / Clear + show-hide annotations. Annotation cards FLOAT anchored to their numbered badge near each element (not a fixed panel); show/hide-able. Replace the dead 'Region' with a real SCREENSHOT tool: click -> drag a freeform rect anywhere -> annotation = cropped screenshot + optional description, persisted with an anchor/card and surfaced via get_annotations (screenshotClip of the rect). Dependency-free vanilla JS injected via CDP; keep get_selection/get_annotations contracts.
<!-- SECTION:DESCRIPTION:END -->
