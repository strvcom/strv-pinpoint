---
id: TASK-9
title: >-
  Annotate session lifecycle: Send -> prompt delivery + startup +
  clear-on-consume
status: To Do
assignee: []
created_date: '2026-06-07 19:39'
labels:
  - feature
dependencies: []
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make annotating feel native. (1) A command/flow that starts app+bridge+browser if not running, or reuses an existing session. (2) On browser SEND, deliver the batch into the active Claude Code prompt like a pasted attachment ([N annotations]) so the user adds context and submits. FEASIBILITY UNKNOWN: can an external process inject into Claude Code's composer? SPIKE FIRST (ask claude-code-guide). Fallbacks: copy-to-clipboard on Send (user pastes), or a pull command. (3) Clear the browser annotations the moment Claude STARTS consuming the batch (prompt submitted/read), ready for the next round. Spike the delivery mechanism before designing.
<!-- SECTION:DESCRIPTION:END -->
