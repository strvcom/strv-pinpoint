# Annotate Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** On browser Send, the bridge writes a JSON annotation blob (+ saved screenshots) to the system clipboard; pasting it into Claude triggers a skill that acks the bridge over HTTP, which pushes an SSE status event back to that browser session so it clears — fully decoupled, session-keyed.

**Architecture:** Extend the bridge's `:7331` HTTP server with session SSE + `/send` + `/ack` routes; a pure clipboard-JSON builder + `clipboardy` writer; a screenshot saver; a composable `bridge-link.ts` injected into the overlay (3 minimal touch-points); and a `pinpoint-paste` skill. Spec: `docs/superpowers/specs/2026-06-07-annotate-lifecycle-design.md`.

**Tech Stack:** Node 20+ (nvm: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`), TypeScript ESM (`.js` imports), Vitest (colocated), Playwright/CDP, `clipboardy`, `@modelcontextprotocol/sdk`. Gates: Biome + Lefthook + typecheck (the `(0,eval)` Biome override is `playwright-page.ts` only). Branch: `task-9--annotate-lifecycle`.

**TASK-8 coordination:** all link logic in `cdp/bridge-link.ts`; `overlay-script.ts` gets only 3 isolated touch-points (Task 8 here).

---

## Task 1: Add clipboardy
**Files:** Modify root `package.json` (deps)
- [ ] **Step 1:** `pnpm add -w clipboardy` (use `dangerouslyDisableSandbox` if the install is blocked). clipboardy v4+ is pure ESM — fine (repo is `type: module`).
- [ ] **Step 2:** `pnpm typecheck` clean.
- [ ] **Step 3:** Commit: `git add package.json pnpm-lock.yaml && git commit -m "chore: add clipboardy"`

## Task 2: Clipboard writer abstraction
**Files:** Create `packages/core/src/clipboard/write.ts`
- [ ] **Step 1: Implement** (thin I/O wrapper; no unit test — exercised by Task 6/12 with a fake):
```ts
import clipboard from "clipboardy";

/** Inject a fake in tests; default writes the system clipboard via clipboardy. */
export type ClipboardWriter = (text: string) => Promise<void>;

export const systemClipboard: ClipboardWriter = (text) => clipboard.write(text);
```
- [ ] **Step 2:** `pnpm typecheck` clean.
- [ ] **Step 3:** Commit: `git add packages/core/src/clipboard/write.ts && git commit -m "feat(core): clipboard writer abstraction (clipboardy)"`

## Task 3: Clipboard JSON builder
**Files:** Create `packages/core/src/annotations/clipboard-payload.ts` (+ `.test.ts`)
- [ ] **Step 1: Failing test** (`clipboard-payload.test.ts`):
```ts
import { describe, expect, it } from "vitest";
import { buildClipboardJson } from "./clipboard-payload.js";

const item = (over = {}) => ({ id: "a1", badge: 1, componentName: "Hero", ancestry: ["Hero", "App"], selector: "#h", tagName: "H1", text: "hi", rect: { x: 0, y: 0, width: 1, height: 1 }, comment: "bigger", wantScreenshot: false, ...over });

describe("buildClipboardJson", () => {
  it("emits the pinpoint marker + session/prompt ids + items", () => {
    const json = buildClipboardJson({ bridgeUrl: "http://localhost:7331", sessionId: "s1", promptId: "p1", items: [item({ badge: 1 }), item({ id: "a2", badge: 2, componentName: "Nav" })], screenshotPaths: { 1: "/tmp/anno-1.png", 2: null } });
    const o = JSON.parse(json);
    expect(o.source).toBe("pinpoint");
    expect(o.version).toBe(1);
    expect(o).toMatchObject({ bridgeUrl: "http://localhost:7331", sessionId: "s1", promptId: "p1" });
    expect(o.items).toHaveLength(2);
    expect(o.items[0]).toMatchObject({ badge: 1, componentName: "Hero", comment: "bigger", screenshot: "/tmp/anno-1.png" });
    expect(o.items[1]).toMatchObject({ badge: 2, componentName: "Nav", screenshot: null });
  });
});
```
- [ ] **Step 2:** Run → FAIL. `pnpm vitest run packages/core/src/annotations/clipboard-payload.test.ts`
- [ ] **Step 3: Implement:**
```ts
import type { Annotation } from "../types.js";

export interface ClipboardPayloadArgs {
  bridgeUrl: string;
  sessionId: string;
  promptId: string;
  items: Annotation[];
  /** badge -> saved screenshot path (or null). */
  screenshotPaths: Record<number, string | null>;
}

export function buildClipboardJson(args: ClipboardPayloadArgs): string {
  const payload = {
    source: "pinpoint",
    version: 1,
    bridgeUrl: args.bridgeUrl,
    sessionId: args.sessionId,
    promptId: args.promptId,
    items: args.items.map((it) => ({
      badge: it.badge,
      componentName: it.componentName,
      ancestry: it.ancestry,
      selector: it.selector,
      tagName: it.tagName,
      text: it.text,
      comment: it.comment,
      screenshot: args.screenshotPaths[it.badge] ?? null,
    })),
  };
  return JSON.stringify(payload, null, 2);
}
```
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit: `git add packages/core/src/annotations/clipboard-payload.ts packages/core/src/annotations/clipboard-payload.test.ts && git commit -m "feat(core): clipboard JSON payload builder"`

## Task 4: Session registry
**Files:** Create `packages/core/src/server/sessions.ts` (+ `.test.ts`)
- [ ] **Step 1: Failing test** (`sessions.test.ts`):
```ts
import { describe, expect, it } from "vitest";
import { SessionRegistry } from "./sessions.js";

function fakeRes() { const writes: string[] = []; return { writes, write: (s: string) => { writes.push(s); return true; } } as any; }

describe("SessionRegistry", () => {
  it("pushes SSE-framed events to a registered session", () => {
    const reg = new SessionRegistry(); const res = fakeRes();
    reg.register("s1", res);
    expect(reg.pushEvent("s1", { type: "status", promptId: "p1", status: "running" })).toBe(true);
    expect(res.writes[0]).toBe(`data: {"type":"status","promptId":"p1","status":"running"}\n\n`);
  });
  it("returns false for unknown / deregistered sessions", () => {
    const reg = new SessionRegistry(); const res = fakeRes();
    reg.register("s1", res); reg.deregister("s1");
    expect(reg.pushEvent("s1", { type: "status" })).toBe(false);
    expect(reg.pushEvent("nope", { type: "status" })).toBe(false);
  });
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement:**
```ts
import type { ServerResponse } from "node:http";

export interface SseEvent {
  type: string;
  [key: string]: unknown;
}

export class SessionRegistry {
  private readonly sessions = new Map<string, ServerResponse>();

  register(id: string, res: ServerResponse): void {
    this.sessions.set(id, res);
  }
  deregister(id: string): void {
    this.sessions.delete(id);
  }
  has(id: string): boolean {
    return this.sessions.has(id);
  }
  pushEvent(id: string, event: SseEvent): boolean {
    const res = this.sessions.get(id);
    if (!res) return false;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    return true;
  }
}
```
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit: `git add packages/core/src/server/sessions.ts packages/core/src/server/sessions.test.ts && git commit -m "feat(core): SSE session registry"`

## Task 5: Save screenshots
**Files:** Create `packages/core/src/annotations/save-screenshots.ts` (+ `.test.ts`)
- [ ] **Step 1: Failing test** (`save-screenshots.test.ts`):
```ts
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { FakePage } from "../cdp/fake-page.js";
import { saveScreenshots } from "./save-screenshots.js";

const item = (over = {}) => ({ id: "a", badge: 1, componentName: "Hero", ancestry: [], selector: "#h", tagName: "H1", text: "", rect: { x: 0, y: 0, width: 4, height: 4 }, comment: "", wantScreenshot: false, ...over });
const dir = join(tmpdir(), `ff-test-${Math.floor(Math.random() * 1e9)}`);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("saveScreenshots", () => {
  it("writes PNGs only for wantScreenshot items; null otherwise", async () => {
    const page = new FakePage({ elementPng: { "#h": Buffer.from("PNG") } });
    const paths = await saveScreenshots(page, [item({ badge: 1, wantScreenshot: true, selector: "#h" }), item({ badge: 2, wantScreenshot: false })], dir);
    expect(paths[1]).toBe(join(dir, "anno-1.png"));
    expect(existsSync(paths[1] as string)).toBe(true);
    expect(paths[2]).toBeNull();
  });
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement:**
```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BridgePage } from "../cdp/page.js";
import type { Annotation } from "../types.js";

/** Capture a PNG for each wantScreenshot item; returns badge -> absolute path (or null). */
export async function saveScreenshots(
  page: BridgePage,
  items: Annotation[],
  dir: string,
): Promise<Record<number, string | null>> {
  const out: Record<number, string | null> = {};
  let dirReady = false;
  for (const it of items) {
    if (!it.wantScreenshot) {
      out[it.badge] = null;
      continue;
    }
    let png: Buffer | null = null;
    try {
      png = (await page.screenshotElement(it.selector)) ?? (await page.screenshotClip(it.rect));
    } catch {
      png = null;
    }
    if (!png) {
      out[it.badge] = null;
      continue;
    }
    if (!dirReady) {
      await mkdir(dir, { recursive: true });
      dirReady = true;
    }
    const path = join(dir, `anno-${it.badge}.png`);
    await writeFile(path, png);
    out[it.badge] = path;
  }
  return out;
}
```
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit: `git add packages/core/src/annotations/save-screenshots.ts packages/core/src/annotations/save-screenshots.test.ts && git commit -m "feat(core): save per-annotation screenshots to disk"`

## Task 6: Bridge routes (SSE + /send + /ack)
**Files:** Rewrite `packages/core/src/server/sse-server.ts`
- [ ] **Step 1: Replace the file** (keeps the existing MCP `/sse` + `/messages`; adds session routes + CORS):
```ts
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { buildClipboardJson } from "../annotations/clipboard-payload.js";
import { saveScreenshots } from "../annotations/save-screenshots.js";
import type { ClipboardWriter } from "../clipboard/write.js";
import type { BridgePage } from "../cdp/page.js";
import type { Annotation } from "../types.js";
import { registerTools } from "./register-tools.js";
import type { SessionRegistry } from "./sessions.js";

export interface SseServerDeps {
  page: BridgePage;
  sessions: SessionRegistry;
  writeClipboard: ClipboardWriter;
  bridgeUrl: string;
  /** root tmp dir for screenshots, e.g. join(os.tmpdir(), "pinpoint"). */
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

export function startSseServer(port: number, deps: SseServerDeps): Server {
  const mcp = new McpServer({ name: "pinpoint", version: "0.0.0" });
  registerTools(mcp, { page: deps.page });
  const transports = new Map<string, SSEServerTransport>();

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
        const json = buildClipboardJson({ bridgeUrl: deps.bridgeUrl, sessionId, promptId, items, screenshotPaths });
        let ok = true;
        let error: string | undefined;
        try {
          await deps.writeClipboard(json);
        } catch (e) {
          ok = false;
          error = (e as Error).message;
        }
        const imageCount = Object.values(screenshotPaths).filter(Boolean).length;
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok, promptId, imageCount, error }));
        return;
      }

      if (action === "ack" && req.method === "POST") {
        const body = await readJson<{ promptId?: string; status?: string }>(req);
        const delivered = deps.sessions.pushEvent(sessionId, { type: "status", promptId: body.promptId, status: body.status });
        res.writeHead(delivered ? 200 : 404, { "Content-Type": "application/json" }).end(JSON.stringify({ delivered }));
        return;
      }
    }

    if (req.method === "GET" && url.pathname === "/sse") {
      const t = new SSEServerTransport("/messages", res);
      transports.set(t.sessionId, t);
      res.on("close", () => transports.delete(t.sessionId));
      await mcp.connect(t);
      return;
    }
    if (req.method === "POST" && url.pathname.startsWith("/messages")) {
      const sid = url.searchParams.get("sessionId") ?? "";
      const t = transports.get(sid);
      if (!t) {
        res.writeHead(400).end("unknown sessionId");
        return;
      }
      await t.handlePostMessage(req, res);
      return;
    }
    res.writeHead(404).end("not found");
  });

  http.listen(port, "127.0.0.1");
  return http;
}
```
- [ ] **Step 2:** `pnpm typecheck` clean; `pnpm --filter @pinpoint/core build` succeeds; `pnpm test` still green (existing suite unaffected). The routes are covered by Task 12's integration test.
- [ ] **Step 3:** Commit: `git add packages/core/src/server/sse-server.ts && git commit -m "feat(core): session SSE + /send (clipboard) + /ack routes"`

## Task 7: Overlay bridge-link module
**Files:** Create `packages/core/src/cdp/bridge-link.ts`
- [ ] **Step 1: Implement** (composable JS source, like `EXTRACT_SELECTION_FN`):
```ts
/**
 * Injected as part of the overlay. Defines window.__pinpointLink:
 *  - init(onStatus): opens the bridge SSE channel, routes {type:"status"} events to onStatus.
 *  - send(items): POSTs the batch to the bridge /send; resolves to the promptId.
 * Reads window.__pinpointConfig = { bridgeUrl, sessionId } (injected by the connector).
 */
