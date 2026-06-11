---
id: TASK-25
title: 'Dev loop: overlay does not survive a page reload (PIN_DEV reinject resilience)'
status: To Do
assignee: []
created_date: '2026-06-11 15:35'
labels:
  - bug
dependencies: []
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Discovered while iterating in the TASK-22 hot loop: after a manual browser reload of the target page, the overlay does NOT come back. Verified over CDP: post-reload there is no [data-pinpoint] host AND window.__pinpointConfig is undefined, i.e. the bridge's Page.addScriptToEvaluateOnNewDocument bootstrap is not re-running on reload. The overlay only restores on the next file-change reinject (Runtime.evaluate). TASK-22's design claimed 'reinject swaps the on-new-document bootstrap so reloads use fresh code', but that path was never verified against a real page reload (only file-change reinject + DevTools console). Investigate why the on-new-document script does not fire on reload under the dev/CDP flow (session-scoping of addScriptToEvaluateOnNewDocument? target re-creation on navigation? id-swap removing without re-adding?) and make the dev loop reload-resilient. NOT caused by TASK-23 UI changes (those render correctly: orb bottom-right, visible, interactive; screenshot drag fixed).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 After a full browser reload of the target page in PIN_DEV mode, the overlay re-injects automatically (host present, FAB visible) with no manual file edit
- [ ] #2 Root cause identified and documented (why addScriptToEvaluateOnNewDocument did not re-run on reload in the dev flow)
- [ ] #3 Add a regression test or documented manual-verification step for page-reload resilience
<!-- AC:END -->
