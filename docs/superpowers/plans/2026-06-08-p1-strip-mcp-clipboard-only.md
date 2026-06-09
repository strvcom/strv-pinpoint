# P1 — Strip the MCP server (clipboard-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the clipboard/paste flow the sole delivery path by deleting the MCP server, its read-back tools, and the `@modelcontextprotocol/sdk` dependency — leaving the bridge as an overlay HTTP server (`/session/*/events|send|ack`) that captures screenshots and writes the clipboard.

**Architecture:** The overlay already POSTs full annotation payloads to `/send`, where the bridge saves PNGs and writes a `pinpoint` JSON to the clipboard (`clipboard-payload.ts`). That payload carries everything Claude needs, so the MCP pull tools (`get_selection`, `get_annotations`, `screenshot`) and their CDP readers are redundant. This phase removes them. Playwright stays (replaced in P2); plugin packaging is P3.

**Tech Stack:** TypeScript (ESM), Node 22, Vitest, Biome, pnpm workspace. Bridge HTTP via `node:http`; screenshots via the `BridgePage` interface (Playwright adapter in prod, `FakePage` in tests).

**Scope note:** This is phase P1 of the spec `docs/superpowers/specs/2026-06-08-plugin-clipboard-cdp-design.md`. P2 (raw CDP, no Playwright) and P3 (plugin packaging + Vite `.claude/` harness) are separate plans.

---

## File Structure

**Deleted (the MCP read-back layer — only the deleted MCP tools consumed these):**
- `packages/core/src/server/register-tools.ts` + `register-tools.test.ts`
- `packages/core/src/tools/get-selection.ts` + `.test.ts`
- `packages/core/src/tools/get-annotations.ts` + `.test.ts`
- `packages/core/src/tools/screenshot-tool.ts` + `.test.ts`
- `packages/core/src/tools/deps.ts`
- `packages/core/src/selection/read-selection.ts` + `.test.ts`
- `packages/core/src/selection/read-region.ts` + `.test.ts`
- `packages/core/src/annotations/read-annotations.ts` + `.test.ts`
- `packages/core/integration/annotations.integration.test.ts` (its `get_annotations` coverage is obsolete; multi-item `/send` is covered by `bridge-routes.integration.test.ts`)

**Renamed / rewritten:**
- `packages/core/src/server/sse-server.ts` → `packages/core/src/server/bridge-server.ts` (drop all MCP; keep overlay routes). `startSseServer` → `startBridgeServer`, `SseServerDeps` → `BridgeServerDeps`.
- `packages/core/integration/loop.integration.test.ts` — rewritten as the live Vite clipboard loop.
- `packages/core/integration/vite.integration.test.ts` — rewritten to assert the in-page extractor directly (no MCP tools).

**Modified:**
- `packages/core/src/cli.ts` — import `startBridgeServer`; update the startup log.
- `packages/core/integration/bridge-routes.integration.test.ts` — update import to `bridge-server`.
- `packages/core/src/config.ts` + `config.test.ts` — rename `mcpPort` → `port`; default `appUrl` to the Vite dev URL (drop the Next `:3000` default).
- `packages/core/package.json` — remove `@modelcontextprotocol/sdk`.
- `CLAUDE.md`, `README.md` — drop references to the MCP tools; state the clipboard/paste flow is the delivery path.
- `docs/decisions.md` — one row recording the Option-A decision.

**Kept unchanged (still needed):** `cdp/overlay-script.ts`, `cdp/bridge-link.ts`, `cdp/selection-probe.ts`, `cdp/connector.ts`, `cdp/playwright-page.ts`, `cdp/page.ts`, `cdp/fake-page.ts`, `annotations/clipboard-payload.ts`, `annotations/save-screenshots.ts`, `clipboard/write.ts`, `server/sessions.ts`, `types.ts`.

---

## Task 1: Replace the MCP+overlay server with an overlay-only bridge server

**Files:**
- Create: `packages/core/src/server/bridge-server.ts`
- Delete: `packages/core/src/server/sse-server.ts`
- Modify: `packages/core/src/cli.ts`
- Modify: `packages/core/integration/bridge-routes.integration.test.ts:9` and `:14` and `:18`

- [ ] **Step 1: Create `bridge-server.ts` (overlay routes only, no MCP)**