export const BRIDGE_LINK_FN = String.raw`
window.__pinpointLink = (() => {
  var cfg = window.__pinpointConfig || {};
  function init(onStatus) {
    if (!cfg.bridgeUrl || !cfg.sessionId) return;
    try {
      var es = new EventSource(cfg.bridgeUrl + '/session/' + encodeURIComponent(cfg.sessionId) + '/events');
      es.onmessage = function (e) {
        try { var d = JSON.parse(e.data); if (d && d.type === 'status' && onStatus) onStatus(d.promptId, d.status); } catch (_) {}
      };
    } catch (_) {}
  }
  async function send(items) {
    var r = await fetch(cfg.bridgeUrl + '/session/' + encodeURIComponent(cfg.sessionId) + '/send', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: items }),
    });
    var j = await r.json();
    return j.promptId;
  }
  return { init: init, send: send };
})();
`;
```
- [ ] **Step 2: Parse-check:**
```bash
pnpm --filter @pinpoint/core build
node --input-type=module -e "import('./packages/core/dist/cdp/bridge-link.js').then(m=>{new Function(m.BRIDGE_LINK_FN);console.log('bridge-link parses')})"
```
Expected: "bridge-link parses".
- [ ] **Step 3:** Commit: `git add packages/core/src/cdp/bridge-link.ts && git commit -m "feat(core): overlay bridge-link (SSE + send)"`

## Task 8: Wire the link into the overlay (3 touch-points)
**Files:** Modify `packages/core/src/cdp/overlay-script.ts`
> Keep edits minimal & isolated (TASK-8 is rewriting this file in parallel).
- [ ] **Step 1: Compose the link** — add `BRIDGE_LINK_FN` to the import and into `OVERLAY_SOURCE` right after `EXTRACT_SELECTION_FN`:
```ts
import { EXTRACT_SELECTION_FN, SELECTION_GLOBAL } from "./selection-probe.js";
import { BRIDGE_LINK_FN } from "./bridge-link.js";
// ...
export const OVERLAY_SOURCE = `
${EXTRACT_SELECTION_FN}
${BRIDGE_LINK_FN}
(() => {
  function install() {
    // ...
```
- [ ] **Step 2: init the link + Send via it.** Add `lastPromptId` to `state`, init the link inside `install()` (after `sync()`), and make the Send button call the link. Replace the Send button's `onclick` body:
```js
  // inside install(), after sync():
  if (window.__pinpointLink) {
    window.__pinpointLink.init(function (promptId, status) {
      if (status === 'running' && promptId === state.lastPromptId) {
        state.items = []; state.ready = false; renderAll(); sync();
      }
    });
  }
```
And the Send button (in `renderPanel`):
```js
  sendBtn.onclick = async function (e) {
    e.stopPropagation();
    state.ready = true; state.batchId++; sync();
    sendBtn.textContent = 'Sent — paste into Claude (Cmd+Shift+V)'; sendBtn.style.background = '#143';
    if (window.__pinpointLink) { try { state.lastPromptId = await window.__pinpointLink.send(serialize().items); } catch (_) {} }
  };
```
Add `lastPromptId: null` to the `state` object literal.
- [ ] **Step 3: Build + parse-check + tests:**
```bash
pnpm --filter @pinpoint/core build
node --input-type=module -e "import('./packages/core/dist/cdp/overlay-script.js').then(m=>{new Function(m.OVERLAY_SOURCE);console.log('overlay parses')})"
pnpm test
```
Expected: parses; tests green.
- [ ] **Step 4:** Commit: `git add packages/core/src/cdp/overlay-script.ts && git commit -m "feat(core): overlay Send posts to bridge; clears on 'running' status"`

