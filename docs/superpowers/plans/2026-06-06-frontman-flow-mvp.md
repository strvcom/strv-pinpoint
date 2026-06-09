# pinpoint MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node/TS bridge that exposes `get_selection` + `screenshot` to Claude Code over an SSE MCP server, reaching frontman's browser context via CDP and its dev-server middleware over plain HTTP — proving the click → describe → edit → HMR loop on Next.js with the frontman Elixir server NOT running.

**Architecture:** One bridge process is three connectors: an MCP server (SSE) toward Claude Code; a CDP client (Playwright `connectOverCDP`) toward the Chrome running the dev app + frontman overlay; and a plain-HTTP client toward frontman's `/frontman/*` middleware. Tool logic is pure functions over injected `BridgePage` + `FrontmanHttpClient` deps, unit-tested against fakes; the real CDP/SDK wiring is verified by an integration test. The single genuine unknown — how to read the overlay's current selection from the page — is isolated behind a `SELECTION_PROBE` expression that Phase 0 determines and commits.

**Tech Stack:** Node 20+, TypeScript (ESM / NodeNext), pnpm workspaces, Vitest (colocated `*.test.ts`), Playwright (`chromium.connectOverCDP`), `@modelcontextprotocol/sdk`, Next.js (example app) + `@frontman-ai/*` middleware.

**Reference:** `.reference/frontman` @ `v0.18.0` is READ-ONLY. Never edit/commit it. Re-clone with `scripts/sync-reference.sh` if missing.

---

## File Structure

```
pinpoint/
├─ package.json                 # pnpm workspace root + scripts
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ vitest.config.ts
├─ .mcp.json                    # Claude Code → bridge SSE wiring (Task 1.13)
├─ packages/core/
│  ├─ package.json              # @pinpoint/core, bin: pinpoint
│  ├─ tsconfig.json
│  └─ src/
│     ├─ types.ts                       # shared types (Task 1.2)
│     ├─ config.ts                      # BridgeConfig + parsing (Task 1.11)
│     ├─ cdp/
│     │  ├─ page.ts                     # BridgePage interface (Task 1.3)
│     │  ├─ fake-page.ts                # test double (Task 1.3)
│     │  ├─ selection-probe.ts          # RawSelection + SELECTION_PROBE (Task 0.3)
│     │  ├─ playwright-page.ts          # Playwright→BridgePage adapter (Task 1.10)
│     │  └─ connector.ts                # connectOverCDP + open page (Task 1.10)
│     ├─ frontman/
│     │  ├─ http-client.ts              # resolve-source-location (Task 1.4)
│     │  └─ http-client.test.ts
│     ├─ selection/
│     │  ├─ read-selection.ts           # readSelection(page) (Task 1.5)
│     │  └─ read-selection.test.ts
│     ├─ screenshot/
│     │  ├─ capture.ts                  # capture(page, target, selectorOf) (Task 1.6)
│     │  └─ capture.test.ts
│     ├─ tools/
│     │  ├─ deps.ts                     # ToolDeps (Task 1.7)
│     │  ├─ get-selection.ts            # (Task 1.7)
│     │  ├─ get-selection.test.ts
│     │  ├─ screenshot-tool.ts          # (Task 1.8)
│     │  └─ screenshot-tool.test.ts
│     ├─ server/
│     │  ├─ register-tools.ts           # register tools on McpServer (Task 1.9)
│     │  ├─ register-tools.test.ts      # in-process client↔server
│     │  └─ sse-server.ts               # http + SSEServerTransport (Task 1.12)
│     ├─ cli.ts                         # entrypoint wiring (Task 1.12)
│     └─ index.ts                       # public exports (Task 1.2)
├─ examples/nextjs/             # throwaway Next.js app + frontman middleware (Task 0.2)
└─ docs/superpowers/
   ├─ specs/2026-06-06-pinpoint-design.md
   ├─ notes/phase0-frontman-contract.md   # Phase 0 deliverable (Task 0.1)
   ├─ notes/phase0-spike-findings.md       # Phase 0 deliverable (Tasks 0.2–0.3)
   └─ plans/2026-06-06-pinpoint-mvp.md
```

---

# Phase 0 — Spike / De-risk

Phase 0 is investigative. Its tasks produce **findings + committed artifacts** (a contract note, a confirmed run, and the real `SELECTION_PROBE`), not feature code. If any task discovers a hard dependency on the AGPL Elixir server, **STOP and flag it** per `CLAUDE.md` — that invalidates the MVP premise and must be raised before Phase 1.

## Task 0.1: Pin the frontman contract from the reference

**Files:**
- Create: `docs/superpowers/notes/phase0-frontman-contract.md`
- Read only: `.reference/frontman/libs/frontman-nextjs/`, `.reference/frontman/libs/frontman-core/src/FrontmanCore__Middleware.res`, `.reference/frontman/libs/frontman-core/src/FrontmanCore__RequestHandlers.res`

- [ ] **Step 1: Ensure the reference exists**

Run: `scripts/sync-reference.sh`
Expected: `✓ reference clone present at .reference/frontman` (or a fresh clone).

- [ ] **Step 2: Extract the exact install + endpoint contract**

Read these and record verbatim facts (no guessing):
- `.reference/frontman/libs/frontman-nextjs/package.json` → the **published npm package name** and version, and any `bin`/install script.
- `.reference/frontman/libs/frontman-nextjs/README.md` (or `AGENTS.md`) → the **middleware install snippet** (the `middleware.ts`/`proxy.ts` the developer adds, the `createMiddleware` import path, and the `config.matcher`).
- `.reference/frontman/libs/frontman-core/src/FrontmanCore__Middleware.res` → confirm the route paths: `/frontman/tools`, `/frontman/tools/call`, `/frontman/resolve-source-location`, and the UI route `/frontman`.
- `.reference/frontman/libs/frontman-core/src/FrontmanCore__RequestHandlers.res` → the **request and response JSON shape** of `POST /frontman/resolve-source-location` (field names + types).

- [ ] **Step 3: Write the contract note**

Write `docs/superpowers/notes/phase0-frontman-contract.md` containing, with exact values:
1. Package name(s) + install command for the Next.js middleware.
2. The exact `middleware.ts` snippet to enable frontman in `examples/nextjs`.
3. The four route paths.
4. `resolve-source-location` request shape and response shape (field-by-field).

Acceptance: every value is copied from the reference, with the source file path cited next to it.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/notes/phase0-frontman-contract.md
git commit -m "docs(phase0): pin frontman Next.js middleware + endpoint contract"
```

## Task 0.2: Stand up examples/nextjs and confirm middleware works with Elixir OFF

**Files:**
- Create: `examples/nextjs/` (minimal Next.js app)
- Create/append: `docs/superpowers/notes/phase0-spike-findings.md`

- [ ] **Step 1: Scaffold a minimal Next.js app**

Run:
```bash
mkdir -p examples
pnpm create next-app@latest examples/nextjs --ts --app --no-tailwind --no-eslint --no-src-dir --import-alias "@/*" --use-pnpm
```
Expected: a runnable Next.js app in `examples/nextjs`.

- [ ] **Step 2: Install the frontman Next.js middleware**

Using the package name + snippet recorded in Task 0.1, install the dependency in `examples/nextjs` and add the `middleware.ts` exactly as documented. Do NOT point it at any cloud/Elixir host — use the local-dev configuration from the contract note.

- [ ] **Step 3: Run the dev server with the Elixir server NOT running**

Run (in one terminal): `pnpm --dir examples/nextjs dev`
Confirm the Elixir server is not running: `curl -fsS http://localhost:4000 || echo "elixir down (expected)"`

- [ ] **Step 4: Probe the three endpoints**