```typescript
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { buildClipboardJson } from "../annotations/clipboard-payload.js";
import { saveScreenshots } from "../annotations/save-screenshots.js";
import type { BridgePage } from "../cdp/page.js";
import type { ClipboardWriter } from "../clipboard/write.js";
import type { Annotation } from "../types.js";
import type { SessionRegistry } from "./sessions.js";

export interface BridgeServerDeps {
  page: BridgePage;
  sessions: SessionRegistry;
  writeClipboard: ClipboardWriter;
  bridgeUrl: string;
  /** root tmp dir for screenshots, e.g. join(process.cwd(), ".pinpoint"). */
  tmpRoot: string;
}

function cors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return (chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}) as T;
}

export function startBridgeServer(port: number, deps: BridgeServerDeps): Server {
  const http = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    cors(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    const m = url.pathname.match(/^\/session\/([^/]+)\/(events|send|ack)$/);
    if (m) {
      const sessionId = decodeURIComponent(m[1]);
      const action = m[2];

      if (action === "events" && req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.write(": connected\n\n");
        deps.sessions.register(sessionId, res);
        req.on("close", () => deps.sessions.deregister(sessionId));
        return;
      }

      if (action === "send" && req.method === "POST") {
        const body = await readJson<{ items?: Annotation[] }>(req);
        const items = body.items ?? [];
        const promptId = randomUUID();
        const dir = join(deps.tmpRoot, sessionId, promptId);
        const screenshotPaths = await saveScreenshots(deps.page, items, dir);
        const json = buildClipboardJson({
          bridgeUrl: deps.bridgeUrl,
          sessionId,
          promptId,
          items,
          screenshotPaths,
        });
        let ok = true;
        let error: string | undefined;
        try {
          await deps.writeClipboard(json);
        } catch (e) {
          ok = false;
          error = (e as Error).message;
        }
        const imageCount = Object.values(screenshotPaths).filter(Boolean).length;
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(JSON.stringify({ ok, promptId, imageCount, error }));
        return;
      }

      if (action === "ack" && req.method === "POST") {
        const body = await readJson<{ promptId?: string; status?: string }>(req);
        const delivered = deps.sessions.pushEvent(sessionId, {
          type: "status",
          promptId: body.promptId,
          status: body.status,
        });
        res
          .writeHead(delivered ? 200 : 404, { "Content-Type": "application/json" })
          .end(JSON.stringify({ delivered }));
        return;
      }
    }

    res.writeHead(404).end("not found");
  });

  http.listen(port, "127.0.0.1");
  return http;
}
```

- [ ] **Step 2: Delete the old server file**

Run: `git rm packages/core/src/server/sse-server.ts`

- [ ] **Step 3: Update `cli.ts` to use the new server**

In `packages/core/src/cli.ts`, change the import and the call. Replace:

```typescript
import { startSseServer } from "./server/sse-server.js";
```

with:

```typescript
import { startBridgeServer } from "./server/bridge-server.js";
```

Replace the `startSseServer(cfg.mcpPort, {` call and the following log line:

```typescript
  startSseServer(cfg.mcpPort, {
    page: connection.page,
    sessions: new SessionRegistry(),
    writeClipboard: systemClipboard,
    bridgeUrl,
    tmpRoot: join(process.cwd(), ".pinpoint"),
  });
  console.error(`pinpoint MCP (SSE) on ${bridgeUrl}/sse · session ${connection.sessionId}`);
```

with:

```typescript
  startBridgeServer(cfg.mcpPort, {
    page: connection.page,
    sessions: new SessionRegistry(),
    writeClipboard: systemClipboard,
    bridgeUrl,
    tmpRoot: join(process.cwd(), ".pinpoint"),
  });
  console.error(`pinpoint bridge on ${bridgeUrl} · session ${connection.sessionId}`);
```

(`cfg.mcpPort` is renamed to `cfg.port` in Task 4 — leave it as `cfg.mcpPort` for now so this task stays green.)

- [ ] **Step 4: Update the bridge-routes integration test import**

In `packages/core/integration/bridge-routes.integration.test.ts`, change line 9 from:

```typescript
import { startSseServer } from "../src/server/sse-server.js";
```

to:

```typescript
import { startBridgeServer } from "../src/server/bridge-server.js";
```