## Task 9: Connector injects config preamble
**Files:** Modify `packages/core/src/cdp/connector.ts`
- [ ] **Step 1:** Add `bridgeUrl` to `ConnectOptions`, generate a `sessionId`, inject the config preamble before `OVERLAY_SOURCE`, and return `sessionId` on the `Connection`:
```ts
import { randomUUID } from "node:crypto";
// ...
export interface ConnectOptions { cdpUrl: string; appUrl: string; bridgeUrl: string; }
export interface Connection { browser: Browser; page: PlaywrightPage; sessionId: string; close(): Promise<void>; }

export async function connect(opts: ConnectOptions): Promise<Connection> {
  const browser = await chromium.connectOverCDP(opts.cdpUrl);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const existing = context.pages().find((p) => p.url().startsWith(opts.appUrl));
  const page = existing ?? (await context.newPage());
  if (!existing) await page.goto(opts.appUrl);
  const bridgePage = new PlaywrightPage(page);
  const sessionId = randomUUID();
  const preamble = `window.__pinpointConfig = ${JSON.stringify({ bridgeUrl: opts.bridgeUrl, sessionId })};`;
  await bridgePage.injectBootstrap(`${preamble}\n${OVERLAY_SOURCE}`);
  return { browser, page: bridgePage, sessionId, close: async () => { await browser.close(); } };
}
```
- [ ] **Step 2:** `pnpm typecheck` clean; `pnpm --filter @pinpoint/core build` succeeds.
- [ ] **Step 3:** Commit: `git add packages/core/src/cdp/connector.ts && git commit -m "feat(core): inject __pinpointConfig (bridgeUrl + sessionId)"`

