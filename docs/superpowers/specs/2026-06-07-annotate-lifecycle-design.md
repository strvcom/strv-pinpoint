# Annotate Lifecycle (TASK-9) — Design

> Status: approved direction (user pivot 2026-06-07); spec for review → writing-plans.
> Builds on the bridge (`packages/core`) + overlay (`overlay-script.ts`). TASK-8 (overlay v3 UX)
> runs in a parallel session and owns the overlay's look; TASK-9 adds the overlay↔bridge **link**
> as a separate composable module to minimize collision.

## Goal

Make annotating feel native and decoupled: the user picks/annotates in the browser, clicks **Send**,
and the batch lands on the **system clipboard** as text + `@image-path` mentions. The user pastes
(`⌘⇧V`) into any Claude Code session; a **skill** recognizes it, applies each comment, and **acks**
the bridge, which **pushes a clear** over SSE to that exact browser session. Everything is
**session-keyed** (two windows work independently). No Claude-specific input injection.

## Why clipboard + ack (settled)

`claude-code-guide` confirmed: raw-image clipboard is single-image / image-or-text / broken on
Win-WSL. The reliable path is **text on the clipboard containing `@/abs/path.png` mentions** (Claude
auto-loads them) — one `⌘⇧V` delivers text + N images. The bridge can't observe "Claude acting", so
clear-on-consume is achieved by Claude **explicitly acking** (a `clear_annotations` MCP tool), which
the bridge turns into an SSE "clear" to the session. This keeps the bridge a dumb, universal annotator.

## Components

### Bridge (extends the existing `:7331` HTTP/MCP server in `server/sse-server.ts`)
- **Session registry** (`server/sessions.ts`): `Map<sessionId, { sse: ServerResponse | null }>`. Helpers
  `register`, `pushEvent(sessionId, event)`, `clear(sessionId, batchId)`. In-memory.
- **Routes** (CORS-enabled for the app origin; preflight handled):
  - `GET /session/:id/events` — SSE; registers the session's response; keeps it open; `res.on("close")` deregisters.
  - `POST /session/:id/send` — body = `{ batchId, items: Annotation[] }`. For each item, capture a PNG via
    the CDP page (`screenshotElement(selector)` → fallback `screenshotClip(rect)`), write to
    `<tmp>/frontman-flow/<sessionId>/<batchId>/anno-<badge>.png`; build the clipboard markdown
    (below); write it to the system clipboard. Respond `{ ok: true, imageCount }`.
- **MCP tool `clear_annotations`** (added in `server/register-tools.ts`): args `{ sessionId, batchId }`
  → `sessions.clear(sessionId, batchId)` → pushes SSE `{type:"clear", batchId}` to that session. Returns text confirmation.

### Clipboard payload (`annotations/clipboard-payload.ts`)
Pure builder: `(sessionId, batchId, items, pathFor) → string`:
```
<!-- frontman-flow session=<sessionId> batch=<batchId> -->
# frontman-flow annotations (N)

## 1. <componentName ?? "screenshot region"> — `<selector>`
- ancestry: A > B          (omit if empty)
- text: "<visible text>"   (omit if empty)
- comment: <user comment>
- screenshot: @<abs/path>  (only for items with a saved image)
...
```
The leading marker is how the **skill** detects a frontman-flow paste and learns `sessionId`/`batchId`.

### Clipboard writer (`clipboard/write.ts`)
`writeClipboard(text): Promise<void>` — abstraction; default impl pipes to `pbcopy` (macOS) via
`child_process` (note: Linux `xclip`/`wl-copy` is a later add). Injectable so tests use a fake.

### Claude skill (`.claude/skills/frontman-flow-paste/SKILL.md`)
Triggers when a message contains `<!-- frontman-flow session=… batch=… -->`. Steps: parse the marker
(sessionId, batchId); **immediately ack** by calling `mcp__frontman-flow__clear_annotations` (clear the
moment Claude starts acting — the browser resets); then for each annotation apply its `comment`
(grep `componentName`; use the `@`-loaded screenshot for regions; fall back to text/selector); summarize.

