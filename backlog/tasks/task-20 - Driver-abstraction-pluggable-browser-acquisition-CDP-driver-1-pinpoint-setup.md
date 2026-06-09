---
id: TASK-20
title: >-
  Driver abstraction: pluggable browser-acquisition + CDP driver #1 +
  /pinpoint:setup
status: To Do
assignee: []
created_date: '2026-06-09 21:56'
updated_date: '2026-06-09 22:09'
labels:
  - core
dependencies: []
references:
  - docs/superpowers/specs/2026-06-09-driver-abstraction-design.md
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extract today's CDP launch/attach/inject/capture behind a Driver interface in packages/core (no behavior regression), add a per-driver healthCheck, then ship /pinpoint:setup that selects a driver, runs its health check, guides install, and writes a gitignored config + a persistent CDP profile (default ~/.pinpoint/profiles/<project>; opt-in repo-local with guaranteed .gitignore). /start falls back to defaults when no config. Advertise project identity on /health (groundwork for multi-session). Blocked on TASK-19 (overlay modularization) — now landed. Extension driver (#2), multi-session discovery, and container port-exposure are separate future cards. Next: /superpowers:write-plan from the spec.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Driver interface in packages/core; bridge depends on the interface, not CDP directly
- [ ] #2 CDP driver implements it with no behavior regression (Vite integration loop passes unchanged in outcome)
- [ ] #3 Each driver exposes healthCheck() with actionable remedy; used by /start and /setup
- [ ] #4 /pinpoint:setup writes a gitignored config; /start reads it and falls back to defaults when absent
- [ ] #5 CDP driver uses a persistent profile so logins survive across runs; /health advertises project identity
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
docs/superpowers/plans/2026-06-10-driver-abstraction.md
<!-- SECTION:PLAN:END -->
