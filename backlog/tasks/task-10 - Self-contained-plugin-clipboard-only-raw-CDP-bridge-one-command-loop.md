---
id: TASK-10
title: 'Self-contained plugin: clipboard-only + raw-CDP bridge + one-command loop'
status: In Progress
assignee: []
created_date: '2026-06-08 00:01'
updated_date: '2026-06-08 00:21'
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
P1 (strip MCP -> clipboard-only) COMPLETE on branch task-10--plugin-clipboard-cdp, all gates green (typecheck/lint/test/build). 7 commits: overlay-only bridge-server (no MCP), deleted MCP tools+readers, dropped @modelcontextprotocol/sdk + zod, removed examples/nextjs, mcpPort->port + Vite default, rewrote Vite clipboard-loop integration tests, docs+decisions+removed .mcp.json. Plan: docs/superpowers/plans/2026-06-08-p1-strip-mcp-clipboard-only.md. PENDING: P2 (raw CDP, drop Playwright) + P3 (plugin packaging + vite-react/.claude harness) need their own plans; P3 gated on confirming local-plugin install mechanics. NOTE: .claude/skills/frontman-flow SKILL.md still references the deleted MCP tools -> rework/remove in P3 (skill consolidation). Branch not yet merged.
<!-- SECTION:NOTES:END -->
