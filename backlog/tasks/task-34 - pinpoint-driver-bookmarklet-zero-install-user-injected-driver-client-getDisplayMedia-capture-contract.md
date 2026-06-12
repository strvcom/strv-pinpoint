---
id: TASK-34
title: >-
  @pinpoint/driver-bookmarklet: zero-install user-injected driver + client
  getDisplayMedia capture contract
status: To Do
assignee: []
created_date: '2026-06-12 13:39'
labels:
  - architecture
dependencies: []
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A user-initiated-injection driver that works in ANY browser with zero install — depends on @pinpoint/core (Driver/Capture interfaces) + @pinpoint/overlay (the bundled UI). The bookmarklet is a tiny loader (javascript: URL is length-limited, so it injects a <script src> pointing at the bridge rather than embedding the whole overlay) that loads the overlay bundle + a config pointing at a discovered local bridge (probe a default port / known handshake), closing identity→comment→Send→clipboard over the existing HTTP+SSE channel (bridge CORS:* already set). Has its own build step to produce the loader and serve the overlay bundle from the bridge. This task brings the CAPTURE-CONTRACT generalization deferred from TASK-33: since no browser is opened by us there is no CDP, so capture must be CLIENT-SIDE getDisplayMedia (one permission prompt/session → grab frame → canvas crop by devicePixelRatio → PNG → push to bridge). This is where we split BridgePage's server-side screenshot* methods into a per-driver Capture capability: CDP driver = server-side silent/headless (only when we open a browser), bookmarklet = client getDisplayMedia. OPEN RISKS: rect→captured-frame coordinate mapping (tab vs window vs screen share; preferCurrentTab/displaySurface hints can't be forced), getDisplayMedia secure-context requirement (localhost ok; plain-http LAN IP not), and bookmarklet install UX (how to help the user save it — deferred detail). DEPENDS ON TASK-33 (driver packaging + composition root) landing first; this card may need updating after TASK-33's spec settles. Brainstorm + write a spec/plan before implementing.
<!-- SECTION:DESCRIPTION:END -->