Then change line 14 (`let server: ReturnType<typeof startSseServer>;`) to use `startBridgeServer`, and line 18 (`server = startSseServer(0, {`) to `server = startBridgeServer(0, {`.

- [ ] **Step 5: Verify typecheck, unit tests, and build pass**

Run: `pnpm typecheck && pnpm test && pnpm --filter @pinpoint/core build`
Expected: PASS. (`register-tools.ts` and `tools/*` still exist and still compile against the SDK at this point; they're deleted in Tasks 2–3.)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/server/bridge-server.ts packages/core/src/cli.ts packages/core/integration/bridge-routes.integration.test.ts
git rm packages/core/src/server/sse-server.ts
git commit -m "refactor(core): overlay-only bridge server, drop MCP transport (P1)"
```

---

## Task 2: Delete the MCP tools and their CDP readers

**Files:**
- Delete: `packages/core/src/server/register-tools.ts`, `register-tools.test.ts`
- Delete: `packages/core/src/tools/get-selection.ts`, `get-selection.test.ts`, `get-annotations.ts`, `get-annotations.test.ts`, `screenshot-tool.ts`, `screenshot-tool.test.ts`, `deps.ts`
- Delete: `packages/core/src/selection/read-selection.ts`, `read-selection.test.ts`, `read-region.ts`, `read-region.test.ts`
- Delete: `packages/core/src/annotations/read-annotations.ts`, `read-annotations.test.ts`

- [ ] **Step 1: Confirm nothing kept imports these modules**

Run: `grep -rn "tools/\|read-selection\|read-region\|read-annotations\|register-tools" packages/core/src packages/core/integration`
Expected: matches ONLY inside the files being deleted in this task (and the integration tests rewritten in Task 5). No match in `cli.ts`, `bridge-server.ts`, `connector.ts`, `clipboard-payload.ts`, or `save-screenshots.ts`.

- [ ] **Step 2: Delete the files**

```bash
git rm packages/core/src/server/register-tools.ts packages/core/src/server/register-tools.test.ts \
  packages/core/src/tools/get-selection.ts packages/core/src/tools/get-selection.test.ts \
  packages/core/src/tools/get-annotations.ts packages/core/src/tools/get-annotations.test.ts \
  packages/core/src/tools/screenshot-tool.ts packages/core/src/tools/screenshot-tool.test.ts \
  packages/core/src/tools/deps.ts \
  packages/core/src/selection/read-selection.ts packages/core/src/selection/read-selection.test.ts \
  packages/core/src/selection/read-region.ts packages/core/src/selection/read-region.test.ts \
  packages/core/src/annotations/read-annotations.ts packages/core/src/annotations/read-annotations.test.ts
```

- [ ] **Step 3: Verify typecheck, unit tests, and build pass**

Run: `pnpm typecheck && pnpm test && pnpm --filter @pinpoint/core build`
Expected: PASS. `packages/core/tsconfig.json` excludes `integration/**` and `*.test.ts`, and the integration suite is excluded from the default `pnpm test`, so the `loop`/`vite` integration files still referencing deleted tools do NOT break either gate here — Task 5 rewrites them, and they're only exercised when manually running the integration config. The `selection-probe.ts` extractor is kept and unaffected.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(core): remove MCP read-back tools + CDP readers (P1)"
```

---

## Task 3: Remove the `@modelcontextprotocol/sdk` dependency

**Files:**
- Modify: `packages/core/package.json:14-16` (dependencies block)

- [ ] **Step 1: Confirm no source imports the SDK**

Run: `grep -rn "modelcontextprotocol" packages/core/src packages/core/integration`
Expected: no matches.

- [ ] **Step 2: Remove the dependency**

In `packages/core/package.json`, change the `dependencies` block from:

```json
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "playwright": "^1.45.0",
    "zod": "^3.23.0"
  }
```

to:

```json
  "dependencies": {
    "playwright": "^1.45.0",
    "zod": "^3.23.0"
  }
```

- [ ] **Step 3: Update the lockfile**

Run: `pnpm install`
Expected: lockfile updates, `@modelcontextprotocol/sdk` removed from `node_modules`.

- [ ] **Step 4: Verify typecheck, unit tests, and build pass**

Run: `pnpm typecheck && pnpm test && pnpm --filter @pinpoint/core build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/package.json pnpm-lock.yaml
git commit -m "chore(core): drop @modelcontextprotocol/sdk dependency (P1)"
```

---

## Task 4: Rename `mcpPort` → `port` and default the app URL to Vite

**Files:**
- Modify: `packages/core/src/config.ts`
- Modify: `packages/core/src/config.test.ts`
- Modify: `packages/core/src/cli.ts` (the two `cfg.mcpPort` references)

- [ ] **Step 1: Update the config test (red first)**

Replace the body of `packages/core/src/config.test.ts` with:

```typescript
import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.js";

describe("parseConfig", () => {
  it("returns defaults when env is empty", () => {
    const cfg = parseConfig({});
    expect(cfg.port).toBe(7331);
    expect(cfg.cdpUrl).toBe("http://localhost:9222");
    expect(cfg.appUrl).toBe("http://localhost:5173");
  });

  it("overrides port from PIN_PORT", () => {
    expect(parseConfig({ PIN_PORT: "9000" }).port).toBe(9000);
  });

  it("overrides cdpUrl from PIN_CDP_URL", () => {
    expect(parseConfig({ PIN_CDP_URL: "http://localhost:9333" }).cdpUrl).toBe(
      "http://localhost:9333",
    );
  });

  it("overrides appUrl from PIN_APP_URL", () => {
    expect(parseConfig({ PIN_APP_URL: "http://localhost:5180" }).appUrl).toBe(
      "http://localhost:5180",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @pinpoint/core exec vitest run src/config.test.ts`
Expected: FAIL — `cfg.port` is undefined and `appUrl` default is still `:3000`.

- [ ] **Step 3: Update `config.ts`**

Replace the contents of `packages/core/src/config.ts` with:

```typescript
export interface BridgeConfig {
  port: number;
  cdpUrl: string;
  appUrl: string;
}

export function parseConfig(env: Record<string, string | undefined>): BridgeConfig {
  return {
    port: env.PIN_PORT ? Number(env.PIN_PORT) : 7331,
    cdpUrl: env.PIN_CDP_URL ?? "http://localhost:9222",
    appUrl: env.PIN_APP_URL ?? "http://localhost:5173",
  };
}
```

- [ ] **Step 4: Update the two references in `cli.ts`**

In `packages/core/src/cli.ts`, change `const bridgeUrl = \`http://localhost:${cfg.mcpPort}\`;` to use `cfg.port`, and `startBridgeServer(cfg.mcpPort, {` to `startBridgeServer(cfg.port, {`.

- [ ] **Step 5: Verify the test passes + typecheck + build**

Run: `pnpm --filter @pinpoint/core exec vitest run src/config.test.ts && pnpm typecheck && pnpm --filter @pinpoint/core build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/config.ts packages/core/src/config.test.ts packages/core/src/cli.ts
git commit -m "refactor(core): rename mcpPort→port, default appUrl to Vite (P1)"
```

---

## Task 5: Rewrite the live integration tests for the clipboard-only loop

**Files:**
- Rewrite: `packages/core/integration/loop.integration.test.ts`
- Rewrite: `packages/core/integration/vite.integration.test.ts`
- Delete: `packages/core/integration/annotations.integration.test.ts`

These are excluded from `pnpm test` (they need a live browser + the Vite app). They must still typecheck and, when run manually, pass.

- [ ] **Step 1: Delete the obsolete annotations integration test**

Run: `git rm packages/core/integration/annotations.integration.test.ts`

- [ ] **Step 2: Rewrite `vite.integration.test.ts` to assert the in-page extractor directly**

Replace the file contents with:

```typescript
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Connection, connect } from "../src/cdp/connector.js";
import type { SelectionFound } from "../src/types.js";

/**
 * Proves the CDP + fiber-identity bridge works on Vite + React. The extractor
 * runs in-page (window.__pinpointExtractSelection), injected by connect().
 * Requires examples/vite-react running + Chrome on 9222.
 *
 *   pnpm --dir examples/vite-react exec vite --port 5180 --strictPort &
 *   <chrome> --headless=new --remote-debugging-port=9222 about:blank &
 *   pnpm --filter @pinpoint/core exec vitest run --config vitest.integration.config.ts vite
 */
const APP_URL = process.env.PIN_VITE_URL ?? "http://localhost:5180";
const CDP_URL = process.env.PIN_CDP_URL ?? "http://localhost:9222";

let connection: Connection;

beforeAll(async () => {
  connection = await connect({
    cdpUrl: CDP_URL,
    appUrl: APP_URL,
    bridgeUrl: "http://localhost:7331",
  });
});

afterAll(async () => {
  await connection?.close();
});

describe("pinpoint identity extraction on Vite + React (integration)", () => {
  it("extracts the user component identity for the picked element", async () => {
    const sel = await connection.page.evaluate<SelectionFound>(
      "window.__pinpointExtractSelection(document.querySelector('#hero-heading'))",
    );
    expect(sel.componentName).toBe("Hero");
    expect(sel.ancestry).toEqual(["Hero", "App"]);
    expect(sel.tagName).toBe("H1");
    expect(typeof sel.selector).toBe("string");
  });

  it("captures a viewport-relative clip as PNG bytes", async () => {
    const png = await connection.page.screenshotClip({ x: 12, y: 12, width: 140, height: 50 });
    expect(png.length).toBeGreaterThan(100);
  });
});
```

- [ ] **Step 3: Rewrite `loop.integration.test.ts` as the live clipboard loop**

Replace the file contents with:

```typescript
import { existsSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Connection, connect } from "../src/cdp/connector.js";
import { startBridgeServer } from "../src/server/bridge-server.js";
import { SessionRegistry } from "../src/server/sessions.js";
import type { SelectionFound } from "../src/types.js";

/**
 * The full clipboard loop on a live page: inject overlay → build an annotation
 * from the in-page extractor → POST /send → assert the bridge wrote a
 * pinpoint clipboard JSON and saved the flagged screenshot to disk.
 * Requires examples/vite-react on 5180 + Chrome on 9222.
 *
 *   pnpm --dir examples/vite-react exec vite --port 5180 --strictPort &
 *   <chrome> --headless=new --remote-debugging-port=9222 about:blank &
 *   pnpm --filter @pinpoint/core exec vitest run --config vitest.integration.config.ts loop
 */
const APP_URL = process.env.PIN_VITE_URL ?? "http://localhost:5180";
const CDP_URL = process.env.PIN_CDP_URL ?? "http://localhost:9222";
const tmpRoot = join(tmpdir(), `ff-loop-${Math.floor(Math.random() * 1e9)}`);

let connection: Connection;
let server: ReturnType<typeof startBridgeServer>;
let base: string;
const clip: string[] = [];

beforeAll(async () => {
  connection = await connect({
    cdpUrl: CDP_URL,
    appUrl: APP_URL,
    bridgeUrl: "http://localhost:7331",
  });
  server = startBridgeServer(0, {
    page: connection.page,
    sessions: new SessionRegistry(),
    writeClipboard: async (t) => {
      clip.push(t);
    },
    bridgeUrl: "http://localhost:7331",
    tmpRoot,
  });
  await new Promise((r) => server.on("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server?.close();
  await connection?.close();
});

describe("pinpoint clipboard loop on Vite (integration)", () => {
  it("/send writes a pinpoint clipboard JSON + saves the flagged screenshot", async () => {
    const sel = await connection.page.evaluate<SelectionFound>(
      "window.__pinpointExtractSelection(document.querySelector('#hero-heading'))",
    );
    const item = { ...sel, id: "a1", badge: 1, comment: "make it bigger", wantScreenshot: true };

    const res = await fetch(`${base}/session/s1/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [item] }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.imageCount).toBe(1);

    const payload = JSON.parse(clip.at(-1) as string);
    expect(payload.source).toBe("pinpoint");
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].componentName).toBe("Hero");
    expect(payload.items[0].comment).toBe("make it bigger");
    expect(payload.items[0].screenshot).toMatch(/anno-1\.png$/);
    expect(existsSync(payload.items[0].screenshot)).toBe(true);
  });
});
```

- [ ] **Step 4: Verify the rewritten tests typecheck**

Run: `pnpm typecheck`
Expected: PASS (the integration files now import only existing modules: `connector`, `bridge-server`, `sessions`, `types`).

- [ ] **Step 5: (Optional, requires live browser) run the integration suite**

```bash
pnpm --dir examples/vite-react exec vite --port 5180 --strictPort &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9222 about:blank &
pnpm --filter @pinpoint/core exec vitest run --config vitest.integration.config.ts
```
Expected: `vite` and `loop` suites PASS; clipboard JSON contains `Hero` and the PNG file exists.

- [ ] **Step 6: Commit**

```bash
git add packages/core/integration/loop.integration.test.ts packages/core/integration/vite.integration.test.ts
git rm packages/core/integration/annotations.integration.test.ts
git commit -m "test(core): rewrite integration tests for the clipboard-only loop on Vite (P1)"
```

---

## Task 6: Update docs + decisions for the clipboard-only delivery path

**Files:**
- Modify: `CLAUDE.md` (the "What this project is" paragraph and any tool references)
- Modify: `README.md` (remove MCP-tool usage; describe Send → paste)
- Modify: `docs/decisions.md` (append one row)

- [ ] **Step 1: Update `CLAUDE.md`**

In the "What this project is" section, change the clause describing how Claude reads selections. Replace:

```
a Claude Code
session reads those via `get_selection` + `screenshot` tools, greps the repo for the component,
and edits source.
```

with:

```
a Claude Code session receives those when the developer clicks **Send** (the overlay writes a
`pinpoint` JSON — per-element identity + comments + saved screenshot paths — to the clipboard;
the developer pastes it in), greps the repo for the component, and edits source. There is no MCP
server: delivery is the clipboard/paste flow.
```

- [ ] **Step 2: Update `README.md`**

Find any section listing the MCP tools (`get_selection`, `get_annotations`, `screenshot`) and replace it with the Send → paste flow: the developer clicks elements, comments, hits **Send**, and pastes the copied JSON into Claude; Claude reads the pasted identity + the referenced `.pinpoint/*.png` files. Remove instructions to configure an MCP server. (Read the current README first to match its structure; keep the launch instructions, which P2/P3 will revise.)

- [ ] **Step 3: Append a decision row**

Add to the table in `docs/decisions.md`:

```
| 2026-06-08 | Architecture | Deleted the **MCP server**; the **clipboard/paste** flow is the sole delivery path (Option A). The overlay's `/send` already serializes full per-element identity + comments + saved screenshot paths, so `get_selection`/`get_annotations`/`screenshot` returned nothing the paste didn't already carry. | Removes a whole transport + the `@modelcontextprotocol/sdk` dep; also unblocks on-demand, plugin-packaged startup (an MCP server can't be registered mid-session). See `docs/superpowers/specs/2026-06-08-plugin-clipboard-cdp-design.md`. |
```

- [ ] **Step 4: Verify the full gate passes**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md docs/decisions.md
git commit -m "docs: clipboard-only delivery path, drop MCP tool references (P1)"
```

---

## Self-Review

**Spec coverage (P1 portion):**
- "Delete the MCP server / drop tools + sdk" → Tasks 1–3. ✓
- "config default → Vite; drop Next `:3000`" (acceptance #6) → Task 4. ✓
- "Vite integration loop test passes" (acceptance #5) → Task 5. ✓
- "No `@modelcontextprotocol/sdk`" (acceptance #1) → Task 3. ✓
- Out of P1 scope (later plans): raw CDP / no Playwright (P2), plugin packaging + `.claude/` harness (P3), the `pinpoint` MCP-driving skill consolidation (P3 — the paste skill keeps working in the meantime), rename (TASK-11).

**Placeholder scan:** No TBD/TODO; every code step shows full content. Step 2 of Task 6 (README) describes the edit rather than quoting it because the current README wasn't read into this plan — the executor reads it first; this is the one acceptable "read-then-edit" step, scoped to a doc.

**Type consistency:** `startBridgeServer` / `BridgeServerDeps` used consistently across Tasks 1, 5. `cfg.port` introduced in Task 4 and used in `cli.ts`; Task 1 deliberately leaves `cfg.mcpPort` to stay green until Task 4. `SelectionFound` (from `types.ts`) is the extractor's return type used in Task 5. The `/send` request/response shape matches the kept `bridge-server.ts`.

**Ordering verified:** `packages/core/tsconfig.json` includes only `src/**/*.ts` and excludes `integration/**` + `*.test.ts`; the integration suite is excluded from the default `pnpm test`. So Tasks 2–4 stay green even though the `loop`/`vite` integration files reference deleted tools until Task 5 rewrites them. The only place those files are exercised is the optional live run in Task 5 Step 5.
