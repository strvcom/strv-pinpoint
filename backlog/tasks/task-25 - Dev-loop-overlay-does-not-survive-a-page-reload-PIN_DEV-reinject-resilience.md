---
id: TASK-25
title: 'Dev loop: overlay does not survive a page reload (PIN_DEV reinject resilience)'
status: To Do
assignee: []
created_date: '2026-06-11 14:31'
labels:
  - bug
dependencies: []
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Discovered while iterating in the TASK-22 hot loop: after a manual browser reload of the target page, the overlay does NOT come back (no [data-pinpoint] host, and even window.__pinpointConfig is undefined post-reload, meaning the bridge's Page.addScriptToEvaluateOnNewDocument bootstrap is not re-running on reload). The overlay only restores on the next file-change reinject (which runs Runtime.evaluate). TASK-22's design claimed 'reinject swaps the on-new-document bootstrap so reloads use fresh code', but that path was never verified against a real page reload (only file-change reinject + DevTools console were checked). Investigate why the on-new-document script isn't firing on reload under the dev/CDP flow (session-scoping of addScriptToEvaluateOnNewDocument? target re-creation? id-swap removing without re-adding?) and make the dev loop reload-resilient. Not caused by TASK-23 UI changes — those render correctly (verified via CDP: orb at bottom-right, visible, interactive).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 After a full browser reload of the target page in PIN_DEV mode, the overlay re-injects automatically (host present, FAB visible) without needing a manual file edit
- [ ] #2 Root cause identified and documented (why addScriptToEvaluateOnNewDocument did not re-run on reload in the dev flow)
- [ ] #3 Add a regression test or a documented manual-verification step covering page-reload resilience
<!-- AC:END -->
