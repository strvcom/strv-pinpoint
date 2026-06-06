# Phase 1 — Loop verification & how to run

## What was verified automatically (no human in the loop)

Against the Next 16 example app on `:3100` and a headless Chrome on CDP `:9222`:

- **Integration test** (`packages/core/integration/loop.integration.test.ts`) — 3/3 green:
  - `connect()` attaches over CDP and injects the overlay (extractor defined in-page).
  - `get_selection` returns the picked element's identity: `componentName: "ClientTest"`, `tagName: "H1"`, a CSS `selector`.
  - `screenshot({target:"region"})` and `screenshot({target:"selection"})` each return real PNG bytes.
- **Bridge SSE smoke** — `node packages/core/dist/cli.js` connected to the live Chrome and served the
  MCP SSE handshake at `http://localhost:7331/sse`:
  ```
  HTTP/1.1 200 OK
  Content-Type: text/event-stream
  event: endpoint
  data: /messages?sessionId=…
  ```
- **Unit suite** — 27/27 green (`pnpm test`).

Together these prove the whole chain except the human gesture + a second Claude session editing.

## How to run the full manual loop (the remaining human demo)

1. **Dev server** (Elixir/frontman server NOT needed):
   ```bash
   export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
   pnpm --dir examples/nextjs exec next dev -p 3100
   ```
   (Port 3100 because 3000 is taken by Docker on this machine.)

2. **A HEADED Chrome with the debug port** (so you can actually click):
   ```bash
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     --remote-debugging-port=9222 --user-data-dir=/tmp/ff-chrome-cdp \
     http://localhost:3100/clienttest
   ```
   `/clienttest` is a client component (reliable identity). Server-component pages still work but
   `componentName` may be null (fall back to text/selector + screenshot).

3. **The bridge:**
   ```bash
   pnpm --filter @frontman-flow/core build
   FF_APP_URL=http://localhost:3100/clienttest FF_CDP_URL=http://localhost:9222 \
     node packages/core/dist/cli.js
   ```

4. **A Claude Code session** in this repo (it picks up `.mcp.json` → SSE server at `:7331`). Grant the
   tools `mcp__frontman-flow__get_selection` and `mcp__frontman-flow__screenshot`.

5. In the Chrome window, click **Pick** (bottom-right overlay toolbar), click an element, then tell
   Claude e.g. *"change the selected element's text"*. Claude calls `get_selection`, greps the repo for
   the component name (`ClientTest` → `app/clienttest/page.tsx`), edits it, and Next HMR reloads.
   Try **Region** + ask Claude to `screenshot` the drag-selected area.

## Known limitation
Identity is best-effort: client components resolve via the React fiber chain; server components via
`_debugStack` parsing (may be null). When `componentName` is null, Claude falls back to visible text +
CSS selector + screenshot. Precise source-mapping on Next 16 (Turbopack/RSC) is out of scope (Phase 0
verdict).
