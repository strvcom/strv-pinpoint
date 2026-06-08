---
id: TASK-10
title: 'Self-contained plugin: clipboard-only + raw-CDP bridge + one-command loop'
status: In Progress
assignee: []
created_date: '2026-06-08 00:01'
updated_date: '2026-06-08 14:02'
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
P1 (clipboard-only) + P2 (raw CDP, no Playwright) + P3 (plugin packaging) all IMPLEMENTED and merged to main; gates green throughout. @frontman-flow/core is genuinely zero-dep (clipboardy replaced with pbcopy/clip/xclip shell-out). Plugin at plugin/: /frontman-flow:start command + frontman-flow-paste skill + esbuild-bundled bin/frontman-flow. Local marketplace (.claude-plugin/marketplace.json, DIRECTORY source — a 'local' source type does NOT exist) + examples/vite-react/.claude harness + repo dogfood. Dev loop: claude --plugin-dir ./plugin. VERIFIED LIVE: bundled bin injects overlay (window.__frontmanFlowConfig set) + serves bridge against real headless Chrome. Plans: docs/superpowers/plans/2026-06-08-p1/p2/p3-*.md. PENDING (user-only, cannot run headlessly here): interactive acceptance — cd examples/vite-react && claude -> /frontman-flow:start -> Pick/comment/Send/paste. Flip to Done after that smoke. Rename remains TASK-11.
<!-- SECTION:NOTES:END -->
