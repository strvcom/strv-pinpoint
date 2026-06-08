---
id: TASK-10
title: 'Self-contained plugin: clipboard-only + raw-CDP bridge + one-command loop'
status: In Progress
assignee: []
created_date: '2026-06-08 00:01'
updated_date: '2026-06-08 10:10'
labels:
  - chore
dependencies: []
references:
  - docs/superpowers/specs/2026-06-08-plugin-clipboard-cdp-design.md
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Collapse the runtime to one delivery path + ship as a Claude Code plugin. P1: delete the MCP server (clipboard/paste is the sole path; drop tools + sdk). P2: replace Playwright with raw CDP over Node's built-in WebSocket; bridge launches Chrome. P3: package as a plugin (command + skills + bundled JS) and make examples/vite-react a minimal .claude/ harness that installs the local plugin so 'claude' + the command runs the full loop. Rename is a separate task. Spec: docs/superpowers/specs/2026-06-08-plugin-clipboard-cdp-design.md
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
P1 (clipboard-only) + P2 (raw CDP, no Playwright) COMPLETE and merged to main. @frontman-flow/core has ZERO runtime deps. P2 verified live: loop+vite integration suites pass against real headless Chrome (inject via Page.addScriptToEvaluateOnNewDocument, screenshots via Page.captureScreenshot, Chrome auto-launch/attach via /json). Plans: docs/superpowers/plans/2026-06-08-p1-strip-mcp-clipboard-only.md + 2026-06-08-p2-raw-cdp.md. PENDING: P3 (plugin packaging: command + skills + bundled JS bridge; examples/vite-react/.claude harness so 'claude' + command runs the loop) — needs its own plan, gated on confirming how a project .claude/ installs a LOCAL plugin. NOTE: .claude/skills/frontman-flow SKILL.md still references the deleted MCP tools -> rework/remove in P3.
<!-- SECTION:NOTES:END -->
