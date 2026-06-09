---
id: TASK-16
title: Sever upstream frontman + scrub old name across all docs
status: To Do
assignee: []
created_date: '2026-06-09 15:49'
labels:
  - chore
dependencies: []
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pinpoint has fully diverged from upstream frontman; sever the relationship and finish the name scrub (follow-up to TASK-11). (a) SEVER: remove the .reference/frontman clone + scripts/sync-reference.sh; drop CLAUDE.md 'Upstream reference' + 'License boundary' sections + frontman-derivative framing; remove README's frontman background note. (b) SCRUB our old name everywhere (incl. historical docs/superpowers + decisions + START_HERE): frontman-flow->pinpoint, __frontmanFlow->__pinpoint, data-frontman->data-pinpoint, FF_->PIN_. (c) KEEP genuine upstream refs (frontman-ai/_server/client/protocol/core/nextjs) as accurate history. (d) Fix adjacent stale CLAUDE.md (examples/nextjs removed -> Vite; ports). Exclude backlog/ (CLI-owned).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 .reference/frontman + scripts/sync-reference.sh removed; CLAUDE.md Upstream/License sections + README background gone; reframed standalone
- [ ] #2 frontman-flow (+ __frontmanFlow, data-frontman, FF_) scrubbed to pinpoint across all tracked docs except backlog/
- [ ] #3 genuine upstream-frontman references preserved where historically accurate (frontman-ai/_server/etc.)
- [ ] #4 no stale live-doc refs (nextjs example/3100); gates green
<!-- AC:END -->
