---
id: TASK-22
title: 'Overlay dev loop: watch + teardown + auto re-inject (no full restart)'
status: Done
assignee: []
created_date: '2026-06-10 14:32'
updated_date: '2026-06-11 11:47'
labels:
  - feature
dependencies: []
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make the injected overlay hot-iterable in dev so you don't rebuild the bin + restart the bridge + reopen Chrome on every overlay tweak. Vite HMR is out (the overlay isn't served by Vite — it's an esbuild IIFE string pushed over CDP via Page.addScriptToEvaluateOnNewDocument + Runtime.evaluate in cdp-driver.ts:90). Approach: bridge runs esbuild context().watch() on packages/core/src/overlay/** and, on each rebuild, evaluates 'teardown + fresh bundle' on the page over the CDP connection it already holds. Dev-only (the shipped bin/pinpoint is a standalone bundle with no source tree beside it) — gate behind PIN_DEV=1 (and/or a pnpm dev:overlay). The core enabling piece is a TEARDOWN contract that doesn't exist today: index.tsx only ever installs and guards on window.__pinpointOverlayInstalled, so re-injecting a new bundle is a silent no-op and clearing the guard alone would STACK a second overlay (new host appended; old host + document-level listeners still live). Next: brainstorm target shape in docs/superpowers/specs/, then plan, then execute (TDD).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 index.tsx installs window.__pinpointTeardown(): render(null, mount) to run Preact useEffect cleanups, remove the [data-pinpoint] host element, dispose installSelectionProbe()/installBridgeLink() listeners, and delete window.__pinpointOverlayInstalled — leaving the page with zero pinpoint DOM/listeners (verifiable)
- [ ] #2 installSelectionProbe() and installBridgeLink() return disposers (or expose teardown) so all document/window listeners they register are removed by __pinpointTeardown
- [ ] #3 Re-injecting the bundle after teardown mounts exactly ONE overlay (no stacked hosts, no duplicate listeners); idempotency guard still prevents accidental double-install
- [ ] #4 Dev watch mode (PIN_DEV=1 / pnpm dev:overlay) rebuilds overlay on save and auto re-injects (teardown + fresh bundle) over the existing CDP connection — no bin rebuild, no bridge restart, no Chrome reopen
- [ ] #5 Production path unchanged: default 'pinpoint' (no PIN_DEV) does not watch/rebuild and behaves exactly as today; shipped bin has no source-tree dependency
- [ ] #6 Annotation-state behavior on reload is defined and documented (v1 may reset state on re-inject; note it in the spec)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
docs/superpowers/plans/2026-06-10-overlay-dev-loop.md
<!-- SECTION:PLAN:END -->
