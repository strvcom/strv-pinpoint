---
id: TASK-33
title: >-
  Driver packages + capture contract: split @pinpoint/driver-*, client-side
  getDisplayMedia capture, bookmarklet driver
status: In Progress
assignee: []
created_date: '2026-06-12 13:30'
updated_date: '2026-06-12 13:39'
labels:
  - architecture
dependencies: []
references:
  - docs/superpowers/specs/2026-06-12-driver-packaging.md
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split the browser concerns out of @pinpoint/core into their own packages so more drivers can be added without a dependency cycle. SCOPE = PACKAGING + COMPOSITION ROOT only — no new capture behavior; client getDisplayMedia + the bookmarklet are TASK-34. Extract: (a) @pinpoint/overlay — the browser-side Preact UI (src/overlay/*) + its esbuild bundle artifact; depends on @pinpoint/core TYPE-ONLY for wire/protocol types (erased at build → zero runtime coupling into the browser bundle). (b) @pinpoint/driver-cdp — the concrete CDP driver (src/cdp/*, driver/cdp-driver, launch-chrome, overlay-script, the CdpPage impl of BridgePage); injects the @pinpoint/overlay bundle via CDP; KEEPS today's server-side screenshot capture unchanged. @pinpoint/core keeps the engine: bridge server, sessions, annotations, clipboard, wire types, and the Driver/BridgePage interfaces (abstract contract) — and depends on NO driver. KEY INSIGHT: the cycle a naive split creates comes from core importing the concrete driver (buildDriver in cli.ts hardcodes createCdpDriver while the driver imports core for the interface). FIX = COMPOSITION ROOT: move the driver registry + CLI wiring OUT of core into a top-level agent-agnostic @pinpoint/cli that depends on core + driver-cdp; @pinpoint/claude-code bundles that entry to bin/pinpoint. Resulting graph is acyclic: claude-code → cli → {core, driver-cdp → {core, overlay → core(type-only)}}. Registry can hold one entry (cdp default) for now; richer config-selection lands with TASK-34. Keep all 263 tests green; rewire build (pnpm -r) + the esbuild entry path. Open decision for the spec: whether the composition root is a standalone @pinpoint/cli or just lives in claude-code. COUPLING with in-progress TASK-32 (commits bundled bin/pinpoint): low textual overlap (different package.json fields) but this restructure changes the bundled artifact AND the esbuild entry path, so whichever merges second must rebuild bin + re-point the esbuild entry. NEXT: write the referenced spec → superpowers:writing-plans before any code.
<!-- SECTION:DESCRIPTION:END -->
