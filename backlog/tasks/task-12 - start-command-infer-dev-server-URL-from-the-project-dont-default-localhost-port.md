---
id: TASK-12
title: >-
  start command: infer dev-server URL from the project (don't default
  localhost:port)
status: To Do
assignee: []
created_date: '2026-06-08 16:38'
labels:
  - enhancement
dependencies: []
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The /frontman-flow:start command (packages/claude-code/commands/start.md) currently asks for / assumes http://localhost:5173. Instead it should INSPECT the project to infer where the dev server runs, then act: read package.json scripts (the 'dev' script + its flags), framework config (vite.config port/strictPort, next.config, astro, etc.), and common conventions to determine the URL/port; probe whether that server is already up; if it is, use it; if not, suggest the exact command to start it (or offer to run it) rather than guessing a port. Only fall back to asking the user when inference is genuinely ambiguous. Goal: 'it figures out my app' instead of a hardcoded default. Engine note: FF_APP_URL still works as an explicit override.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 start no longer hardcodes/defaults a localhost:PORT
- [ ] #2 infers the dev URL/port from package.json dev script + framework config (Vite/Next/etc.)
- [ ] #3 probes whether the dev server is already running and reuses it if so
- [ ] #4 if not running, surfaces the exact start command (or offers to run it) instead of assuming
- [ ] #5 falls back to asking the user only when the URL can't be inferred; FF_APP_URL still overrides
<!-- AC:END -->