### Overlay link (`cdp/bridge-link.ts` — new, composable like `EXTRACT_SELECTION_FN`)
Exports `BRIDGE_LINK_FN` (a JS source string) defining `window.__frontmanFlowLink` with:
- `init()` — reads `window.__frontmanFlowConfig = { bridgeUrl, sessionId }`, opens
  `new EventSource(bridgeUrl + "/session/" + sessionId + "/events")`; on `{type:"clear"}` calls a
  registered `onClear()` callback.
- `send(batch)` — `fetch(bridgeUrl + "/session/" + sessionId + "/send", { method:"POST", body: JSON })`.
`overlay-script.ts` changes are minimal & isolated (compose `BRIDGE_LINK_FN`, call `init()` with an
`onClear` that resets state, and have the **Send** button call `__frontmanFlowLink.send(serialize())`
instead of only flipping `ready`). The bridge injects `window.__frontmanFlowConfig` as a preamble
before `OVERLAY_SOURCE` (sessionId generated per injected page).

## Data flow
1. Bridge injects config (`{bridgeUrl, sessionId}`) + overlay; overlay opens the SSE channel.
2. User annotates → clicks **Send** → overlay POSTs the batch to `/session/:id/send`.
3. Bridge saves PNGs, builds clipboard text (marker + `@paths`), writes the clipboard.
4. User `⌘⇧V` into a Claude session → the `frontman-flow-paste` skill fires → calls `clear_annotations(session,batch)` → applies each comment.
5. Bridge pushes SSE `clear` → that browser resets, ready for the next round.

## Coordination with TASK-8
TASK-9 keeps overlay edits to: (a) compose `BRIDGE_LINK_FN`, (b) `init` the link with an `onClear`
reset, (c) Send → `link.send(...)`. All bridge-link logic lives in `cdp/bridge-link.ts`. Expect a
reconcile merge with TASK-8's UI rewrite; the link module is designed to be called from whatever
toolbar/FAB TASK-8 builds.

## Session-keying & multi-window
All routes/events/payloads are keyed by `sessionId`. v1 generates one sessionId per injected page and
wires/tests a single session end-to-end. The bridge attaching to multiple tabs (true multi-window) is
a fast-follow; the API is already session-shaped so it won't need redesign.

## Error handling
- Unknown `sessionId` on `/send` or `clear` → 404 / no-op with a logged warning.
- Screenshot capture fails for an item → omit its image, keep the text (note "screenshot unavailable").
- SSE connection drop → overlay's EventSource auto-reconnects (browser default); bridge re-registers on reconnect.
- Clipboard write failure (no `pbcopy`) → `/send` responds `{ ok:false, error }`; overlay surfaces "couldn't copy".

## Testing
- **Unit (Vitest + fakes):** session registry (register/push/clear); clipboard-payload builder (marker +
  per-item formatting + `@paths` only when image saved); `/send` orchestration (fake CDP page + fake
  clipboard → asserts PNGs "saved" + payload written); `clear_annotations` tool → asserts SSE push to
  the right session; CORS/preflight on the new routes.
- **Bridge integration (Node, no browser):** start the server; `POST /send` with a 2-item batch (fake/real
  page) → assert clipboard text contains the marker + `@paths` + PNG files exist; open an `EventSource`
  client, call `clear_annotations` → assert the client receives `{type:"clear"}`.
- **Overlay link:** the `bridge-link.ts` source parses (`new Function`); live browser loop deferred to
  the TASK-8 reconcile (the link module is small and contract-tested at the bridge boundary).

## Out of scope
Overlay v3 UI (FAB/toolbar/cards — TASK-8); multi-tab connector; Linux/Windows clipboard; auth on the
local routes (loopback-only, like the SSE MCP server).