## Task 10: CLI wiring
**Files:** Modify `packages/core/src/cli.ts`
- [ ] **Step 1:** Construct the registry/clipboard/tmpRoot/bridgeUrl and pass through:
```ts
#!/usr/bin/env node
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Connection, connect } from "./cdp/connector.js";
import { systemClipboard } from "./clipboard/write.js";
import { parseConfig } from "./config.js";
import { SessionRegistry } from "./server/sessions.js";
import { startSseServer } from "./server/sse-server.js";

async function main() {
  const cfg = parseConfig(process.env);
  const bridgeUrl = `http://localhost:${cfg.mcpPort}`;
  let connection: Connection;
  try {
    connection = await connect({ cdpUrl: cfg.cdpUrl, appUrl: cfg.appUrl, bridgeUrl });
  } catch (err) {
    console.error(
      `Could not connect to Chrome at ${cfg.cdpUrl}. Launch Chrome with:\n` +
        `  <chrome> --remote-debugging-port=9222 --user-data-dir=/tmp/ff-chrome ${cfg.appUrl}\n` +
        `Original error: ${(err as Error).message}`,
    );
    process.exit(1);
  }
  startSseServer(cfg.mcpPort, {
    page: connection.page,
    sessions: new SessionRegistry(),
    writeClipboard: systemClipboard,
    bridgeUrl,
    tmpRoot: join(tmpdir(), "pinpoint"),
  });
  console.error(`pinpoint MCP (SSE) on ${bridgeUrl}/sse · session ${connection.sessionId}`);
  process.on("SIGINT", async () => { await connection.close(); process.exit(0); });
}

