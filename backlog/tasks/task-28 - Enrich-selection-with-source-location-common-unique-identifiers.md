---
id: TASK-28
title: Enrich selection with source location + common unique identifiers
status: To Do
assignee: []
created_date: '2026-06-11 16:14'
labels:
  - feature
dependencies: []
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend the selection shape (from TASK-27) additively with two high-value context fields. (1) SOURCE LOCATION when available: file + line of the element component, parsed from the React fiber _debugStack. Verified live: frames look like 'at Hero (http://localhost:5173/src/App.tsx:23:20)' — React 19 dropped _debugSource, but _debugStack still carries file:line. Put under react.source (file, line); degrade gracefully when absent (prod / non-React). (2) COMMON UNIQUE IDENTIFIERS from the DOM: id, data-testid/data-test, aria-label, role, name — the cheap, highly-greppable signals that pin source fastest. NON-GOALS (explicit, per product owner): no XPath, no component props. Depends on TASK-27 (selection model). Touches: serialize contract, the selection-probe, and the pinpoint-paste skill. Should work on the React example (source present) and degrade on the HTML/CSS example (identifiers only). Not part of TASK-23 UX iteration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 selection carries common identifiers (id, data-testid/data-test, aria-label, role, name) when present on the element
- [ ] #2 selection carries source file:line when derivable from the React fiber _debugStack; absent gracefully otherwise
- [ ] #3 Explicitly NOT included: XPath, component props
- [ ] #4 Contract + probe + pinpoint-paste skill updated; verified on the React example (source present) and the HTML/CSS example (identifiers only)
<!-- AC:END -->
