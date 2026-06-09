---
id: TASK-15
title: 'bridge: add GET /health readiness endpoint'
status: Done
assignee: []
created_date: '2026-06-09 14:52'
updated_date: '2026-06-09 15:00'
labels:
  - enhancement
dependencies: []
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a readiness route to the overlay bridge server (packages/core/src/server/bridge-server.ts). GET /health returns 200 with { ok: true, appUrl, sessionId } so consumers can unambiguously detect the bridge is up and confirm what it connected to — instead of inferring from a 404 on an unknown route (as the TASK-10 run had to). Thread appUrl + sessionId through BridgeServerDeps so the route can report them. Add a unit test. Cross-links TASK-13 (the start command should poll /health when present).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 GET /health returns 200 with { ok: true, appUrl, sessionId }
- [x] #2 appUrl + sessionId are threaded into bridge-server via deps and reported by the route
- [x] #3 unit test covers the /health route (200 + payload shape)
- [x] #4 existing overlay routes (/session/*/events|send|ack) unaffected; gates green
<!-- AC:END -->









## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Sibling: TASK-14 (start command robustness) consumes this /health route. (Inline 'TASK-13' in the description means TASK-14.)
<!-- SECTION:NOTES:END -->
