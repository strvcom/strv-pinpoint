# Design — Self-contained plugin: clipboard-only, raw-CDP bridge, one-command bring-up

**Date:** 2026-06-08
**Status:** Approved (brainstorm) → pending implementation plan
**Supersedes (in part):** the MCP-server delivery path from `2026-06-06-pinpoint-design.md`

## Problem

The runtime today carries three transports for what is essentially one job (let a developer
point Claude at an element/region): an **MCP server** (SSE, for Claude to *pull* selections),
an **overlay HTTP server** (for the overlay to *push* annotations + receive clear signals), and
**Playwright/CDP** (to inject the overlay and capture screenshots). Two observations collapse most
of it:

1. **The clipboard payload already carries everything.** `clipboard-payload.ts` serializes the
   full per-item identity (`componentName`, `ancestry`, `selector`, `tagName`, `text`, `comment`)
   plus the screenshot's on-disk path. So the MCP read-back tools (`get_annotations`, and largely
   `get_selection`/`screenshot`) return nothing the pasted JSON + saved PNGs don't already provide.
   → The **MCP server is redundant** with the clipboard/paste flow (Option A).

2. **Playwright is the only thing that doesn't ship in a Claude plugin.** It downloads a ~150 MB
   Chromium on install. But the bridge uses CDP for exactly two calls — inject and screenshot —
   both expressible as raw CDP messages. Node 22 provides global `WebSocket` and `fetch`, so the
   CDP transport needs **no native or heavy runtime dependencies** (the MCP SDK and Playwright both
   go away). A small pure-JS validation dep (`zod`, used for the overlay payload) may remain or be
   hand-rolled — decided in planning; either way it bundles trivially.

Together these let the whole tool ship as a **single self-contained Claude Code plugin** (command
+ skills + one bundled JS bridge), launched with one command, with no MCP wiring and no install
ceremony.

## Goals

- **Option A:** delete the MCP server; the clipboard/paste flow is the sole delivery path.
- **Raw CDP:** replace Playwright with built-in `WebSocket`/`fetch`-based CDP; the bridge launches
  Chrome itself.
- **Plugin packaging:** ship a slash command + the orchestration skill + the paste skill + one
  bundled JS bridge, with no native/heavy runtime deps (no MCP SDK, no Playwright).
- **One-command loop:** invoking the command brings up the dev server (as needed), Chrome, the
  overlay, and the bridge; Send → paste → edits → overlay clears.
- **Vite example is the proof.** `examples/vite-react` carries a minimal `.claude/` config that
  installs the local plugin; running `claude` inside it and invoking the command runs the whole
  loop end to end.

## Non-goals

- **Rename.** "pinpoint" no longer reflects the architecture, but renaming (packages, globals,
  `.pinpoint/` dir, skills, repo, docs) is a separate task, done *after* this (fewer surfaces
  once MCP names are gone).
- **Re-adding source-map resolution** or any frontman middleware (dropped in Phase 0; unchanged).
- **Multi-framework breadth.** Next.js was removed; Vite + React is the single supported target for
  this work. Astro/others remain future streams.

## Architecture

A single **Claude Code plugin** bundling:

