---
id: TASK-30
title: 'Annotation save/draft flow: not persisted until saved'
status: In Progress
assignee: []
created_date: '2026-06-11 18:09'
updated_date: '2026-06-11 18:10'
labels:
  - feature
dependencies: []
references:
  - docs/superpowers/specs/2026-06-11-annotation-save-draft-design.md
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Redesign the annotation lifecycle around an explicit Save. New picks/screenshots start as unsaved DRAFTS and are NOT persisted to the clipboard JSON until saved. Item gains saved:boolean (addElement/addScreenshot set false; new saveItem action flips true); serialize.ts filters to saved===true (overlaps TASK-27 serialize work — do TASK-30 first). Draft card: comment + Save button bottom-right, NO minimize/close; trash discards immediately (no confirm, never saved) and Escape discards; click-away keeps it open; Shift+Enter saves. Saved card: today controls (minimize/close/camera/delete), reopen via badge. Save (button or Shift+Enter) commits then collapses to the badge. One draft at a time across element+screenshot: a new pick while a draft is open discards the old draft — silently if empty, else a ConfirmRow ('discard unsaved annotation?') gates opening the new one. Copy/Send auto-saves the open draft first, then sends the saved set. Approved design 2026-06-11.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 New picks/screenshots are unsaved drafts; only saved annotations appear in the serialized clipboard payload
- [ ] #2 Draft card shows a Save button (bottom-right) and no minimize/close; Shift+Enter saves; Save collapses the card to its badge
- [ ] #3 Discard: trash button and Escape discard a draft immediately; picking a new element discards the draft, confirming first only if it has comment text
- [ ] #4 Copy/Send saves the currently-open draft before sending the saved set
- [ ] #5 Both element and screenshot annotations follow the draft/save flow
<!-- AC:END -->
