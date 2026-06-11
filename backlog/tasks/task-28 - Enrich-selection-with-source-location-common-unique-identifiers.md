---
id: TASK-28
title: Enrich selection with source location + common unique identifiers
status: Done
assignee: []
created_date: '2026-06-11 16:14'
updated_date: '2026-06-11 20:04'
labels:
  - feature
dependencies: []
references:
  - docs/superpowers/specs/2026-06-11-selection-source-identifiers-design.md
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend the selection shape (from TASK-27) additively with two high-value context fields. (1) SOURCE LOCATION when available: file + line of the element component, parsed from the React fiber _debugStack. Verified live: frames look like 'at Hero (http://localhost:5173/src/App.tsx:23:20)' — React 19 dropped _debugSource, but _debugStack still carries file:line. Put under react.source (file, line); degrade gracefully when absent (prod / non-React). (2) COMMON UNIQUE IDENTIFIERS from the DOM: id, data-testid/data-test, aria-label, role, name — the cheap, highly-greppable signals that pin source fastest. NON-GOALS (explicit, per product owner): no XPath, no component props. Depends on TASK-27 (selection model). Touches: serialize contract, the selection-probe, and the pinpoint-paste skill. Should work on the React example (source present) and degrade on the HTML/CSS example (identifiers only). Not part of TASK-23 UX iteration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 selection carries common identifiers (id, data-testid/data-test, aria-label, role, name) when present on the element
- [x] #2 selection carries source file:line when derivable from the React fiber _debugStack; absent gracefully otherwise
- [x] #3 Explicitly NOT included: XPath, component props
- [x] #4 Contract + probe + pinpoint-paste skill updated; verified on the React example (source present) and the HTML/CSS example (identifiers only)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (merged b843e92). Additive to TASK-27 Selection: identifiers {id,testId(data-testid||data-test),ariaLabel,role,name} (present-only) + react.source {file,line} parsed from the element fiber _debugStack (first app-source frame, skipping node_modules/.vite; new URL().pathname). Only the extractor + Selection type (2 copies) + pinpoint-paste skill changed (+1 line in OverlayRoot.onPick to pass identifiers, since the field is required); reducer/serialize/clipboard pass selected[] opaquely. No XPath, no props (AC3). Live-verified: vite-react #hero-heading -> identifiers.id + react.source{file:'/src/App.tsx',line:7}; vite-plain button[data-testid] -> identifiers{testId,ariaLabel}, react:null, no source, no errors. 257 tests; subagent-driven TDD + review. Paste skill prefers source>identifiers>componentName>text/selector.
<!-- SECTION:NOTES:END -->
