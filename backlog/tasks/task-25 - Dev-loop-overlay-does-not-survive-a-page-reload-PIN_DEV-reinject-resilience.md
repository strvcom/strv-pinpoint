---
id: TASK-25
title: 'Dev loop: overlay does not survive a page reload (PIN_DEV reinject resilience)'
status: In Progress
assignee: []
created_date: '2026-06-11 15:35'
updated_date: '2026-06-11 15:41'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause pinned down (CDP diagnosis during TASK-23 iteration): the bridge holds ONE persistent CDP connection and its Runtime.evaluate targets the page's ORIGINAL execution context. When the target page reloads, that context is destroyed and a new one is created, but the bridge keeps evaluating against the old one — so reinject calls still resolve at the protocol level (the dev loop logs 'overlay re-injected') yet land on a dead context and never touch the live page. Proven: after a reload, editing source rebuilt dist correctly (esbuild fine) and the bridge logged a reinject, but the live orb did NOT change; injecting the SAME dist over a FRESH CDP connection to the current page DID change it. Fix direction: the bridge must observe Page.frameNavigated / executionContextCreated (or Page.loadEventFired) and re-bind (re-run injectBootstrap against the new context) on every navigation — not only at connect. Workaround today: restart the bridge (it re-attaches to the existing Chrome on :9222 and binds the fresh context; no new window).
<!-- SECTION:NOTES:END -->
