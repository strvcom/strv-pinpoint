---
id: TASK-33
title: >-
  Driver packages + capture contract: split @pinpoint/driver-*, client-side
  getDisplayMedia capture, bookmarklet driver
status: In Progress
assignee: []
created_date: '2026-06-12 13:30'
updated_date: '2026-06-12 13:32'
labels:
  - architecture
dependencies: []
references:
  - docs/superpowers/specs/2026-06-12-driver-packages-capture-contract.md
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split the browser-acquisition drivers out of @pinpoint/core into their own packages so we can add more browsers, and generalize the contract so capture is no longer CDP-bound. Three threads: (1) PACKAGING — extract the concrete CDP driver (src/cdp/*, driver/cdp-driver, launch-chrome) into @pinpoint/driver-cdp, leaving core with the engine + Driver/Capture interfaces + a driver registry (buildDriver currently hardcodes createCdpDriver — make it config-selected). Packaging != bundling: esbuild bundles whatever the registry statically imports, so decide per-driver whether each is bundled into bin/pinpoint or dynamic-import/external (default: static bundle-all while drivers are light pure-JS). (2) CAPTURE CONTRACT — split today's fat Driver/BridgePage (which owns screenshotViewport/Clip/Element, captured server-side via CDP pull) into two orthogonal interfaces: Driver = injection + identity channel; Capture = pixels. Make client-side getDisplayMedia (one permission prompt/session, grab frame -> canvas crop by devicePixelRatio -> PNG -> push to bridge) the DEFAULT portable capture path for all drivers; KEEP CDP server-side capture as an optional silent/headless fast-path (the integration tests need unattended capture). Open risks to settle in the plan: rect->captured-frame coordinate mapping (tab vs window vs screen share; preferCurrentTab/displaySurface hints can't be forced), and getDisplayMedia secure-context requirement (localhost ok; plain-http LAN IP not). (3) BOOKMARKLET DRIVER — a user-initiated-injection driver: bookmarklet injects the overlay bundle + a config pointing at a discovered local bridge (probe default port), closing the identity->comment->Send->clipboard loop in ANY browser with zero install (page->bridge HTTP+SSE channel + CORS:* already exist). It inverts the control model (client-initiated session + client-push capture) — designing it now keeps the Capture/Driver split honest before more CDP-flavored drivers land. Coupled with in-progress TASK-32 (commits the bundled bin/pinpoint): low textual overlap (different package.json fields) but our restructure changes the bundled artifact, so whichever merges second must rebuild bin. NEXT: run superpowers:brainstorming -> write the referenced spec -> writing-plans before any code.
<!-- SECTION:DESCRIPTION:END -->