main().catch((e) => { console.error(e); process.exit(1); });
```
- [ ] **Step 2:** Build; smoke (no Chrome) → prints the connect hint + exit 1: `node packages/core/dist/cli.js; echo "exit=$?"`.
- [ ] **Step 3:** Commit: `git add packages/core/src/cli.ts && git commit -m "feat(core): wire sessions + clipboard + bridgeUrl into the bridge"`

## Task 11: pinpoint-paste skill
**Files:** Create `.claude/skills/pinpoint-paste/SKILL.md`
- [ ] **Step 1: Write the skill:**
```markdown
---
name: pinpoint-paste
description: Use when the user's message contains a JSON block with "source": "pinpoint" (pasted from the pinpoint browser overlay after clicking Send). Applies each annotation's comment to its component and acks the bridge so the browser clears.
---

# pinpoint paste handler

The user clicked **Send** in the pinpoint overlay and pasted the resulting JSON. It looks like:
`{ "source": "pinpoint", "bridgeUrl", "sessionId", "promptId", "items": [{ badge, componentName, ancestry, selector, tagName, text, comment, screenshot }] }`.

## Steps
1. **Parse** the JSON block from the message (ignore any surrounding prose the user added).
2. **Ack immediately** (this clears the browser the moment you start): run
   `curl -fsS -X POST "<bridgeUrl>/session/<sessionId>/ack" -H 'content-type: application/json' -d '{"promptId":"<promptId>","status":"running"}'`
   using the values from the JSON.
