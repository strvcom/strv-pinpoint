---
id: TASK-31
title: 'Annotation comment: minimal markdown formatting (lists only)'
status: To Do
assignee: []
created_date: '2026-06-11 18:09'
labels:
  - feature
dependencies: []
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the plain comment textarea in the annotation Card with a minimal rich-text editor that stores Markdown. Choose an existing small editor/lib that outputs markdown (evaluate at design time for fit with the bundled shadow-DOM overlay + Preact build + the zero-dep bin constraint — favor a tiny dep or a minimal contenteditable). Product-owner constraints: NO headings/titles, NO formatting toolbar or large block-format UI — keep it simple; the MOST complex formatting allowed is list types (bullet + ordered). Inline emphasis (bold/italic) only if it comes essentially free. The stored comment becomes markdown (flows into the clipboard JSON comment field). Overlaps TASK-30 (save/draft) since both modify Card — sequence AFTER TASK-30. Brainstorm the tool choice + exact minimal feature set first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Comment supports bullet + ordered lists; NO headings and NO formatting toolbar/large block UI
- [ ] #2 Stored/serialized comment is markdown text
- [ ] #3 Uses an existing markdown editor approach that fits the shadow-DOM overlay without unreasonable bundle bloat (choice justified)
- [ ] #4 Verified live in the overlay
<!-- AC:END -->
