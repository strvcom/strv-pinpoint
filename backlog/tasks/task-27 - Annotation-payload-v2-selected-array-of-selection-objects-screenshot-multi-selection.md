---
id: TASK-27
title: >-
  Annotation payload v2: selected[] array of selection objects (+ screenshot
  multi-selection)
status: Done
assignee: []
created_date: '2026-06-11 16:14'
updated_date: '2026-06-11 19:52'
labels:
  - feature
dependencies: []
references:
  - docs/superpowers/specs/2026-06-11-annotation-payload-v2-design.md
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Restructure the bridge-contract annotation payload so element/component identity lives under a single selected key: an array of selection objects. selection shape: selector, tagName, text, react (componentName, ancestry); react is null/omitted when there is no fiber. Element-pick annotations: selected has exactly ONE selection. Screenshot annotations: selected may have MULTIPLE selections, resolved to the most-top (outermost) and most-bottom (innermost) element of each touched stack — e.g. for a 'div > section > button' stack, include the div and the button, not section. When React is available, apply the same top/bottom logic using React fiber elements where possible. This replaces the current flat per-item fields (componentName/ancestry/selector/tagName/text). Touches: serialize.ts (the contract — currently marked do-not-change, so this is a deliberate v2), state/types.ts, the reducer, the screenshot capture path (enumerate touched elements), and the consuming pinpoint-paste skill (read selected[]). Design the selection shape to be extended additively by TASK-28 (source-location + identifiers). Brainstorm -> spec -> plan first; this changes the bridge contract. Not part of TASK-23 UX iteration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A selection type (selector, tagName, text, optional react: componentName+ancestry) exists and annotations expose selected: selection[]
- [x] #2 Element pick yields selected length 1; screenshot yields the outermost + innermost touched elements (deduped), React-fiber-aware when available
- [x] #3 serialize.ts contract + types + reducer updated, and the pinpoint-paste skill reads the new selected[] shape
- [x] #4 Non-React elements yield a selection with react omitted/null and no errors
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (merged 743b444). selected[] v2: Selection={selector,tagName,text,react:{componentName,ancestry}|null}; element pick→1 selection, screenshot→grid-sampled elementsFromPoint reduced to outermost-in-region container + innermost leaf per stack (deduped, fiber-aware), best-effort grep targets. Hard-cut v2 (payload version 2, no flat fields); added kind to wire so save-screenshots clips region for screenshots. Touched: selection-probe, new touched-selections.ts, reducer/serialize/types, OverlayRoot producers, Card/usePositioning consumers, clipboard-payload, save-screenshots, pinpoint-paste skill. 6-task subagent-driven TDD + per-task + final review. Live-verified on vite-react: extractor react identity on real fiber, screenshot drag→container+leaf, fiber-less elem→react:null (AC4). Merged onto TASK-29/30 which landed mid-flight (resolved OverlayRoot requestAdd/draft + serialize saved-filter conflicts; migrated TASK-30 draft tests to v2). 253 tests green. Designed for additive TASK-28 (source/identifiers per selection).
<!-- SECTION:NOTES:END -->
