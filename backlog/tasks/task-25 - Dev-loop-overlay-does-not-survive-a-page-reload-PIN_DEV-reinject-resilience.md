---
id: TASK-25
title: 'Dev loop: overlay does not survive a page reload (PIN_DEV reinject resilience)'
status: Done
assignee: []
created_date: '2026-06-11 15:35'
updated_date: '2026-06-11 16:02'
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
- [x] #1 After a full browser reload of the target page in PIN_DEV mode, the overlay re-injects automatically (host present, FAB visible) with no manual file edit
- [x] #2 Root cause identified and documented (why addScriptToEvaluateOnNewDocument did not re-run on reload in the dev flow)
- [x] #3 Add a regression test or documented manual-verification step for page-reload resilience
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Not reproducible — closed as works-as-designed. 7 isolated CDP reproductions (static page, real Vite page, real overlay bundle, the real bridge code CdpDriver->CdpPage->overlay-watch, headless + headful, initial-inject + reinject-swap, location.reload + Page.reload) all show the overlay re-injects on a confirmed reload (post-inject sentinel wiped + timeOrigin changed; __pinpointConfig + [data-pinpoint] host + __pinpointOverlayInstalled all present). The TASK-22 on-new-document swap claim holds. AC1 behavior already satisfied by current code; AC2/AC3 documented in docs/decisions.md (2026-06-11) + docs/superpowers/notes/reload-resilience-check.md. Separate robustness gap noted for a future card: cdp-connection.ts has no WS onclose/onerror, so a dead session hangs every send() silently. Merge: a054091 on main.
<!-- SECTION:NOTES:END -->
