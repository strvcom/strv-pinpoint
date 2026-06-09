# Annotate Lifecycle (TASK-9) — Design

> Status: approved direction (user pivot 2026-06-07, refined); spec → writing-plans.
> Builds on the bridge (`packages/core`) + overlay (`overlay-script.ts`). TASK-8 (overlay v3 UX) runs
> in a parallel session and owns the overlay's look; TASK-9 adds the overlay↔bridge **link** as a
> separate composable module to minimize collision.

## Goal

Pick/annotate in the browser → click **Send** → the batch lands on the **system clipboard as one JSON
blob** (text-only) referencing screenshot files on disk. Paste (`⌘⇧V`) into any Claude Code session; a
**skill** recognizes it, `Read`s the screenshots, applies each comment, and **`curl`s an ack** to the
bridge, which **pushes a status event over SSE** to that browser session → it clears. Fully
**decoupled** (no MCP/Claude-specific integration) and **session-keyed** (two windows independent).

## Settled decisions

- **Clipboard = a single JSON object, text-only.** Easy to parse/adopt anywhere. Screenshots are saved
  to disk; the JSON carries their absolute paths; the **skill `Read`s them** (no reliance on Claude's
  `@`-mention auto-load).
- **Ack over plain HTTP, not MCP.** The skill has Claude `curl` the bridge — keeps the bridge a dumb,
  universal annotator with zero Claude coupling. (`get_selection`/`screenshot`/`get_annotations` MCP
  tools stay as-is; this flow doesn't use them.)
- **Clipboard writes via `clipboardy`** (stable cross-platform: macOS/Linux/Windows) — not hand-rolled `pbcopy`.
- **`promptId` + status in the protocol now; simple behavior in v1.** Every copied batch gets a
  `promptId`; ack carries a `status` (`running` first, `done` later). v1 just clears the browser's
  current draft when it sees the prompt go `running`. The IDs/status leave room for the future
  (mark running→done, a frontend store of executed prompts, and annotating *while* a prompt runs)
  without protocol changes.

## Clipboard JSON (`annotations/clipboard-payload.ts`, pure builder)
```jsonc
{
  "source": "pinpoint",          // marker the skill matches on
  "version": 1,
  "bridgeUrl": "http://localhost:7331",
  "sessionId": "<id>",
  "promptId": "<id>",                  // identifies exactly these items
  "items": [
    {
      "badge": 1,
      "componentName": "Hero",          // or null (e.g. screenshot region)
      "ancestry": ["Hero", "App"],
      "selector": "#hero-heading",
      "tagName": "H1",
      "text": "Vite + React hero",
      "comment": "make it bigger",
      "screenshot": "/abs/.../anno-1.png" // or null
    }
  ]
}
```

## Components

### Bridge (extends the existing `:7331` HTTP server in `server/sse-server.ts`; CORS for the app origin)
- **Session/prompt registry** (`server/sessions.ts`): `Map<sessionId, { sse: ServerResponse|null }>` +
  helpers `register`, `pushEvent(sessionId, event)`. (A `promptId → status` map can be added later; v1
  just relays.)
- **`GET /session/:id/events`** — SSE; registers the session's response; `res.on("close")` deregisters.
- **`POST /session/:id/send`** — body `{ items: Annotation[] }`. Generate a `promptId`; for each item
  capture a PNG via the CDP page (`screenshotElement(selector)` → fallback `screenshotClip(rect)`),
  write to `<tmp>/pinpoint/<sessionId>/<promptId>/anno-<badge>.png`; build the clipboard JSON;
  `clipboardy.write(json)`. Respond `{ ok, promptId, imageCount }`.
- **`POST /session/:id/ack`** — body `{ promptId, status }`. Push SSE `{type:"status", promptId, status}`
  to that session. (v1 only ever receives `status:"running"`.) Unknown session → 404.

### Claude skill (`.claude/skills/pinpoint-paste/SKILL.md`)
Triggers when a message contains a JSON blob with `"source": "pinpoint"`. Steps: parse it; read
`bridgeUrl`, `sessionId`, `promptId`; **immediately ack** `running` via
`curl -fsS -X POST <bridgeUrl>/session/<sessionId>/ack -H 'content-type: application/json' -d '{"promptId":"<id>","status":"running"}'`
(clears the browser the moment work starts); for each item, `Read` its `screenshot` path (if any) and
apply its `comment` (grep `componentName`; fall back to `text`/`selector`); summarize. (Future: a final
`done` ack.)

### Overlay link (`cdp/bridge-link.ts` — new, composable like `EXTRACT_SELECTION_FN`)
Exports `BRIDGE_LINK_FN` defining `window.__pinpointLink`:
- `init(onStatus)` — reads `window.__pinpointConfig = { bridgeUrl, sessionId }`; opens
  `EventSource(bridgeUrl + "/session/" + sessionId + "/events")`; on `{type:"status", promptId, status}`
  calls `onStatus(promptId, status)`.
- `send(items)` — `POST` to `/session/:id/send`; returns the `promptId`.
`overlay-script.ts` touch-points (kept minimal to limit TASK-8 collision): compose `BRIDGE_LINK_FN`;
`init` with an `onStatus` that, in v1, clears the current items when its sent `promptId` goes `running`;
**Send** → `__pinpointLink.send(serialize().items)`. The bridge injects
`window.__pinpointConfig` as a preamble before `OVERLAY_SOURCE` (sessionId per injected page).

## Data flow
1. Bridge injects `{bridgeUrl, sessionId}` + overlay; overlay opens the SSE channel.
2. Annotate → **Send** → overlay POSTs items → bridge saves PNGs, builds JSON, writes clipboard, returns `promptId`.
3. `⌘⇧V` into Claude → `pinpoint-paste` skill parses JSON → `curl` ack `running` → `Read`s screenshots → applies comments.
4. Bridge relays `{status:"running", promptId}` over SSE → overlay clears that prompt's draft, ready for the next.

## Coordination with TASK-8
Overlay edits limited to: compose `BRIDGE_LINK_FN`, `init(onStatus)`, and Send → `link.send(...)`. All
link logic lives in `cdp/bridge-link.ts`. Expect a reconcile merge with TASK-8's UI rewrite; the link
module is callable from whatever toolbar/FAB TASK-8 builds.

## Error handling
- Unknown `sessionId` on `/send` or `/ack` → 404 (logged). Screenshot capture fails for an item → omit
  its path (`screenshot: null`), keep the text. `clipboardy.write` fails → `/send` returns
  `{ ok:false, error }`; overlay surfaces "couldn't copy". SSE drop → EventSource auto-reconnects;
  bridge re-registers.

## Testing
- **Unit (Vitest + fakes):** session registry (register/push); clipboard-JSON builder (shape, `screenshot`
  null vs path, marker); `/send` orchestration (fake CDP page + fake `clipboardy` → PNGs "saved" +
  correct JSON written + `promptId` returned); `/ack` → asserts SSE push of `{type:"status",…}` to the
  right session; CORS/preflight on the new routes; `bridge-link.ts` source parses (`new Function`).
- **Bridge integration (Node, no browser):** start the server; `POST /send` (2-item batch, real/fake
  page) → assert clipboard JSON has marker + 2 items + a valid screenshot path + PNG files exist; open
  an `EventSource` client; `POST /ack` → assert the client receives `{type:"status",status:"running"}`.
- Full browser loop verified after the TASK-8 overlay reconcile.

## Out of scope (future, but designed-for)
Mark `running→done`, a frontend store of executed prompts, annotating while a prompt runs (the `promptId`
+ status protocol enables these); overlay v3 UI (TASK-8); multi-tab connector; auth on loopback routes.
