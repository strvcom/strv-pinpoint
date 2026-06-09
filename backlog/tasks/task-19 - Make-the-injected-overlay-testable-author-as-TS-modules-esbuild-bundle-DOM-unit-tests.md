---
id: TASK-19
title: >-
  Make the injected overlay testable: author as TS modules + esbuild bundle +
  DOM unit tests
status: In Progress
assignee: []
created_date: '2026-06-09 18:05'
labels:
  - refactor
dependencies: []
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today the entire overlay is a hand-written ~210-line template-literal string (OVERLAY_SOURCE in packages/core/src/cdp/overlay-script.ts): never type-checked as code, no unit tests, only a parse-check + manual/gated live-CDP integration. The string is an injection-TRANSPORT requirement (CDP injects one self-contained script into the page), NOT an authoring requirement. Re-author the overlay as real TS modules and bundle them to the IIFE string at build time with esbuild (already in our toolchain for the claude-code bridge), unlocking happy-dom/jsdom unit tests. Prereq for re-doing TASK-18 fixes test-first. Branch: task-19--overlay-modularization.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Overlay logic lives in real .ts modules (state model, Copy-button render, badge toggle, card build, host-global seams) under packages/core/src, not inside a template string
- [ ] #2 An esbuild step bundles the overlay entry to a single self-contained IIFE string and is wired into 'pnpm build'; OVERLAY_SOURCE resolves to that bundle
- [ ] #3 Host-global seams (window.__pinpointExtractSelection / __pinpointLink) still attach correctly after bundling; existing parse-check + live integration tests stay green
- [ ] #4 happy-dom (or jsdom) is set up for vitest (per-file env, node stays default) and overlay logic has unit tests runnable via 'pnpm test'
- [ ] #5 No behavior change to the shipped overlay vs current main (pure refactor); verified visually in the live bridge
<!-- AC:END -->
