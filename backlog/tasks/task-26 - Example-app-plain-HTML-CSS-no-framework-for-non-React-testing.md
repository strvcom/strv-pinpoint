---
id: TASK-26
title: 'Example app: plain HTML/CSS (no framework) for non-React testing'
status: To Do
assignee: []
created_date: '2026-06-11 16:14'
labels:
  - feature
dependencies: []
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a framework-free example under examples/ (alongside examples/vite-react): plain HTML + CSS, no React/JSX, served by a minimal dev server so /pinpoint:start can point PIN_APP_URL at it. Purpose: validate pinpoint where there is NO React fiber to walk. Expected: React identity comes back empty (no fiber) while selector/tagName/text/rect still populate; the pick/screenshot/Send loop works end-to-end and the pasted JSON stays actionable (grep by selector/text/tag). Exercises the framework-agnostic-core guardrail and pairs with TASK-27/28 (for non-React apps the DOM selector + unique identifiers become the primary context). Not now — capture for later.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 New examples/<name> (plain HTML/CSS, no framework deps) with a dev server startable via the repo package manager on a detectable port
- [ ] #2 /pinpoint:start (or PIN_APP_URL) injects the overlay and the pick/screenshot/Send loop completes against it
- [ ] #3 Picking an element populates selector/tagName/text/rect and yields empty React identity gracefully (no errors) — confirms the non-React fallback path
- [ ] #4 Listed/documented as an example (brief README note)
<!-- AC:END -->