Run:
```bash
curl -fsS http://localhost:3000/frontman/tools | head -c 400; echo
curl -fsS -X POST http://localhost:3000/frontman/resolve-source-location \
  -H 'content-type: application/json' \
  -d '{"componentName":"X","file":"app/page.tsx","line":1,"column":1}' | head -c 400; echo
curl -fsS http://localhost:3000/frontman | grep -io 'frontman' | head -1
```
Expected: `/frontman/tools` returns a JSON tool list (HTTP 200); `/frontman/resolve-source-location` returns a JSON object (200, even if it echoes/normalizes the path); `/frontman` serves the overlay HTML shell.

- [ ] **Step 5: Record findings (or flag a blocker)**

Append to `docs/superpowers/notes/phase0-spike-findings.md`:
- Whether each endpoint returned 200 with Elixir off (paste truncated responses).
- The dev-server port and base URL.
- **If any endpoint requires the Elixir server: STOP, write the blocker prominently, and surface it to the user before continuing.**

- [ ] **Step 6: Commit**

```bash
git add examples/nextjs docs/superpowers/notes/phase0-spike-findings.md
git commit -m "spike(phase0): examples/nextjs with frontman middleware; endpoints serve with Elixir off"
```

## Task 0.3: Determine SELECTION_PROBE (how to read the current selection via CDP)

**Files:**
- Create: `packages/core/src/cdp/selection-probe.ts`
- Append: `docs/superpowers/notes/phase0-spike-findings.md`
- Read only: `.reference/frontman/libs/client/src/state/Client__Task__Reducer.res`, `.reference/frontman/libs/client/src/state/Client__Task__Types.res`, `.reference/frontman/libs/client/src/Client__SourceDetection.res`

- [ ] **Step 1: Launch Chrome with a debug port and open the dev app**

Run (macOS):
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 --user-data-dir=/tmp/ff-chrome-profile \
  http://localhost:3000 &
```
Expected: Chrome opens the app; `curl -fsS http://localhost:9222/json/version` returns JSON.

- [ ] **Step 2: Click an element in the frontman overlay**

In that Chrome window, activate the frontman overlay and click a visible element (e.g., a heading on the page). Leave it selected.

- [ ] **Step 3: Find where the resolved selection lives in the page**

