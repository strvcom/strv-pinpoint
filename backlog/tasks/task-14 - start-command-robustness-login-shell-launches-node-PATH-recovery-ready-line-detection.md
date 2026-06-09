---
id: TASK-14
title: >-
  start command robustness: login-shell launches + node-PATH recovery +
  ready-line detection
status: To Do
assignee: []
created_date: '2026-06-09 14:52'
labels:
  - enhancement
dependencies: []
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the live TASK-10 run, the loop came up but took 2 restarts + ~9 extra calls. Make /frontman-flow:start (packages/claude-code/commands/start.md) robust generically — no hardcoded node version, no reliance on the host project's CLAUDE.md. (a) Launch long-running processes (the dev server AND the bridge) through the user's login shell (e.g. $SHELL -lic '...' / bash -lic) so their version-manager toolchain PATH applies — nvm/fnm/volta users' node/pnpm resolve as in their terminal. (b) On exit 127 / 'command not found', locate node across common managers ($NVM_DIR or ~/.nvm/versions/node/*/bin, ~/.fnm, ~/.volta/bin, asdf which node) and prepend, then retry. (c) Detect bridge readiness by waiting for its stdout line 'frontman-flow bridge on <url> · session <id>' (printed AFTER inject+serve), not by port-poking or treating a 404 as up; use GET /health once TASK-14 lands. Goal: comes up first-try in any project.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 dev server + bridge are launched via the user's login shell so their toolchain PATH applies (no hardcoded node version)
- [ ] #2 exit 127 / node-not-found is recovered by locating node across common version managers, then retrying
- [ ] #3 bridge readiness is detected via the printed ready line (or GET /health), not '404 means up'
- [ ] #4 does not depend on the host project's CLAUDE.md/notes for runtime PATH
- [ ] #5 loop comes up without manual PATH fixes in a fresh project checkout
<!-- AC:END -->