3. **For each item**, apply its `comment`:
   - If `screenshot` is a path, `Read` it for visual context.
   - Locate source: grep `componentName` (`function <name>`, `const <name> =`, `export default function <name>`); use `ancestry` to disambiguate; if `componentName` is null, fall back to the visible `text` + `selector`.
   - Make the edit. Let HMR reload.
4. **Summarize** the per-item edits. (A future version may also ack `status:"done"`.)

## Notes
- The comment is the instruction; an empty comment → ask the user what they want for that item.
- Surrounding prose the user typed around the JSON is extra context — honor it.
```
- [ ] **Step 2:** Commit: `git add .claude/skills/pinpoint-paste && git commit -m "feat: pinpoint-paste skill (ack + apply annotations)"`

## Task 12: Bridge integration test (Node, no browser)
**Files:** Create `packages/core/integration/bridge-routes.integration.test.ts`
> Pure-Node (no Chrome); uses FakePage + a capturing clipboard. Excluded from default `vitest run`.
- [ ] **Step 1: Write the test:**
```ts
import { existsSync } from "node:fs";
import { get } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakePage } from "../src/cdp/fake-page.js";
import { SessionRegistry } from "../src/server/sessions.js";
import { startSseServer } from "../src/server/sse-server.js";
import { tmpdir } from "node:os";
import { join } from "node:path";

