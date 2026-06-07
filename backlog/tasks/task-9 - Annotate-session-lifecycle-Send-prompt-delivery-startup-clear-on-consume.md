---
id: TASK-9
title: >-
  Annotate session lifecycle: Send -> prompt delivery + startup +
  clear-on-consume
status: To Do
assignee: []
created_date: '2026-06-07 19:39'
updated_date: '2026-06-07 19:46'
labels:
  - feature
dependencies: []
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Clipboard-based annotate delivery (decoupled from Claude; feasibility confirmed via claude-code-guide). On browser SEND: (1) write each screenshot PNG to a temp dir (e.g. /tmp/frontman-flow/<batchId>/anno-N.png); (2) copy to the system clipboard a MARKDOWN TEXT block = annotations (componentName, ancestry, selector, text, comment) + '@/abs/path/anno-N.png' mentions for screenshot items. User pastes ONCE with Cmd+Shift+V into any Claude Code session -> text + @-loaded images arrive in one message. Do NOT use raw-image clipboard (single-image, image-or-text only, broken on Win/WSL). Bridge copies via pbcopy / a clipboard lib. (3) Clear the browser annotations on Send (browser hands off; in the decoupled model the bridge can't observe 'Claude acting') OR expose a tiny explicit clear/ack — spec decides; lean clear-on-Send. (4) Small command/flow to start app+bridge+browser or reuse an existing session. No Claude-specific injection needed.
<!-- SECTION:DESCRIPTION:END -->
