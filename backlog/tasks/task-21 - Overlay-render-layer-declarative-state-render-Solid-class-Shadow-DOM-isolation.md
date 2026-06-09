---
id: TASK-21
title: >-
  Overlay render layer: declarative state/render (Solid-class) + Shadow DOM
  isolation
status: In Progress
assignee: []
created_date: '2026-06-09 22:12'
labels:
  - refactor
dependencies: []
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the overlay's hand-rolled imperative reconciler (the ~777-line install.ts + draw()/positionAll()) with a lightweight DECLARATIVE render/state layer (Solid or a comparable small lib; React is out — bundle/size + dual-instance risk). Driver is human-maintainability: install.ts is a single 777-line closure that braids create+style+wire+measure+reconcile and must be mentally simulated to reason about. Builds ON TASK-19 (modules + esbuild bundle + happy-dom tests already in place). Folds in the TASK-18 UI fixes (do them on the new model rather than editing the monolith). Brainstorm the target shape first (docs/superpowers/specs/), then plan, then execute. HARD CONSTRAINTS from product owner below as ACs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Overlay UI authored declaratively (no manual draw()/positionAll() DOM reconciliation); install.ts monolith decomposed into focused units (toolbar, picker, screenshot-tool, badge, card, positioning)
- [ ] #2 Positioning still tracks HOST-APPLICATION DOM layout: badges/cards follow picked elements' getBoundingClientRect on scroll/resize/mutation (this capability must be preserved, Shadow DOM or not)
- [ ] #3 Screenshot capture is UNAFFECTED: the bridge can still hide the overlay during Page.captureScreenshot and region/element screenshots work (verify overlay-hide works with whatever isolation approach is chosen)
- [ ] #4 Shadow DOM isolation is acceptable/encouraged IF the above two hold; overlay style no longer leaks to/from the host
- [ ] #5 Stays a self-contained IIFE injected via CDP; bridge keeps zero runtime deps; bundle stays small (framework bundled at build time, tree-shaken)
- [ ] #6 Behavior parity with current overlay (or intentional TASK-18 improvements), covered by happy-dom unit tests
<!-- AC:END -->