const clip: string[] = [];
const page = new FakePage({ elementPng: { "#h": Buffer.from("PNG-BYTES") } });
const tmpRoot = join(tmpdir(), `ff-int-${Math.floor(Math.random() * 1e9)}`);
let server: ReturnType<typeof startSseServer>;
let base: string;

beforeAll(async () => {
  server = startSseServer(0, { page, sessions: new SessionRegistry(), writeClipboard: async (t) => { clip.push(t); }, bridgeUrl: "http://localhost:0", tmpRoot });
  await new Promise((r) => server.on("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const item = (over = {}) => ({ id: "a", badge: 1, componentName: "Hero", ancestry: ["Hero"], selector: "#h", tagName: "H1", text: "hi", rect: { x: 0, y: 0, width: 4, height: 4 }, comment: "bigger", wantScreenshot: false, ...over });

describe("bridge routes", () => {
  it("/send writes a pinpoint JSON to the clipboard + saves flagged screenshots", async () => {
    const res = await fetch(`${base}/session/s1/send`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: [item({ badge: 1, wantScreenshot: true, selector: "#h" }), item({ id: "a2", badge: 2, componentName: "Nav", wantScreenshot: false })] }) });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.imageCount).toBe(1);
    const payload = JSON.parse(clip.at(-1) as string);
    expect(payload.source).toBe("pinpoint");
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0].screenshot).toMatch(/anno-1\.png$/);
    expect(existsSync(payload.items[0].screenshot)).toBe(true);
    expect(payload.items[1].screenshot).toBeNull();
  });

  it("/ack pushes an SSE status event to the subscribed session", async () => {
    const received: string[] = [];
    await new Promise<void>((resolve) => {
      get(`${base}/session/s2/events`, (r) => {
        r.on("data", (c) => {
          received.push(c.toString());
          if (received.join("").includes('"status":"running"')) resolve();
        });
        // once subscribed, fire the ack
        setTimeout(() => { fetch(`${base}/session/s2/ack`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ promptId: "p1", status: "running" }) }); }, 100);
      });
    });
    expect(received.join("")).toContain('"type":"status"');
    expect(received.join("")).toContain('"promptId":"p1"');
  });
});
```
- [ ] **Step 2: Run:** `pnpm --filter @pinpoint/core exec vitest run --config vitest.integration.config.ts bridge-routes`
Expected: PASS (2 tests).
- [ ] **Step 3:** Commit: `git add packages/core/integration/bridge-routes.integration.test.ts && git commit -m "test(core): bridge routes integration (/send clipboard + /ack SSE)"`

---

## Definition of Done
`pnpm test` green (units: clipboard-payload, sessions, save-screenshots + existing 35); `pnpm typecheck` + Biome clean; the bridge-routes integration test passes; overlay parses with the link composed; CLI smoke OK. The skill exists. Full browser loop verified after the TASK-8 overlay reconcile.

## Self-review
- **Spec coverage:** JSON clipboard (T3) ✓; clipboardy writer (T1/T2) ✓; sessions+SSE (T4), /send+/ack+CORS (T6) ✓; save-screenshots (T5) ✓; promptId+status protocol (T6 send returns promptId; /ack status; overlay clears on running — T8) ✓; HTTP ack not MCP (T6/T11) ✓; bridge-link composable (T7) + 3 overlay touch-points (T8) ✓; connector config preamble (T9) ✓; CLI wiring (T10) ✓; skill (T11) ✓; integration (T12) ✓. No new MCP tool added (ack is HTTP). 
- **Type consistency:** `Annotation` fields (badge, componentName, ancestry, selector, tagName, text, rect, comment, wantScreenshot) used identically in clipboard-payload/save-screenshots/test fixtures; `ConnectOptions` gains `bridgeUrl`, `Connection` gains `sessionId` (T9) — cli (T10) passes `bridgeUrl` and reads `sessionId`. `SseServerDeps` matches the cli construction. `ClipboardWriter` signature `(text)=>Promise<void>` consistent (T2/T6/T12).
- **Placeholders:** none.
