---
id: TASK-13
title: Land overlay v3 on main (task-8 unmerged) + prevent branch drift
status: Done
assignee: []
created_date: '2026-06-08 16:42'
updated_date: '2026-06-08 16:54'
labels:
  - chore
dependencies: []
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PROBLEM: TASK-8 (overlay v3) is marked Done but was never merged. The v3 work (icon Pick/Screenshot toolbar, draggable FAB, anchored cards, persistent nodes, Clear-confirm, green Ready, screenshot tool) lives only on branch 'task-8--overlay-v3' (35 ahead / 14 behind main). main only has overlay v2 (Pick/Region/Off) — so the running bridge serves the old toolbar. The branch predates two big main changes: the P1 MCP removal (clipboard-only) and the packages/ workspace refactor (TASK-10). So a naive rebase/merge would REINTRODUCE the removed MCP server + SSE (sse-server, tools/get-annotations, register-tools). NEXT: rebase/replay ONLY the v3 overlay UX onto current main — i.e. port the v3 overlay-script.ts + clipboard-only screenshot capture onto the new packages/ layout WITHOUT bringing back MCP/SSE. Verify the v3 toolbar serves from a fresh bundle (pnpm build) against examples/vite-react on :5173. ANTI-DRIFT: establish + document the rule that every worktree/task branch MUST merge back to main when its work finishes (local work or fyi-PR) before the card is flipped Done; flipping Done without a merge is what caused this. Consider a guard/checklist in CLAUDE.md + the managing-the-task-board skill.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 v3 overlay toolbar serves on main from a freshly built bundle (no separate branch needed)
- [x] #2 No MCP server or SSE server is reintroduced (repo stays clipboard-only per P1)
- [x] #3 Anti-drift rule documented: task branches merge to main before card -> Done; Done requires a merge
- [x] #4 TASK-8 reflects reality (re-verified merged, not just marked Done)
<!-- AC:END -->
