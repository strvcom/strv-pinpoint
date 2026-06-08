---
id: TASK-10
title: 'Self-contained plugin: clipboard-only + raw-CDP bridge + one-command loop'
status: In Progress
assignee: []
created_date: '2026-06-08 00:01'
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