- a **slash command** — the one-phrase trigger;
- the **orchestration skill** — drives bring-up (dev server if needed → run the bundled bridge);
- the **paste skill** (today's `pinpoint-paste`) — consumes the pasted JSON, applies edits, acks;
- one **bundled JS bridge** — transport on Node built-ins (`http`, `child_process`, `fs`, `crypto`,
  global `WebSocket`, global `fetch`); no `@modelcontextprotocol/sdk`, no `playwright` (a small
  pure-JS validator may remain — see Problem #2).

The bridge speaks **raw CDP** using exactly two protocol calls:
`Page.addScriptToEvaluateOnNewDocument` (inject the overlay on every navigation, mirroring today's
`addInitScript`) and `Page.captureScreenshot` (region/viewport clip). It also runs a tiny HTTP
server for the overlay's own channel (`/session/*/events|send|ack`).

## Components

**Kept, essentially unchanged (all already run in-page):**
`cdp/overlay-script.ts`, `cdp/bridge-link.ts` (EventSource + fetch), `cdp/selection-probe.ts`
(React fiber identity), `annotations/clipboard-payload.ts`, `clipboard/write.ts`,
`server/sessions.ts`.

**Deleted (Option A):**
`server/register-tools.ts`; the `/sse` and `/messages` MCP routes; `tools/get-selection.ts`,
`tools/get-annotations.ts`, `tools/screenshot-tool.ts`; `selection/read-selection.ts`;
`annotations/read-annotations.ts`; the `@modelcontextprotocol/sdk` dependency.

**Rewritten:**
- `cdp/connector.ts` + `cdp/playwright-page.ts` → a small **raw-CDP client** (`cdp/cdp-client.ts`)
  that: locates/launches Chrome (spawn the binary with `--remote-debugging-port` + a temp
  `--user-data-dir` + the app URL), reads `http://<host>:<port>/json` for the page target's
  `webSocketDebuggerUrl`, connects, enables the `Page` domain, injects the overlay, and exposes
  `captureScreenshot(clip) → Buffer`. A ~50-line request/response correlator over the WebSocket.
- `server/sse-server.ts` → `server/bridge-server.ts`, keeping only the overlay routes
  (`/session/*/events|send|ack`). CORS + localhost bind unchanged.
- `annotations/save-screenshots.ts` → use the raw-CDP `captureScreenshot` instead of Playwright's
  `page.screenshot`. (Clip remains viewport-relative — see `decisions.md` 2026-06-06 Screenshots.)
- `config.ts` → drop `mcpPort` semantics in favor of a single bridge `port`; default `appUrl` to the
  **Vite** dev URL (Next's `:3000` default is removed). Add Chrome launch knobs
  (`PIN_CHROME_PATH`, `PIN_CHROME_PORT`, profile dir).

**New:**
- `cdp/launch-chrome.ts` — locate the Chrome binary per platform, spawn with debug flags + temp
  profile, wait until `/json/version` answers, return the CDP base URL.
- The **plugin scaffold**: command definition, skill files, plugin manifest, and a build/bundle step
  (likely `esbuild` at build time only — not a runtime dep) producing the shippable bridge `.mjs`.
- `examples/vite-react/.claude/` — minimal config that installs the local plugin (mechanism
  confirmed in planning; see Open Items).

## Data flow

1. In `examples/vite-react`, run `claude` → invoke the plugin command.
2. Orchestration skill: start the Vite dev server if not already up (backgrounded); run the bundled
   bridge (backgrounded).
3. Bridge: launch Chrome (debug port, temp profile, app URL) → CDP connect → inject overlay → serve
   `:<port>` overlay routes.
4. Overlay loads on `DOMContentLoaded`, connects `EventSource` to `/session/<id>/events`.
5. Developer clicks elements, adds comments, hits **Send** → overlay POSTs items to
   `/session/<id>/send`.
6. Bridge: for each flagged item, `Page.captureScreenshot(clip)` → write
   `.pinpoint/<session>/<promptId>/<badge>.png` → build clipboard JSON (identity + comment +
   cwd-relative path) → write to system clipboard.
7. Developer pastes into Claude → the **paste skill** parses the JSON, `Read`s the PNGs, greps by
   `componentName`/`text` to locate source, applies each comment's edit, then POSTs
   `/session/<id>/ack` → overlay clears.

## Error handling

- **Chrome not found / fails to launch** → actionable message listing per-platform Chrome paths and
  the `PIN_CHROME_PATH` override.
- **CDP connect** → bounded retry/backoff against `/json`; clear failure after timeout.
- **App URL unreachable** → warn (dev server not up yet).
- **Screenshot capture failure** → record `null` path for that badge, continue (today's behavior).
- **Clipboard write failure** → surfaced to the developer.
- **Port already in use** → configurable; fail with the conflicting port named.

## Testing

- **Unit:** raw-CDP client over a mocked `WebSocket` (request/response correlation, inject,
  screenshot); `clipboard-payload` (exists); rewired `save-screenshots`; overlay-route handlers;
  `launch-chrome` path resolution (mock `fs`/spawn).
- **Integration (`packages/core/integration/`):** adapt `loop.integration.test.ts`,
  `bridge-routes.integration.test.ts`, `annotations.integration.test.ts`, and
  `vite.integration.test.ts` to the raw-CDP + Chrome-launch path. **Vite is now the sole live
  target** (Next references removed). The loop test asserts: overlay injected, Send produces the
  expected clipboard JSON, and the PNG files exist on disk.
- **End-to-end (manual, the acceptance scenario):** `cd examples/vite-react && claude`, invoke the
  command, click + comment + Send, paste, confirm an edit lands and the overlay clears.

## Acceptance criteria

1. No MCP server, no `@modelcontextprotocol/sdk`, no `playwright` in the bridge's runtime deps.
2. The bridge talks CDP via Node built-ins and launches Chrome itself.
3. The tool is installable as a Claude Code plugin (command + skills + bundled JS).
4. `examples/vite-react` holds a minimal `.claude/` config installing the local plugin; running
   `claude` there and invoking the command runs the full loop (click → Send → paste → edit →
   clear).
5. `pnpm typecheck && pnpm lint && pnpm test` pass; the Vite integration loop test passes.
6. Lingering Next.js references removed (config default, integration test, docs touched by this work).

## Phasing (input to the implementation plan)

Three independently shippable, separately committed phases:

- **P1 — Option A:** strip the MCP server and read-back tools; clipboard/paste becomes the only
  path. Still on Playwright. Verifiable on its own (overlay → Send → clipboard → paste → edit).
- **P2 — Raw CDP:** replace Playwright with the built-in CDP client; bridge launches Chrome. Verified
  via the Vite integration loop test.
- **P3 — Plugin packaging + Vite harness:** command + skills + bundled bridge; one-command bring-up;
  `examples/vite-react/.claude/` installs the local plugin; the end-to-end acceptance scenario runs.

Rename is a separate task after P3.

## Open items (resolve during planning)

- **Plugin manifest specifics:** how a command/skill invokes the bundled JS via the plugin root
  path, and the exact way a project's `.claude/` config installs a **local** plugin (marketplace
  entry vs. local dev install). Confirm against current Claude Code plugin docs.
- **Dev-server ownership:** the orchestration skill starts the Vite dev server (it knows the repo),
  while the bridge owns Chrome + inject + serve. Confirm this split holds for an end user's own app
  (they may prefer to start their dev server themselves).
- **Chrome profile:** temp `--user-data-dir` (sterile, no logins) vs. an opt-in real profile. Default
  to temp; document the trade-off.