Read the reference reducer/types (cited above) to learn the in-page selection state shape: the annotations array, and the `sourceLocation` field that holds the resolved `{file, line, column, component}`. Then, in Chrome DevTools console on the app page, find a JS expression that returns the currently-selected annotation's resolved source. Try, in order:
1. A `window`-exposed frontman API/state, if one exists.
2. The React/Redux store reachable from a known root (inspect the overlay's mount node).
3. Fallback: read the selected element + run the same detection the overlay uses, then POST to `/frontman/resolve-source-location`.

Record the working expression and the exact shape it returns.

- [ ] **Step 4: Author `selection-probe.ts` with the real expression**

Create `packages/core/src/cdp/selection-probe.ts`:

```ts
/**
 * Determined in Phase 0 (Task 0.3). See docs/superpowers/notes/phase0-spike-findings.md.
 * SELECTION_PROBE is a JS *expression* evaluated in the dev-app page; it returns the
 * currently-selected element's resolved info, or null when nothing is selected.
 */
export interface RawSelection {
  source: {
    file: string;
    line: number;
    column: number;
    component: string | null;
  } | null;
  selector: string;
  tagName: string;
  rect: { x: number; y: number; width: number; height: number };
}

// Replace the expression body below with the one confirmed in Step 3.
export const SELECTION_PROBE = String.raw`(() => { /* confirmed in Phase 0 Step 3 */ return null; })()`;
```

Then replace the `SELECTION_PROBE` body with the confirmed expression so that, with an element selected, evaluating it returns a populated `RawSelection`, and with nothing selected it returns `null`. The `selector`, `tagName`, and `rect` must be derived in the expression from the selected DOM element; `source` is the resolved annotation (or `null` if unresolved).

- [ ] **Step 5: Manually verify the probe end-to-end**

Run:
```bash
curl -fsS http://localhost:9222/json | grep -o '"webSocketDebuggerUrl":"[^"]*"' | head -1
```
Then, in the DevTools console of the app page, paste the `SELECTION_PROBE` expression with an element selected → expect a populated object; deselect → expect `null`. Paste both results into the findings note.

- [ ] **Step 6: Record the go/no-go decision**

Append to `docs/superpowers/notes/phase0-spike-findings.md`: the confirmed expression, the returned shape, whether `source` arrives already source-map-resolved (in-page) or needs the HTTP fallback, and a clear **GO** for Phase 1 (or a blocker).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/cdp/selection-probe.ts docs/superpowers/notes/phase0-spike-findings.md
git commit -m "spike(phase0): confirm SELECTION_PROBE reads current selection via CDP"
```

---

# Phase 1 — Next.js Vertical Slice (MVP)

> ⚠️ **SUPERSEDED by "Revised Phase 1 (post-Phase-0 amendment)" at the end of this file.**
> Phase 0 changed the mechanism: the bridge is now CDP-only with an injected overlay and
> React-fiber **identity** (not source-mapping), and partial screenshots are a **click-drag region**.
> The tasks below are kept for history; implement the revised list instead. Task 1.1 (scaffolding) and
> the config/SSE/CLI tasks carry over almost verbatim.

Phase 1 builds the bridge with TDD against fakes; the real CDP/SDK wiring is proven by the integration test. All imports use explicit `.js` extensions (NodeNext ESM).

## Task 1.1: Workspace scaffolding

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`, `packages/core/package.json`, `packages/core/tsconfig.json`

- [ ] **Step 1: Create the workspace root files**

`package.json`:
```json
{
  "name": "pinpoint",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "pnpm -r build",
    "typecheck": "tsc -p packages/core/tsconfig.json --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "@types/node": "^20.14.0"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
  - "examples/*"
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "declaration": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 2: Create the core package files**

`packages/core/package.json`:
```json
{
  "name": "@pinpoint/core",
  "version": "0.0.0",
  "type": "module",
  "bin": { "pinpoint": "./dist/cli.js" },
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node ./dist/cli.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "playwright": "^1.45.0",
    "zod": "^3.23.0"
  }
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts", "integration/**"]
}
```

- [ ] **Step 3: Install dependencies**

Run: `pnpm install`
Expected: lockfile created, no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json vitest.config.ts packages/core/package.json packages/core/tsconfig.json pnpm-lock.yaml
git commit -m "chore(core): scaffold pnpm workspace + @pinpoint/core"
```

## Task 1.2: Shared types

**Files:**
- Create: `packages/core/src/types.ts`, `packages/core/src/index.ts`

- [ ] **Step 1: Write the types**

`packages/core/src/types.ts`:
```ts
export interface SourceLocation {
  /** Path relative to the project root. */
  file: string;
  line: number;
  column: number;
  component: string | null;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SelectionFound {
  status: "selected";
  /** null when the clicked node could not be mapped to source. */
  source: SourceLocation | null;
  selector: string;
  tagName: string;
  rect: Rect;
}

export interface NoSelection {
  status: "none";
  message: string;
}

export type SelectionResult = SelectionFound | NoSelection;

export type ScreenshotTarget =
  | { kind: "viewport" }
  | { kind: "selection" }
  | { kind: "selector"; selector: string };

export interface CapturedImage {
  mimeType: "image/png";
  /** base64-encoded PNG bytes. */
  base64: string;
}
```

`packages/core/src/index.ts`:
```ts
export * from "./types.js";
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/index.ts
git commit -m "feat(core): shared types for selection + screenshots"
```

## Task 1.3: BridgePage interface + fake

**Files:**
- Create: `packages/core/src/cdp/page.ts`, `packages/core/src/cdp/fake-page.ts`

- [ ] **Step 1: Define the page abstraction**

`packages/core/src/cdp/page.ts`:
```ts
/**
 * The minimal page surface the bridge needs. Implemented by the Playwright
 * adapter in production and by FakePage in tests.
 */
export interface BridgePage {
  /** Evaluate a JS expression string in the page and return its JSON-serializable value. */
  evaluate<T>(expression: string): Promise<T>;
  /** PNG bytes of the current viewport. */
  screenshotViewport(): Promise<Buffer>;
  /** PNG bytes of the first element matching selector, or null if none matches. */
  screenshotElement(selector: string): Promise<Buffer | null>;
}
```

- [ ] **Step 2: Write the fake**

`packages/core/src/cdp/fake-page.ts`:
```ts
import type { BridgePage } from "./page.js";

export interface FakePageOptions {
  evalResults?: Record<string, unknown>;
  viewportPng?: Buffer;
  elementPng?: Record<string, Buffer | null>;
}

export class FakePage implements BridgePage {
  readonly evaluatedExpressions: string[] = [];
  readonly elementSelectors: string[] = [];

  constructor(private readonly opts: FakePageOptions = {}) {}

  async evaluate<T>(expression: string): Promise<T> {
    this.evaluatedExpressions.push(expression);
    const map = this.opts.evalResults ?? {};
    if (expression in map) return map[expression] as T;
    // Default: single registered result regardless of expression key "*".
    if ("*" in map) return map["*"] as T;
    return null as T;
  }

  async screenshotViewport(): Promise<Buffer> {
    return this.opts.viewportPng ?? Buffer.from("viewport-png");
  }

  async screenshotElement(selector: string): Promise<Buffer | null> {
    this.elementSelectors.push(selector);
    const map = this.opts.elementPng ?? {};
    if (selector in map) return map[selector];
    return Buffer.from(`element-png:${selector}`);
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/cdp/page.ts packages/core/src/cdp/fake-page.ts
git commit -m "feat(core): BridgePage interface + FakePage test double"
```

## Task 1.4: Frontman HTTP client (resolve-source-location)

**Files:**
- Create: `packages/core/src/frontman/http-client.ts`
- Test: `packages/core/src/frontman/http-client.test.ts`

> **Role of this client.** The primary `get_selection` path reads an *already-resolved* source location from the page (`SELECTION_PROBE`), so this client is **not wired into `ToolDeps` by default**. Build it now because: (a) if Phase 0 Step 6 decided the probe returns only *unresolved* raw `{file,line}`, the fallback wiring in Task 1.5's note injects this client and calls it; and (b) it is the groundwork for Phase 3 file-tool proxying. If Phase 0 confirmed in-page resolution, this client stays available but unused by the MVP runtime — that is expected, not an orphan.

- [ ] **Step 1: Write the failing test**

`packages/core/src/frontman/http-client.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { FrontmanHttpClient } from "./http-client.js";

describe("FrontmanHttpClient.resolveSourceLocation", () => {
  it("POSTs the element info and returns the resolved source location", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ componentName: "Heading", file: "app/page.tsx", line: 12, column: 4 }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new FrontmanHttpClient("http://localhost:3000", fetchMock);

    const result = await client.resolveSourceLocation({
      componentName: "Heading",
      file: "/abs/app/page.tsx",
      line: 12,
      column: 4,
    });

    expect(result).toEqual({ file: "app/page.tsx", line: 12, column: 4, component: "Heading" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/frontman/resolve-source-location",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns null on a non-200 response", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 404 }));
    const client = new FrontmanHttpClient("http://localhost:3000", fetchMock);
    const result = await client.resolveSourceLocation({
      componentName: null,
      file: "x",
      line: 1,
      column: 1,
    });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/frontman/http-client.test.ts`
Expected: FAIL — `Cannot find module './http-client.js'`.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/frontman/http-client.ts`:
```ts
import type { SourceLocation } from "../types.js";

export interface ResolveRequest {
  componentName: string | null;
  file: string;
  line: number;
  column: number;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class FrontmanHttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchLike = globalThis.fetch,
  ) {}

  async resolveSourceLocation(req: ResolveRequest): Promise<SourceLocation | null> {
    const res = await this.fetchImpl(`${this.baseUrl}/frontman/resolve-source-location`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    if (res.status !== 200) return null;
    const data = (await res.json()) as {
      componentName?: string | null;
      file: string;
      line: number;
      column: number;
    };
    return {
      file: data.file,
      line: data.line,
      column: data.column,
      component: data.componentName ?? null,
    };
  }
}
```

> If Phase 0 (Task 0.1 Step 2) recorded different field names for the response, adjust the mapping here and in the test to match the contract note exactly.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core/src/frontman/http-client.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/frontman/http-client.ts packages/core/src/frontman/http-client.test.ts
git commit -m "feat(core): frontman HTTP client for resolve-source-location"
```

## Task 1.5: readSelection(page)

**Files:**
- Create: `packages/core/src/selection/read-selection.ts`
- Test: `packages/core/src/selection/read-selection.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/src/selection/read-selection.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { FakePage } from "../cdp/fake-page.js";
import { SELECTION_PROBE, type RawSelection } from "../cdp/selection-probe.js";
import { readSelection } from "./read-selection.js";

describe("readSelection", () => {
  it("returns a 'none' result when the probe returns null", async () => {
    const page = new FakePage({ evalResults: { [SELECTION_PROBE]: null } });
    const result = await readSelection(page);
    expect(result.status).toBe("none");
    expect(page.evaluatedExpressions).toContain(SELECTION_PROBE);
  });

  it("maps a populated RawSelection to a 'selected' result", async () => {
    const raw: RawSelection = {
      source: { file: "app/page.tsx", line: 12, column: 4, component: "Heading" },
      selector: "main > h1",
      tagName: "H1",
      rect: { x: 10, y: 20, width: 100, height: 40 },
    };
    const page = new FakePage({ evalResults: { [SELECTION_PROBE]: raw } });
    const result = await readSelection(page);
    expect(result).toEqual({
      status: "selected",
      source: raw.source,
      selector: "main > h1",
      tagName: "H1",
      rect: raw.rect,
    });
  });

  it("preserves a null source (unresolved node)", async () => {
    const raw: RawSelection = {
      source: null,
      selector: "div.box",
      tagName: "DIV",
      rect: { x: 0, y: 0, width: 50, height: 50 },
    };
    const page = new FakePage({ evalResults: { [SELECTION_PROBE]: raw } });
    const result = await readSelection(page);
    expect(result).toMatchObject({ status: "selected", source: null, selector: "div.box" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/selection/read-selection.test.ts`
Expected: FAIL — `Cannot find module './read-selection.js'`.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/selection/read-selection.ts`:
```ts
import type { BridgePage } from "../cdp/page.js";
import type { SelectionResult } from "../types.js";
import { SELECTION_PROBE, type RawSelection } from "../cdp/selection-probe.js";

const NONE_MESSAGE =
  "No element is selected. Click an element in the frontman overlay, then ask again.";

export async function readSelection(page: BridgePage): Promise<SelectionResult> {
  const raw = await page.evaluate<RawSelection | null>(SELECTION_PROBE);
  if (!raw) return { status: "none", message: NONE_MESSAGE };
  return {
    status: "selected",
    source: raw.source,
    selector: raw.selector,
    tagName: raw.tagName,
    rect: raw.rect,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core/src/selection/read-selection.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/selection/read-selection.ts packages/core/src/selection/read-selection.test.ts
git commit -m "feat(core): readSelection over BridgePage via SELECTION_PROBE"
```

> **Conditional HTTP fallback (only if Phase 0 Step 6 decided the probe is unresolved).** Add `frontman: FrontmanHttpClient` to `ToolDeps` (Task 1.7) and `cli.ts` (Task 1.12, `new FrontmanHttpClient(cfg.frontmanBaseUrl)`), give `readSelection(page, frontman?)` an optional client param, and when `raw.source` is present-but-unresolved, call `frontman.resolveSourceLocation(...)` and use its result for `source`. Add a matching test that injects a stub client. If Phase 0 confirmed in-page resolution, skip this entirely.

## Task 1.6: Screenshot capture

**Files:**
- Create: `packages/core/src/screenshot/capture.ts`
- Test: `packages/core/src/screenshot/capture.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/src/screenshot/capture.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { FakePage } from "../cdp/fake-page.js";
import { capture } from "./capture.js";

describe("capture", () => {
  it("captures the viewport", async () => {
    const page = new FakePage({ viewportPng: Buffer.from("VP") });
    const img = await capture(page, { kind: "viewport" }, async () => null);
    expect(img).toEqual({ mimeType: "image/png", base64: Buffer.from("VP").toString("base64") });
  });

  it("captures by explicit selector", async () => {
    const page = new FakePage({ elementPng: { ".target": Buffer.from("EL") } });
    const img = await capture(page, { kind: "selector", selector: ".target" }, async () => null);
    expect(img?.base64).toBe(Buffer.from("EL").toString("base64"));
    expect(page.elementSelectors).toContain(".target");
  });

  it("captures the current selection by resolving its selector", async () => {
    const page = new FakePage({ elementPng: { "main > h1": Buffer.from("SEL") } });
    const img = await capture(page, { kind: "selection" }, async () => "main > h1");
    expect(img?.base64).toBe(Buffer.from("SEL").toString("base64"));
  });

  it("returns null for a selection screenshot when nothing is selected", async () => {
    const page = new FakePage();
    const img = await capture(page, { kind: "selection" }, async () => null);
    expect(img).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/screenshot/capture.test.ts`
Expected: FAIL — `Cannot find module './capture.js'`.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/screenshot/capture.ts`:
```ts
import type { BridgePage } from "../cdp/page.js";
import type { CapturedImage, ScreenshotTarget } from "../types.js";

/** Resolves the CSS selector of the currently-selected element, or null if none. */
export type SelectorOfSelection = () => Promise<string | null>;

function toImage(png: Buffer): CapturedImage {
  return { mimeType: "image/png", base64: png.toString("base64") };
}

export async function capture(
  page: BridgePage,
  target: ScreenshotTarget,
  selectorOfSelection: SelectorOfSelection,
): Promise<CapturedImage | null> {
  switch (target.kind) {
    case "viewport":
      return toImage(await page.screenshotViewport());
    case "selector": {
      const png = await page.screenshotElement(target.selector);
      return png ? toImage(png) : null;
    }
    case "selection": {
      const selector = await selectorOfSelection();
      if (!selector) return null;
      const png = await page.screenshotElement(selector);
      return png ? toImage(png) : null;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core/src/screenshot/capture.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/screenshot/capture.ts packages/core/src/screenshot/capture.test.ts
git commit -m "feat(core): screenshot capture for viewport/selector/selection"
```

## Task 1.7: get_selection tool handler

**Files:**
- Create: `packages/core/src/tools/deps.ts`, `packages/core/src/tools/get-selection.ts`
- Test: `packages/core/src/tools/get-selection.test.ts`

- [ ] **Step 1: Write the deps type**

`packages/core/src/tools/deps.ts`:
```ts
import type { BridgePage } from "../cdp/page.js";

export interface ToolDeps {
  page: BridgePage;
}

/** MCP CallTool result shape the handlers return. */
export interface ToolResult {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  >;
  isError?: boolean;
}
```

- [ ] **Step 2: Write the failing test**

`packages/core/src/tools/get-selection.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { FakePage } from "../cdp/fake-page.js";
import { SELECTION_PROBE, type RawSelection } from "../cdp/selection-probe.js";
import { getSelectionTool } from "./get-selection.js";

describe("getSelectionTool", () => {
  it("returns the selected source as JSON text", async () => {
    const raw: RawSelection = {
      source: { file: "app/page.tsx", line: 12, column: 4, component: "Heading" },
      selector: "main > h1",
      tagName: "H1",
      rect: { x: 1, y: 2, width: 3, height: 4 },
    };
    const page = new FakePage({ evalResults: { [SELECTION_PROBE]: raw } });
    const result = await getSelectionTool({ page });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toMatchObject({ status: "selected", source: raw.source, selector: "main > h1" });
  });

  it("returns a clear text message when nothing is selected", async () => {
    const page = new FakePage({ evalResults: { [SELECTION_PROBE]: null } });
    const result = await getSelectionTool({ page });
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.status).toBe("none");
    expect(payload.message).toMatch(/click an element/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/tools/get-selection.test.ts`
Expected: FAIL — `Cannot find module './get-selection.js'`.

- [ ] **Step 4: Write minimal implementation**

`packages/core/src/tools/get-selection.ts`:
```ts
import { readSelection } from "../selection/read-selection.js";
import type { ToolDeps, ToolResult } from "./deps.js";

export async function getSelectionTool(deps: ToolDeps): Promise<ToolResult> {
  const selection = await readSelection(deps.page);
  return { content: [{ type: "text", text: JSON.stringify(selection, null, 2) }] };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/core/src/tools/get-selection.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/tools/deps.ts packages/core/src/tools/get-selection.ts packages/core/src/tools/get-selection.test.ts
git commit -m "feat(core): get_selection tool handler"
```

## Task 1.8: screenshot tool handler

**Files:**
- Create: `packages/core/src/tools/screenshot-tool.ts`
- Test: `packages/core/src/tools/screenshot-tool.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/src/tools/screenshot-tool.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { FakePage } from "../cdp/fake-page.js";
import { SELECTION_PROBE, type RawSelection } from "../cdp/selection-probe.js";
import { screenshotTool } from "./screenshot-tool.js";

describe("screenshotTool", () => {
  it("returns an image content for the viewport", async () => {
    const page = new FakePage({ viewportPng: Buffer.from("VP") });
    const result = await screenshotTool({ page }, { target: "viewport" });
    expect(result.content[0]).toEqual({
      type: "image",
      mimeType: "image/png",
      data: Buffer.from("VP").toString("base64"),
    });
  });

  it("captures the current selection's element", async () => {
    const raw: RawSelection = {
      source: null,
      selector: "main > h1",
      tagName: "H1",
      rect: { x: 0, y: 0, width: 1, height: 1 },
    };
    const page = new FakePage({
      evalResults: { [SELECTION_PROBE]: raw },
      elementPng: { "main > h1": Buffer.from("SEL") },
    });
    const result = await screenshotTool({ page }, { target: "selection" });
    expect((result.content[0] as { data: string }).data).toBe(Buffer.from("SEL").toString("base64"));
  });

  it("returns an error result when selection screenshot has no selection", async () => {
    const page = new FakePage({ evalResults: { [SELECTION_PROBE]: null } });
    const result = await screenshotTool({ page }, { target: "selection" });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toMatch(/no element/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/tools/screenshot-tool.test.ts`
Expected: FAIL — `Cannot find module './screenshot-tool.js'`.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/tools/screenshot-tool.ts`:
```ts
import { capture } from "../screenshot/capture.js";
import { readSelection } from "../selection/read-selection.js";
import type { ScreenshotTarget } from "../types.js";
import type { ToolDeps, ToolResult } from "./deps.js";

export interface ScreenshotArgs {
  target: "viewport" | "selection" | string;
}

function parseTarget(arg: ScreenshotArgs): ScreenshotTarget {
  if (arg.target === "viewport") return { kind: "viewport" };
  if (arg.target === "selection") return { kind: "selection" };
  return { kind: "selector", selector: arg.target };
}

export async function screenshotTool(deps: ToolDeps, args: ScreenshotArgs): Promise<ToolResult> {
  const target = parseTarget(args);
  const img = await capture(deps.page, target, async () => {
    const sel = await readSelection(deps.page);
    return sel.status === "selected" ? sel.selector : null;
  });
  if (!img) {
    const reason =
      target.kind === "selection"
        ? "No element is selected. Click one in the frontman overlay, then ask again."
        : "No element matched the given selector.";
    return { isError: true, content: [{ type: "text", text: reason }] };
  }
  return { content: [{ type: "image", data: img.base64, mimeType: img.mimeType }] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core/src/tools/screenshot-tool.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tools/screenshot-tool.ts packages/core/src/tools/screenshot-tool.test.ts
git commit -m "feat(core): screenshot tool handler"
```

## Task 1.9: Register tools on an McpServer (in-process round-trip test)

**Files:**
- Create: `packages/core/src/server/register-tools.ts`
- Test: `packages/core/src/server/register-tools.test.ts`

- [ ] **Step 1: Write the failing test (in-memory client ↔ server)**

`packages/core/src/server/register-tools.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { FakePage } from "../cdp/fake-page.js";
import { SELECTION_PROBE, type RawSelection } from "../cdp/selection-probe.js";
import { registerTools } from "./register-tools.js";

async function connectedClient(page: FakePage) {
  const server = new McpServer({ name: "pinpoint", version: "0.0.0" });
  registerTools(server, { page });
  const client = new Client({ name: "test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("registerTools", () => {
  it("lists get_selection and screenshot", async () => {
    const client = await connectedClient(new FakePage());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["get_selection", "screenshot"]);
  });

  it("calls get_selection and returns selection JSON", async () => {
    const raw: RawSelection = {
      source: { file: "app/page.tsx", line: 1, column: 1, component: "Page" },
      selector: "h1",
      tagName: "H1",
      rect: { x: 0, y: 0, width: 1, height: 1 },
    };
    const client = await connectedClient(new FakePage({ evalResults: { [SELECTION_PROBE]: raw } }));
    const res = await client.callTool({ name: "get_selection", arguments: {} });
    const text = (res.content as Array<{ type: string; text: string }>)[0].text;
    expect(JSON.parse(text)).toMatchObject({ status: "selected", selector: "h1" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/server/register-tools.test.ts`
Expected: FAIL — `Cannot find module './register-tools.js'`.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/server/register-tools.ts`:
```ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolDeps } from "../tools/deps.js";
import { getSelectionTool } from "../tools/get-selection.js";
import { screenshotTool } from "../tools/screenshot-tool.js";

export function registerTools(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "get_selection",
    {
      description:
        "Return the element currently selected in the frontman overlay: its source file/line/component, CSS selector, tag, and bounding rect. Returns status 'none' if nothing is selected.",
      inputSchema: {},
    },
    async () => {
      const result = await getSelectionTool(deps);
      return result as never;
    },
  );

  server.registerTool(
    "screenshot",
    {
      description:
        "Capture a PNG screenshot. target='viewport' for the page, 'selection' for the currently-selected element, or any CSS selector string.",
      inputSchema: { target: z.string().default("viewport") },
    },
    async (args: { target?: string }) => {
      const result = await screenshotTool(deps, { target: args.target ?? "viewport" });
      return result as never;
    },
  );
}
```

> If the installed `@modelcontextprotocol/sdk` exposes `server.tool(...)` instead of `registerTool`, use that signature; the test pins the observable behavior (tool names + call result), so adapt the registration call to whatever the SDK version provides until the test passes.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core/src/server/register-tools.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/server/register-tools.ts packages/core/src/server/register-tools.test.ts
git commit -m "feat(core): register get_selection + screenshot on McpServer"
```

## Task 1.10: Playwright CDP connector + page adapter

**Files:**
- Create: `packages/core/src/cdp/playwright-page.ts`, `packages/core/src/cdp/connector.ts`

> No unit test: this is thin I/O glue over Playwright, exercised by the Task 1.14 integration test. Keep it minimal.

- [ ] **Step 1: Write the Playwright→BridgePage adapter**

`packages/core/src/cdp/playwright-page.ts`:
```ts
import type { Page } from "playwright";
import type { BridgePage } from "./page.js";

export class PlaywrightPage implements BridgePage {
  constructor(private readonly page: Page) {}

  evaluate<T>(expression: string): Promise<T> {
    // Playwright evaluates a function; wrap the expression so it returns its value.
    return this.page.evaluate<T, string>(
      (expr) => {
        // eslint-disable-next-line no-eval
        return (0, eval)(expr) as T;
      },
      expression,
    );
  }

  async screenshotViewport(): Promise<Buffer> {
    return this.page.screenshot({ type: "png" });
  }

  async screenshotElement(selector: string): Promise<Buffer | null> {
    const locator = this.page.locator(selector).first();
    if ((await locator.count()) === 0) return null;
    return locator.screenshot({ type: "png" });
  }
}
```

- [ ] **Step 2: Write the connector**

`packages/core/src/cdp/connector.ts`:
```ts
import { chromium, type Browser, type Page } from "playwright";
import { PlaywrightPage } from "./playwright-page.js";

export interface ConnectOptions {
  /** CDP endpoint, e.g. http://localhost:9222 */
  cdpUrl: string;
  /** Dev app URL to attach to / open, e.g. http://localhost:3000 */
  appUrl: string;
}

export interface Connection {
  browser: Browser;
  page: PlaywrightPage;
  close(): Promise<void>;
}

export async function connect(opts: ConnectOptions): Promise<Connection> {
  const browser = await chromium.connectOverCDP(opts.cdpUrl);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const existing: Page | undefined = context
    .pages()
    .find((p) => p.url().startsWith(opts.appUrl));
  const page = existing ?? (await context.newPage());
  if (!existing) await page.goto(opts.appUrl);
  return {
    browser,
    page: new PlaywrightPage(page),
    close: async () => {
      await browser.close();
    },
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/cdp/playwright-page.ts packages/core/src/cdp/connector.ts
git commit -m "feat(core): Playwright CDP connector + BridgePage adapter"
```

## Task 1.11: Config parsing

**Files:**
- Create: `packages/core/src/config.ts`
- Test: `packages/core/src/config.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/src/config.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseConfig } from "./config.js";

describe("parseConfig", () => {
  it("applies defaults", () => {
    const cfg = parseConfig({});
    expect(cfg).toEqual({
      mcpPort: 7331,
      cdpUrl: "http://localhost:9222",
      appUrl: "http://localhost:3000",
      frontmanBaseUrl: "http://localhost:3000",
    });
  });

  it("reads overrides and defaults frontmanBaseUrl to appUrl", () => {
    const cfg = parseConfig({
      PIN_MCP_PORT: "9000",
      PIN_CDP_URL: "http://localhost:9333",
      PIN_APP_URL: "http://localhost:4321",
    });
    expect(cfg.mcpPort).toBe(9000);
    expect(cfg.appUrl).toBe("http://localhost:4321");
    expect(cfg.frontmanBaseUrl).toBe("http://localhost:4321");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/config.test.ts`
Expected: FAIL — `Cannot find module './config.js'`.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/config.ts`:
```ts
export interface BridgeConfig {
  mcpPort: number;
  cdpUrl: string;
  appUrl: string;
  frontmanBaseUrl: string;
}

export function parseConfig(env: Record<string, string | undefined>): BridgeConfig {
  const appUrl = env.PIN_APP_URL ?? "http://localhost:3000";
  return {
    mcpPort: env.PIN_MCP_PORT ? Number(env.PIN_MCP_PORT) : 7331,
    cdpUrl: env.PIN_CDP_URL ?? "http://localhost:9222",
    appUrl,
    frontmanBaseUrl: env.PIN_FRONTMAN_BASE_URL ?? appUrl,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core/src/config.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config.ts packages/core/src/config.test.ts
git commit -m "feat(core): bridge config parsing with env overrides"
```

## Task 1.12: SSE server + CLI entrypoint

**Files:**
- Create: `packages/core/src/server/sse-server.ts`, `packages/core/src/cli.ts`

> No unit test: I/O glue, verified end-to-end by Task 1.14.

- [ ] **Step 1: Write the SSE server**

`packages/core/src/server/sse-server.ts`:
```ts
import { createServer, type Server } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { ToolDeps } from "../tools/deps.js";
import { registerTools } from "./register-tools.js";

export function startSseServer(port: number, deps: ToolDeps): Server {
  const mcp = new McpServer({ name: "pinpoint", version: "0.0.0" });
  registerTools(mcp, deps);

  const transports = new Map<string, SSEServerTransport>();

  const http = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/sse") {
      const transport = new SSEServerTransport("/messages", res);
      transports.set(transport.sessionId, transport);
      res.on("close", () => transports.delete(transport.sessionId));
      await mcp.connect(transport);
      return;
    }
    if (req.method === "POST" && req.url?.startsWith("/messages")) {
      const sessionId = new URL(req.url, "http://localhost").searchParams.get("sessionId") ?? "";
      const transport = transports.get(sessionId);
      if (!transport) {
        res.writeHead(400).end("unknown sessionId");
        return;
      }
      await transport.handlePostMessage(req, res);
      return;
    }
    res.writeHead(404).end("not found");
  });

  http.listen(port);
  return http;
}
```

> If the installed SDK version's `SSEServerTransport` constructor or `handlePostMessage` signature differs, adapt to it; the contract verified in Task 1.14 is "an MCP client connects over SSE and successfully calls the tools."

- [ ] **Step 2: Write the CLI**

`packages/core/src/cli.ts`:
```ts
#!/usr/bin/env node
import { parseConfig } from "./config.js";
import { connect } from "./cdp/connector.js";
import { startSseServer } from "./server/sse-server.js";

async function main() {
  const cfg = parseConfig(process.env);
  let connection;
  try {
    connection = await connect({ cdpUrl: cfg.cdpUrl, appUrl: cfg.appUrl });
  } catch (err) {
    console.error(
      `Could not connect to Chrome at ${cfg.cdpUrl}. Launch Chrome with:\n` +
        `  google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/ff-chrome ${cfg.appUrl}\n` +
        `Original error: ${(err as Error).message}`,
    );
    process.exit(1);
  }
  startSseServer(cfg.mcpPort, { page: connection.page });
  console.error(`pinpoint MCP server (SSE) on http://localhost:${cfg.mcpPort}/sse`);
  process.on("SIGINT", async () => {
    await connection.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Build and smoke-check the binary**

Run:
```bash
pnpm --filter @pinpoint/core build
node packages/core/dist/cli.js & sleep 1; kill %1 2>/dev/null || true
```
Expected: it prints the Chrome-connection error (no Chrome on 9222 yet) and exits 1 — confirming the CLI wires up and the error guidance fires.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/server/sse-server.ts packages/core/src/cli.ts
git commit -m "feat(core): SSE MCP server + CLI entrypoint"
```

## Task 1.13: Claude Code wiring (.mcp.json)

**Files:**
- Create: `.mcp.json`

- [ ] **Step 1: Write the MCP client config**

`.mcp.json`:
```json
{
  "mcpServers": {
    "pinpoint": {
      "type": "sse",
      "url": "http://localhost:7331/sse"
    }
  }
}
```

- [ ] **Step 2: Document the allowedTools scoping**

Add a short note to `README` later (Phase 4), but record now in the commit body: Claude Code is granted `mcp__pinpoint__get_selection` and `mcp__pinpoint__screenshot`.

- [ ] **Step 3: Commit**

```bash
git add .mcp.json
git commit -m "feat: wire Claude Code to the pinpoint SSE MCP server"
```

## Task 1.14: End-to-end integration test (the loop)

**Files:**
- Create: `packages/core/integration/loop.integration.test.ts`
- Create: `packages/core/vitest.integration.config.ts`

> This test requires a running dev app + a Chrome with `--remote-debugging-port=9222`. It is excluded from the default `vitest run` (Task 1.1 excludes `*.integration.test.ts`) and run explicitly.

- [ ] **Step 1: Write the integration config**

`packages/core/vitest.integration.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["integration/**/*.integration.test.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
```

- [ ] **Step 2: Write the integration test**

`packages/core/integration/loop.integration.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { connect, type Connection } from "../src/cdp/connector.js";
import { getSelectionTool } from "../src/tools/get-selection.js";
import { screenshotTool } from "../src/tools/screenshot-tool.js";

const APP_URL = process.env.PIN_APP_URL ?? "http://localhost:3000";
const CDP_URL = process.env.PIN_CDP_URL ?? "http://localhost:9222";

let connection: Connection;

beforeAll(async () => {
  connection = await connect({ cdpUrl: CDP_URL, appUrl: APP_URL });
  // Programmatically select a known element so the test is deterministic:
  // perform the same selection the overlay does, on a stable element.
  await connection.page.evaluate<void>(
    // This expression must trigger frontman's selection on a known element.
    // Fill from Phase 0 findings (the inverse of SELECTION_PROBE: how to SET selection).
    `void 0`,
  );
});

afterAll(async () => {
  await connection?.close();
});

describe("pinpoint loop (integration)", () => {
  it("get_selection returns a real source file+line for the selected element", async () => {
    const result = await getSelectionTool({ page: connection.page });
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.status).toBe("selected");
    expect(payload.source?.file).toMatch(/\.(tsx?|jsx?)$/);
    expect(typeof payload.source?.line).toBe("number");
  });

  it("screenshot('selection') returns PNG bytes", async () => {
    const result = await screenshotTool({ page: connection.page }, { target: "selection" });
    const img = result.content[0] as { type: string; data: string };
    expect(img.type).toBe("image");
    expect(Buffer.from(img.data, "base64").length).toBeGreaterThan(100);
  });
});
```

> The `beforeAll` selection-setting expression depends on Phase 0 Task 0.3: it is the *write* counterpart to `SELECTION_PROBE`. If frontman has no programmatic select API, the test instead documents a manual step ("select an element, then run") and asserts against whatever is selected — but prefer the programmatic path for CI.

- [ ] **Step 3: Run the integration test (with app + Chrome up)**

Run, in order:
```bash
pnpm --dir examples/nextjs dev &                 # terminal A (dev app, Elixir off)
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/ff-chrome http://localhost:3000 &
pnpm --filter @pinpoint/core exec vitest run --config vitest.integration.config.ts
```
Expected: PASS (2 tests) — `get_selection` yields a real `.tsx` file+line; `screenshot` yields PNG bytes.

- [ ] **Step 4: Commit**

```bash
git add packages/core/integration/loop.integration.test.ts packages/core/vitest.integration.config.ts
git commit -m "test(core): end-to-end loop integration test (get_selection + screenshot)"
```

## Task 1.15: Manual loop verification + run notes

**Files:**
- Create: `docs/superpowers/notes/phase1-manual-loop.md`

- [ ] **Step 1: Run the full human loop**

With the dev app (Elixir off) + Chrome (debug port) up, start the bridge:
```bash
pnpm --filter @pinpoint/core build && node packages/core/dist/cli.js
```
In a Claude Code session (this repo, `.mcp.json` picked up), click an element in the overlay, then ask Claude to "change the selected element's text/spacing." Confirm Claude calls `get_selection`, opens the file with its native tools, edits it, and the dev app HMR-reloads with the change.

- [ ] **Step 2: Record the run**

Write `docs/superpowers/notes/phase1-manual-loop.md`: the exact commands, what Claude called, the file it edited, and a before/after note. Capture any rough edges for Phase 2+.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/notes/phase1-manual-loop.md
git commit -m "docs(phase1): record the manual click-to-fix loop verification"
```

---

## Definition of Done (this plan)

- Phase 0 findings committed; confirmed the frontman Next.js middleware serves `/frontman/tools`, `/frontman/resolve-source-location`, and the overlay **with the Elixir server off**; `SELECTION_PROBE` confirmed and committed.
- `pnpm test` passes (all unit tests, Tasks 1.4–1.11).
- The integration test (Task 1.14) passes against the live app + Chrome.
- The manual loop (Task 1.15) works end-to-end, driven by Claude Code, Elixir off.

## Out of scope (future plans)

- Phase 2 (Vite/Astro reuse + optional faithful Phoenix path B), Phase 3 (Docker + file-tool proxying), Phase 4 (skill packaging + README/quickstarts). Each gets its own spec→plan cycle.

---

# Revised Phase 1 (post-Phase-0 amendment) — AUTHORITATIVE

Phase 0 outcome (see `docs/superpowers/notes/phase0-spike-findings.md`): the bridge is **CDP-only**
(no frontman middleware), it injects its **own overlay** with two gestures — **element pick** (→ React
fiber **identity**) and **region marquee** (→ arbitrary rect for partial screenshots) — and Claude
greps the repo by component name to locate source. The validated extractor already exists at
`packages/core/src/cdp/selection-probe.ts` (committed in Phase 0).

**Revised file structure (delta from the original):**
```
packages/core/src/
  types.ts                      # R1.2 — identity Selection, Region, ScreenshotTarget
  config.ts                     # R1.12 — mcpPort, cdpUrl, appUrl (no frontman)
  cdp/
    page.ts  fake-page.ts       # R1.3 — + evaluateOnNewDocument, screenshotClip
    selection-probe.ts          # DONE (Phase 0) — RawSelection, EXTRACT_SELECTION_FN, SELECTION_PROBE
    overlay-script.ts           # R1.4 — OVERLAY_SOURCE (element pick + region marquee), REGION_PROBE
    playwright-page.ts connector.ts  # R1.11 — connectOverCDP + inject overlay
  selection/
    read-selection.ts (+test)   # R1.5
    read-region.ts    (+test)   # R1.6
  screenshot/
    capture.ts        (+test)   # R1.7
  tools/
    deps.ts get-selection.ts (+test) screenshot-tool.ts (+test)   # R1.8–R1.9
  server/
    register-tools.ts (+test) sse-server.ts   # R1.10, R1.13
  cli.ts                        # R1.13
integration/loop.integration.test.ts   # R1.15
```
DROPPED from the MVP: `frontman/http-client.ts` (original Task 1.4) — source-map resolution isn't used.

## R1.1 — Workspace scaffolding
**Same as original Task 1.1** (pnpm workspace, `tsconfig.base.json`, `vitest.config.ts`,
`packages/core` with deps `@modelcontextprotocol/sdk`, `playwright`, `zod`). Additionally reconcile the
create-next-app leftovers noted in Phase 0 (root `pnpm-workspace.yaml` globs `examples/*`; remove the
example's default `CLAUDE.md`/`AGENTS.md` if noisy).

## R1.2 — Shared types
Replace `packages/core/src/types.ts` with the identity model:
```ts
export interface Rect { x: number; y: number; width: number; height: number; }

export interface SelectionFound {
  status: "selected";
  componentName: string | null;   // user component to grep for, e.g. "ClientTest"
  ancestry: string[];             // nearest-first user component chain (framework filtered)
  selector: string;               // CSS selector for the element
  tagName: string;
  text: string;                   // trimmed visible text (<=120 chars)
  rect: Rect;                     // viewport-relative box
}
export interface NoSelection { status: "none"; message: string; }
export type SelectionResult = SelectionFound | NoSelection;

export type ScreenshotTarget =
  | { kind: "viewport" }
  | { kind: "region" }            // the last drag-selected marquee rect
  | { kind: "selection" }         // the selected element's rect
  | { kind: "selector"; selector: string };

export interface CapturedImage { mimeType: "image/png"; base64: string; }
```
(`SelectionFound` mirrors `RawSelection` in `selection-probe.ts` plus `status`.)

## R1.3 — BridgePage interface + FakePage
`packages/core/src/cdp/page.ts`:
```ts
export interface BridgePage {
  /** Evaluate a JS expression string in the page; return its JSON-serializable value. */
  evaluate<T>(expression: string): Promise<T>;
  /** Inject source that runs on the current page AND on every future navigation. */
  injectBootstrap(source: string): Promise<void>;
  screenshotViewport(): Promise<Buffer>;
  /** PNG of an arbitrary viewport-relative rect (partial screenshot). */
  screenshotClip(rect: { x: number; y: number; width: number; height: number }): Promise<Buffer>;
  /** PNG of the first element matching selector, or null. */
  screenshotElement(selector: string): Promise<Buffer | null>;
}
```
`FakePage` implements it: `evaluate` returns from an `evalResults` map keyed by expression (with a `"*"`
fallback); `injectBootstrap` records the source; `screenshotViewport/Clip/Element` return canned Buffers
and record their args. (Same testing pattern as the original Task 1.3 fake.)

## R1.4 — Injected overlay script  ⭐ (the main new piece)
`packages/core/src/cdp/overlay-script.ts` exports `REGION_GLOBAL`, `REGION_PROBE`, and `OVERLAY_SOURCE`
(a string injected via `injectBootstrap`). It must: prepend `EXTRACT_SELECTION_FN` from
`selection-probe.ts`; render a tiny fixed toolbar (buttons **Pick** / **Region** / **Off**, very high
z-index); in **Pick** mode outline the hovered element and on click call
`window.__pinpointExtractSelection(el)` → store on `window.__pinpointSelection` and draw a
persistent outline + a badge showing `componentName`; in **Region** mode draw a click-drag marquee and
on mouseup store `{x,y,width,height}` (viewport/clientX-Y coords) on `window.__pinpointRegion`;
`Escape` exits. Keep it dependency-free vanilla JS. Concretely:
```ts
import { EXTRACT_SELECTION_FN, SELECTION_GLOBAL } from "./selection-probe.js";

export const REGION_GLOBAL = "__pinpointRegion";
export const REGION_PROBE = `window.${REGION_GLOBAL} ?? null`;

export const OVERLAY_SOURCE = `
${EXTRACT_SELECTION_FN}
(() => {
  if (window.__pinpointOverlayInstalled) return;
  window.__pinpointOverlayInstalled = true;
  var Z = 2147483640;
  var mode = null; // 'pick' | 'region' | null
  var hi = document.createElement('div');   // hover/selection highlight
  var sel = document.createElement('div');  // persistent selected outline
  var badge = document.createElement('div');
  var marquee = document.createElement('div');
  [hi, sel, marquee].forEach(function (d) { d.style.cssText = 'position:fixed;pointer-events:none;z-index:' + Z + ';border:2px solid #4f8cff;background:rgba(79,140,255,.12);display:none'; document.documentElement.appendChild(d); });
  sel.style.borderColor = '#22c55e'; sel.style.background = 'rgba(34,197,94,.10)';
  marquee.style.borderStyle = 'dashed';
  badge.style.cssText = 'position:fixed;z-index:' + (Z + 1) + ';background:#111;color:#fff;font:12px/1.4 system-ui;padding:2px 6px;border-radius:4px;display:none;pointer-events:none';
  document.documentElement.appendChild(badge);
  var box = function (d, r) { d.style.display = 'block'; d.style.left = r.x + 'px'; d.style.top = r.y + 'px'; d.style.width = r.width + 'px'; d.style.height = r.height + 'px'; };
  // toolbar
  var bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:' + (Z + 2) + ';display:flex;gap:6px;font:12px system-ui';
  var mk = function (label, m) { var b = document.createElement('button'); b.textContent = label; b.style.cssText = 'padding:4px 8px;border-radius:6px;border:1px solid #555;background:#1b1b1b;color:#fff;cursor:pointer'; b.onclick = function (e) { e.stopPropagation(); setMode(m); }; return b; };
  bar.appendChild(mk('Pick', 'pick')); bar.appendChild(mk('Region', 'region')); bar.appendChild(mk('Off', null));
  document.documentElement.appendChild(bar);
  function setMode(m) { mode = m; hi.style.display = 'none'; if (m !== 'region') marquee.style.display = 'none'; document.body.style.cursor = m ? 'crosshair' : ''; }
  document.addEventListener('mousemove', function (e) { if (mode !== 'pick') return; var el = document.elementFromPoint(e.clientX, e.clientY); if (!el || bar.contains(el)) return; var r = el.getBoundingClientRect(); box(hi, r); }, true);
  document.addEventListener('click', function (e) { if (mode !== 'pick') return; if (bar.contains(e.target)) return; e.preventDefault(); e.stopPropagation(); var el = document.elementFromPoint(e.clientX, e.clientY); if (!el) return; var data = window.__pinpointExtractSelection(el); window['${SELECTION_GLOBAL}'] = data; box(sel, data.rect); badge.style.display = 'block'; badge.style.left = data.rect.x + 'px'; badge.style.top = Math.max(0, data.rect.y - 20) + 'px'; badge.textContent = data.componentName || data.tagName; }, true);
  var drag = null;
  document.addEventListener('mousedown', function (e) { if (mode !== 'region') return; if (bar.contains(e.target)) return; e.preventDefault(); drag = { x: e.clientX, y: e.clientY }; }, true);
  document.addEventListener('mousemove', function (e) { if (mode !== 'region' || !drag) return; var r = { x: Math.min(drag.x, e.clientX), y: Math.min(drag.y, e.clientY), width: Math.abs(e.clientX - drag.x), height: Math.abs(e.clientY - drag.y) }; box(marquee, r); }, true);
  document.addEventListener('mouseup', function (e) { if (mode !== 'region' || !drag) return; var r = { x: Math.min(drag.x, e.clientX), y: Math.min(drag.y, e.clientY), width: Math.abs(e.clientX - drag.x), height: Math.abs(e.clientY - drag.y) }; drag = null; if (r.width > 4 && r.height > 4) window['${REGION_GLOBAL}'] = r; }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMode(null); }, true);
})();
`;
```
No unit test (DOM/in-page glue); verified by the integration test (R1.15). If it grows unwieldy, split
the extractor vs UI but keep one injected string.

## R1.5 — readSelection(page)
`selection/read-selection.ts`: `evaluate<RawSelection|null>(SELECTION_PROBE)`; null → `{status:"none",
message:"No element selected. Use the Pick tool in the overlay, then ask again."}`; else map fields →
`SelectionFound`. **TDD** with `FakePage({evalResults:{[SELECTION_PROBE]: raw}})` covering none + a
populated `RawSelection` (assert `componentName`, `ancestry`, `selector`, `text`, `rect` pass through).

## R1.6 — readRegion(page)
`selection/read-region.ts`: `evaluate<Rect|null>(REGION_PROBE)` → returns `Rect | null`. **TDD** with
FakePage (null and a populated rect).

## R1.7 — capture(page, target, deps)
`screenshot/capture.ts`: `viewport`→`screenshotViewport`; `selector`→`screenshotElement`;
`selection`→read selection, use its `rect` → `screenshotClip`; `region`→read region → `screenshotClip`
(null region or selection → return null). Inject `selectorOfSelection`/`rectOfSelection`/`rectOfRegion`
as small deps so it's testable with FakePage. **TDD**: viewport, explicit selector, selection-by-rect,
region-by-rect, and null cases.

## R1.8 — get_selection tool
`tools/get-selection.ts` (deps `{page}`): `readSelection` → `{content:[{type:"text",
text: JSON.stringify(selection)}]}`. **TDD**: selected returns identity JSON; none returns the message.

## R1.9 — screenshot tool
`tools/screenshot-tool.ts` (deps `{page}`), arg `target: "viewport"|"region"|"selection"|<selector>`:
parse → `capture` → image content `{type:"image", data, mimeType:"image/png"}`; null → `isError` with a
clear message ("no region captured — drag a region in the overlay first", etc.). **TDD** all branches.

## R1.10 — register tools on McpServer
**Same as original Task 1.9**, with `screenshot` input `{ target: z.string().default("viewport") }` and
descriptions updated: `screenshot` target accepts `viewport|region|selection|<css-selector>`;
`get_selection` returns component identity (no file). In-process client↔server test (list = 2 tools;
calling `get_selection` returns identity JSON).

## R1.11 — Playwright connector + injection
`cdp/playwright-page.ts`: implement `BridgePage` over Playwright — `evaluate(expr)` via
`page.evaluate((e)=> (0,eval)(e), expr)`; `injectBootstrap(src)` = `page.addInitScript({content:src})`
**and** `page.evaluate(src)` once for the already-loaded page; `screenshotViewport`=`page.screenshot()`;
`screenshotClip(rect)`=`page.screenshot({clip:rect})`; `screenshotElement(sel)` via `locator(sel).first()`
(null if count 0). `cdp/connector.ts`: `chromium.connectOverCDP(cdpUrl)`, pick/goto `appUrl`, wrap as
`PlaywrightPage`, then `injectBootstrap(OVERLAY_SOURCE)`. No unit test; covered by R1.15.

## R1.12 — Config
**Same as original Task 1.11** minus `frontmanBaseUrl`: `{ mcpPort=7331, cdpUrl="http://localhost:9222",
appUrl="http://localhost:3000" }` with `PIN_*` env overrides. **NOTE for this machine:** the example dev
server runs on **3100** (3000 is taken by Docker), so set `PIN_APP_URL=http://localhost:3100`.

## R1.13 — SSE server + CLI
**Same as original Tasks 1.12** (SSE MCP server + `cli.ts`), wiring `{page}` from the connector. CLI
prints the Chrome-connect hint on failure.

## R1.14 — .mcp.json
**Same as original Task 1.13**: SSE server at `http://localhost:7331/sse`, tools
`mcp__pinpoint__get_selection` and `mcp__pinpoint__screenshot`.

## R1.15 — Integration test (the loop)
Boot `examples/nextjs` (on 3100) + a Chrome with `--remote-debugging-port=9222`. Connect; inject overlay;
**programmatically** drive the gestures via `page.evaluate` (set `window.__pinpointSelection =
window.__pinpointExtractSelection(document.querySelector('#ct-heading'))` on `/clienttest`, and set
`window.__pinpointRegion = {x,y,width,height}`); assert `get_selection` returns
`componentName:"ClientTest"` and `screenshot({target:"region"})`/`{target:"selection"}` return PNG bytes
(>100). Excluded from default `vitest run`; run via the integration config.

## R1.16 — Manual loop verification
With app (3100, Elixir off) + Chrome (9222) + bridge running and `.mcp.json` picked up: in a Claude Code
session, use the overlay **Pick** on a client-component element, ask Claude to change it; confirm Claude
calls `get_selection`, greps the component name to the file, edits, and HMR reloads. Try **Region** +
`screenshot`. Record `docs/superpowers/notes/phase1-manual-loop.md`.

## Revised Definition of Done
`pnpm test` green (R1.2–R1.10); integration test green (R1.15); manual loop works on a **client
component** (identity → grep → edit → HMR), with region + element screenshots, Elixir/frontman not
running. Known limitation to document: server-component identity comes from `_debugStack` (best-effort);
when `componentName` is null, Claude falls back to visible text + selector + screenshot.
