# Driver Abstraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "how Pinpoint reaches the browser and captures pixels" a pluggable `Driver`, extract today's CDP path behind it with no behavior change, add per-driver health checks, and ship `/pinpoint:setup` that records a gitignored config + a persistent CDP profile.

**Architecture:** A `Driver` interface in `packages/core` owns browser acquisition + overlay injection + capture; the shared bridge (HTTP server, screenshot persistence, clipboard) depends on the interface, not on CDP. The CDP driver wraps today's `connect()` logic and exposes a `healthCheck()`. A gitignored `.pinpoint/config.json` (written by `/pinpoint:setup`) records the chosen driver + persistent profile location; `/pinpoint:start` reads it and falls back to today's defaults when absent.

**Tech Stack:** TypeScript (ESM, NodeNext), Node 22 built-ins (`http`, `child_process`, `fs`, `crypto`, global `WebSocket`/`fetch`), Vitest, Biome. Zero runtime deps.

**Spec:** `docs/superpowers/specs/2026-06-09-driver-abstraction-design.md`
**Board:** TASK-20. **Branch:** `task-20--driver-abstraction`.

**Drift guard (overlay is being refactored in parallel):** This plan treats the overlay as an opaque injected bundle — it depends only on the stable seams `OVERLAY_SOURCE`, `window.__pinpointConfig`, and `BridgePage`. Do **not** edit overlay internals. Keep the branch short-lived, rebase on `main` between phases, and merge P1 before P2 drags on.

**Test command convention:** run a single test file with
`pnpm --filter @pinpoint/core exec vitest run <path>`; the full gate is `pnpm typecheck && pnpm lint && pnpm test`.

---

## File Structure

**Phase 1 — driver seam + CDP extraction**
- Create `packages/core/src/driver/driver.ts` — `Driver`, `DriverSession`, `DriverConnectOptions`, `HealthResult` interfaces. No logic.
- Create `packages/core/src/driver/cdp-driver.ts` — `createCdpDriver(config, deps?)`: `healthCheck()` + `connect()` (today's `connector.ts` body, reading CDP config from the factory and `appUrl`/`bridgeUrl` from connect opts).
- Create `packages/core/src/driver/cdp-driver.test.ts` — unit tests over injected fakes.
- Delete `packages/core/src/cdp/connector.ts` (only `cli.ts` imports it).
- Modify `packages/core/src/cli.ts` — build a CDP driver, `healthCheck()` then `connect()`.
- Modify `packages/core/integration/vite.integration.test.ts:7` — update the stale `connect()` comment reference.

**Phase 2 — setup + config + persistent profile**
- Create `packages/core/src/config/profile-dir.ts` — `resolveProfileDir()`, `projectSlug()`, `ensureGitignored()`.
- Create `packages/core/src/config/profile-dir.test.ts`.
- Create `packages/core/src/config/pinpoint-config.ts` — `PinpointFileConfig`, `readPinpointConfig()`, `writePinpointConfig()`.
- Create `packages/core/src/config/pinpoint-config.test.ts`.
- Create `packages/core/src/setup/run-setup.ts` — `runSetup()` orchestrator (health check → resolve profile → write config → ensure gitignore).
- Create `packages/core/src/setup/run-setup.test.ts`.
- Modify `packages/core/src/cli.ts` — `setup` subcommand; merge file config; persistent profile; health gate.
- Modify `packages/core/src/server/bridge-server.ts` — `/health` advertises project identity.
- Create `packages/claude-code/commands/setup.md` — the `/pinpoint:setup` command.
- Modify `packages/claude-code/commands/start.md` — note `setup`/config + fallback.

---

## Phase 1 — Driver seam + CDP extraction

### Task 1: Define the `Driver` interface

**Files:**
- Create: `packages/core/src/driver/driver.ts`
- Test: `packages/core/src/driver/driver.test.ts`

- [ ] **Step 1: Write the failing test** (a type-level + value smoke test that the contract is importable and a conforming object satisfies it)

```ts
// packages/core/src/driver/driver.test.ts
import { describe, expect, it } from "vitest";
import type { Driver, DriverSession, HealthResult } from "./driver.js";

describe("Driver contract", () => {
  it("a conforming object satisfies the Driver interface", async () => {
    const session: DriverSession = {
      page: {} as DriverSession["page"],
      sessionId: "s1",
      close: async () => {},
    };
    const driver: Driver = {
      name: "fake",
      healthCheck: async (): Promise<HealthResult> => ({ ok: true }),
      connect: async () => session,
    };
    expect(driver.name).toBe("fake");
    expect(await driver.healthCheck()).toEqual({ ok: true });
    expect((await driver.connect({ appUrl: "http://x", bridgeUrl: "http://y" })).sessionId).toBe("s1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pinpoint/core exec vitest run src/driver/driver.test.ts`
Expected: FAIL — cannot find module `./driver.js`.

- [ ] **Step 3: Write the interface**

```ts
// packages/core/src/driver/driver.ts
import type { BridgePage } from "../cdp/page.js";

/** Per-connection options shared by every driver (driver-agnostic). */
export interface DriverConnectOptions {
  /** The dev-app URL to open/target. */
  appUrl: string;
  /** Base URL of this bridge's HTTP server, injected into the overlay so it can call back. */
  bridgeUrl: string;
}

/** A live driver connection: the page surface the bridge captures through, plus teardown. */
export interface DriverSession {
  /** The capture/inject surface (CDP today; an extension-backed surface later). */
  page: BridgePage;
  /** The session id injected into the overlay; used for SSE + /send. */
  sessionId: string;
  close(): Promise<void>;
}

/** Result of a driver availability probe. `remedy` is shown to the developer on failure. */
export type HealthResult = { ok: true } | { ok: false; reason: string; remedy: string };

/**
 * How Pinpoint (1) acquires a browser/page, (2) injects the overlay, and (3) captures pixels.
 * NOT how screenshots are persisted — that is shared bridge infrastructure.
 */
export interface Driver {
  readonly name: string;
  /** Attest the mechanism is available before any connect attempt. */
  healthCheck(): Promise<HealthResult>;
  /** Acquire the browser/page and inject the overlay. */
  connect(opts: DriverConnectOptions): Promise<DriverSession>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pinpoint/core exec vitest run src/driver/driver.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/driver/driver.ts packages/core/src/driver/driver.test.ts
git commit -m "feat(driver): add Driver interface (browser acquisition + inject + capture seam)"
```

---

### Task 2: CDP driver — `healthCheck()`

**Files:**
- Create: `packages/core/src/driver/cdp-driver.ts`
- Test: `packages/core/src/driver/cdp-driver.test.ts`

The CDP driver is available when a debug Chrome is already up **or** a Chrome binary can be located. `healthCheck()` must not throw and must return an actionable `remedy` on failure. Reuse `isCdpUp` and `findChrome` from `launch-chrome.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/driver/cdp-driver.test.ts
import { describe, expect, it } from "vitest";
import { createCdpDriver } from "./cdp-driver.js";

const cfg = { cdpUrl: "http://localhost:9222", profileDir: "/tmp/p" };

describe("createCdpDriver().healthCheck", () => {
  it("ok when a debug Chrome is already up", async () => {
    const d = createCdpDriver(cfg, { isCdpUp: async () => true, exists: () => false, env: {} });
    expect(await d.healthCheck()).toEqual({ ok: true });
  });

  it("ok when a Chrome binary is found", async () => {
    const d = createCdpDriver(cfg, {
      isCdpUp: async () => false,
      exists: (p) => p === "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      env: {},
    });
    expect(await d.healthCheck()).toEqual({ ok: true });
  });

  it("not ok with a remedy when nothing is found", async () => {
    const d = createCdpDriver(cfg, { isCdpUp: async () => false, exists: () => false, env: {} });
    const h = await d.healthCheck();
    expect(h.ok).toBe(false);
    if (!h.ok) {
      expect(h.reason).toMatch(/Chrome not found/i);
      expect(h.remedy).toMatch(/PIN_CHROME_PATH/);
    }
  });

  it("exposes its name", () => {
    expect(createCdpDriver(cfg).name).toBe("cdp");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pinpoint/core exec vitest run src/driver/cdp-driver.test.ts`
Expected: FAIL — cannot find module `./cdp-driver.js`.

- [ ] **Step 3: Write the driver factory + `healthCheck` (connect added in Task 3)**

```ts
// packages/core/src/driver/cdp-driver.ts
import { existsSync } from "node:fs";
import { findChrome, isCdpUp } from "../cdp/launch-chrome.js";
import type { Driver, DriverConnectOptions, DriverSession, HealthResult } from "./driver.js";

export interface CdpDriverConfig {
  cdpUrl: string;
  /** Path to the Chrome binary; auto-detected when omitted. */
  chromePath?: string;
  /** Chrome user-data-dir used when this driver launches Chrome. */
  profileDir: string;
}

export interface CdpDriverDeps {
  isCdpUp?: (baseUrl: string) => Promise<boolean>;
  exists?: (path: string) => boolean;
  env?: Record<string, string | undefined>;
}

export function createCdpDriver(config: CdpDriverConfig, deps: CdpDriverDeps = {}): Driver {
  const cdpUp = deps.isCdpUp ?? ((u: string) => isCdpUp(u));
  const exists = deps.exists ?? existsSync;
  const env = deps.env ?? process.env;

  return {
    name: "cdp",

    async healthCheck(): Promise<HealthResult> {
      if (await cdpUp(config.cdpUrl)) return { ok: true };
      try {
        const path = config.chromePath ?? findChrome({ env, exists });
        if (exists(path) || config.chromePath) return { ok: true };
        return { ok: false, reason: `Chrome not found at ${path}`, remedy: REMEDY };
      } catch (e) {
        return { ok: false, reason: (e as Error).message, remedy: REMEDY };
      }
    },

    async connect(_opts: DriverConnectOptions): Promise<DriverSession> {
      throw new Error("not implemented"); // Task 3
    },
  };
}

const REMEDY =
  "Install Google Chrome or Chromium, or set PIN_CHROME_PATH to the browser binary. " +
  "Alternatively, launch a debug Chrome on the CDP port yourself.";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pinpoint/core exec vitest run src/driver/cdp-driver.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/driver/cdp-driver.ts packages/core/src/driver/cdp-driver.test.ts
git commit -m "feat(driver): CDP driver healthCheck (Chrome found or debug port up)"
```

---

### Task 3: CDP driver — `connect()` (move today's `connector.ts` logic)

**Files:**
- Modify: `packages/core/src/driver/cdp-driver.ts`
- Modify: `packages/core/src/driver/cdp-driver.test.ts`
- Reference (source to move): `packages/core/src/cdp/connector.ts:31-69`

The body is today's `connect()` verbatim, but reads `cdpUrl`/`chromePath`/`profileDir` from `config` and `appUrl`/`bridgeUrl` from `opts`. Inject the launch/attach primitives for testability.

- [ ] **Step 1: Write the failing test** (connect wires attach→Page.enable→inject and returns a session; uses fakes so no real Chrome)

```ts
// append to packages/core/src/driver/cdp-driver.test.ts
import { vi } from "vitest";

describe("createCdpDriver().connect", () => {
  it("attaches to an up CDP endpoint, injects the overlay, returns a session", async () => {
    const injected: string[] = [];
    const fakePage = {
      injectBootstrap: async (src: string) => void injected.push(src),
    } as unknown as DriverSessionPage;
    const cdp = { send: vi.fn(async () => ({})), close: vi.fn() };

    const d = createCdpDriver(
      { cdpUrl: "http://localhost:9222", profileDir: "/tmp/p" },
      {
        isCdpUp: async () => true, // already up → no launch
        discoverPageTarget: async () => "ws://localhost:9222/devtools/page/AB",
        attach: async () => cdp,
        makePage: () => fakePage,
      },
    );

    const session = await d.connect({ appUrl: "http://localhost:5173", bridgeUrl: "http://localhost:7331" });
    expect(cdp.send).toHaveBeenCalledWith("Page.enable");
    expect(injected[0]).toContain("__pinpointConfig");
    expect(injected[0]).toContain("http://localhost:7331");
    expect(typeof session.sessionId).toBe("string");
    await session.close();
    expect(cdp.close).toHaveBeenCalled();
  });
});

// minimal structural type for the fake (kept local to the test)
type DriverSessionPage = import("../cdp/page.js").BridgePage;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pinpoint/core exec vitest run src/driver/cdp-driver.test.ts`
Expected: FAIL — `connect` throws "not implemented" / deps unused.

- [ ] **Step 3: Implement `connect` and extend `CdpDriverDeps`**

Replace the `CdpDriverDeps` interface and the `connect` stub in `cdp-driver.ts`:

```ts
// add imports at top
import { randomUUID } from "node:crypto";
import { CdpConnection } from "../cdp/cdp-connection.js";
import { CdpPage } from "../cdp/cdp-page.js";
import {
  discoverPageTarget,
  findChrome,
  isCdpUp,
  launchChrome,
  waitForCdp,
} from "../cdp/launch-chrome.js";
import { OVERLAY_SOURCE } from "../cdp/overlay-script.js";
import type { BridgePage } from "../cdp/page.js";

export interface CdpDriverDeps {
  isCdpUp?: (baseUrl: string) => Promise<boolean>;
  exists?: (path: string) => boolean;
  env?: Record<string, string | undefined>;
  // connect seams (default to the real CDP primitives)
  discoverPageTarget?: (baseUrl: string, appUrl: string) => Promise<string>;
  attach?: (wsUrl: string) => Promise<{ send: <T>(m: string, p?: object) => Promise<T>; close: () => void }>;
  makePage?: (cdp: CdpConnection) => BridgePage;
}
```

Then implement `connect` (replace the stub):

```ts
    async connect(opts: DriverConnectOptions): Promise<DriverSession> {
      const base = config.cdpUrl;
      let kill: (() => void) | undefined;

      // Attach to an already-running debug Chrome if present; otherwise launch one.
      if (!(await cdpUp(base))) {
        const chromePath = config.chromePath ?? findChrome({ env, exists });
        const port = Number(new URL(base).port || 9222);
        const child = launchChrome({ chromePath, port, profileDir: config.profileDir, appUrl: opts.appUrl });
        kill = () => child.kill();
        const launchFailed = new Promise<never>((_, reject) => {
          child.once("error", (e) =>
            reject(new Error(`Failed to launch Chrome (${chromePath}): ${(e as Error).message}`)),
          );
        });
        await Promise.race([waitForCdp(base), launchFailed]);
      }

      const discover = deps.discoverPageTarget ?? ((b: string, a: string) => discoverPageTarget(b, a));
      const attach = deps.attach ?? ((ws: string) => CdpConnection.attach(ws));
      const makePage = deps.makePage ?? ((c) => new CdpPage(c as CdpConnection));

      const wsUrl = await discover(base, opts.appUrl);
      const cdp = await attach(wsUrl);
      await cdp.send("Page.enable");
      const page = makePage(cdp as unknown as CdpConnection);

      const sessionId = randomUUID();
      const preamble = `window.__pinpointConfig = ${JSON.stringify({ bridgeUrl: opts.bridgeUrl, sessionId })};`;
      await page.injectBootstrap(`${preamble}\n${OVERLAY_SOURCE}`);

      return {
        page,
        sessionId,
        close: async () => {
          cdp.close();
          kill?.();
        },
      };
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pinpoint/core exec vitest run src/driver/cdp-driver.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/driver/cdp-driver.ts packages/core/src/driver/cdp-driver.test.ts
git commit -m "feat(driver): CDP driver connect() (launch/attach + inject behind the interface)"
```

---

### Task 4: Rewire `cli.ts`; delete `connector.ts`

**Files:**
- Modify: `packages/core/src/cli.ts:1-44`
- Delete: `packages/core/src/cdp/connector.ts`
- Modify: `packages/core/integration/vite.integration.test.ts:7`

- [ ] **Step 1: Delete the obsolete connector**

```bash
git rm packages/core/src/cdp/connector.ts
```

- [ ] **Step 2: Rewrite `cli.ts` `main()` to use the driver**

Replace `packages/core/src/cli.ts` lines 1-44 (imports through end of `main`) with:

```ts
#!/usr/bin/env node
import { tmpdir } from "node:os";
import { join } from "node:path";
import { systemClipboard } from "./clipboard/write.js";
import { parseConfig } from "./config.js";
import { createCdpDriver } from "./driver/cdp-driver.js";
import type { Driver, DriverSession } from "./driver/driver.js";
import { startBridgeServer } from "./server/bridge-server.js";
import { SessionRegistry } from "./server/sessions.js";

async function main() {
  const cfg = parseConfig(process.env as Record<string, string | undefined>);
  const bridgeUrl = `http://localhost:${cfg.port}`;

  const driver: Driver = createCdpDriver({
    cdpUrl: cfg.cdpUrl,
    chromePath: cfg.chromePath,
    profileDir: cfg.profileDir,
  });

  const health = await driver.healthCheck();
  if (!health.ok) {
    console.error(`pinpoint: ${driver.name} driver unavailable — ${health.reason}\n${health.remedy}`);
    process.exit(1);
  }

  let session: DriverSession;
  try {
    session = await driver.connect({ appUrl: cfg.appUrl, bridgeUrl });
  } catch (err) {
    console.error(
      `Could not connect to Chrome at ${cfg.cdpUrl}. Launch Chrome with:\n` +
        `  <chrome> --remote-debugging-port=9222 --user-data-dir=${cfg.profileDir} ${cfg.appUrl}\n` +
        `Original error: ${(err as Error).message}`,
    );
    process.exit(1);
  }

  startBridgeServer(cfg.port, {
    page: session.page,
    sessions: new SessionRegistry(),
    writeClipboard: systemClipboard,
    bridgeUrl,
    tmpRoot: join(tmpdir(), "pinpoint"),
    appUrl: cfg.appUrl,
    sessionId: session.sessionId,
  });
  console.error(`pinpoint bridge on ${bridgeUrl} · session ${session.sessionId}`);
  process.on("SIGINT", async () => {
    await session.close();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Fix the stale comment in the integration test**

In `packages/core/integration/vite.integration.test.ts:7`, change `injected by connect().` to `injected by the CDP driver's connect().`

- [ ] **Step 4: Run the full gate**

Run: `pnpm typecheck && pnpm lint && pnpm --filter @pinpoint/core test`
Expected: PASS — typecheck clean (no dangling `connector` import), unit tests green.

- [ ] **Step 5: Run the live integration loop to prove no behavior regression**

Run: `pnpm --filter @pinpoint/core exec vitest run --config vitest.integration.config.ts`
Expected: the Vite loop test passes — overlay injected, Send → expected clipboard JSON, PNGs on disk. (Requires a local Chrome; if the harness skips live tests, note it and rely on the unit coverage + a manual `examples/vite-react` run.)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/cli.ts packages/core/integration/vite.integration.test.ts
git commit -m "refactor(core): cli uses the CDP driver via the Driver interface; drop connector.ts"
```

> **Merge checkpoint:** P1 is behavior-preserving and self-contained. Rebase on `main` and merge `task-20--driver-abstraction` now (anti-drift), then continue P2 on a fresh branch off the updated `main` or the same branch re-based.

---

## Phase 2 — Setup + config + persistent profile

### Task 5: Profile-dir resolution + gitignore guard

**Files:**
- Create: `packages/core/src/config/profile-dir.ts`
- Test: `packages/core/src/config/profile-dir.test.ts`

`resolveProfileDir` returns the persistent profile path. Default `home` mode → `~/.pinpoint/profiles/<slug>`; opt-in `repo` mode → `<cwd>/.pinpoint/chrome`. `projectSlug` is `basename(cwd)-<8-hex sha1(cwd)>` (deterministic, collision-resistant — no `Math.random`). `ensureGitignored` adds an entry to `<cwd>/.gitignore` if missing (creating the file if needed).

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/config/profile-dir.test.ts
import { describe, expect, it, vi } from "vitest";
import { ensureGitignored, projectSlug, resolveProfileDir } from "./profile-dir.js";

describe("projectSlug", () => {
  it("is deterministic and includes the basename", () => {
    const a = projectSlug("/home/me/my-app");
    expect(a).toMatch(/^my-app-[0-9a-f]{8}$/);
    expect(projectSlug("/home/me/my-app")).toBe(a);
    expect(projectSlug("/elsewhere/my-app")).not.toBe(a);
  });
});

describe("resolveProfileDir", () => {
  it("home mode → ~/.pinpoint/profiles/<slug>", () => {
    const p = resolveProfileDir({ cwd: "/home/me/my-app", mode: "home", home: "/home/me" });
    expect(p).toBe(`/home/me/.pinpoint/profiles/${projectSlug("/home/me/my-app")}`);
  });
  it("repo mode → <cwd>/.pinpoint/chrome", () => {
    expect(resolveProfileDir({ cwd: "/home/me/my-app", mode: "repo", home: "/home/me" })).toBe(
      "/home/me/my-app/.pinpoint/chrome",
    );
  });
});

describe("ensureGitignored", () => {
  it("appends the entry when absent", () => {
    let written = "";
    ensureGitignored("/repo", ".pinpoint/", {
      readFile: () => "node_modules\n",
      writeFile: (_p, c) => void (written = c),
      exists: () => true,
    });
    expect(written).toContain("node_modules");
    expect(written).toContain(".pinpoint/");
  });
  it("is a no-op when already present", () => {
    const writeFile = vi.fn();
    ensureGitignored("/repo", ".pinpoint/", {
      readFile: () => "node_modules\n.pinpoint/\n",
      writeFile,
      exists: () => true,
    });
    expect(writeFile).not.toHaveBeenCalled();
  });
  it("creates .gitignore when missing", () => {
    let written = "";
    ensureGitignored("/repo", ".pinpoint/", {
      readFile: () => "",
      writeFile: (_p, c) => void (written = c),
      exists: () => false,
    });
    expect(written).toContain(".pinpoint/");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pinpoint/core exec vitest run src/config/profile-dir.test.ts`
Expected: FAIL — cannot find module `./profile-dir.js`.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/config/profile-dir.ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

export type ProfileMode = "home" | "repo";

/** Stable, collision-resistant per-project id: "<basename>-<8 hex of sha1(cwd)>". */
export function projectSlug(cwd: string): string {
  const hash = createHash("sha1").update(cwd).digest("hex").slice(0, 8);
  return `${basename(cwd)}-${hash}`;
}

export function resolveProfileDir(opts: { cwd: string; mode: ProfileMode; home: string }): string {
  return opts.mode === "repo"
    ? join(opts.cwd, ".pinpoint", "chrome")
    : join(opts.home, ".pinpoint", "profiles", projectSlug(opts.cwd));
}

export interface GitignoreDeps {
  readFile?: (path: string) => string;
  writeFile?: (path: string, content: string) => void;
  exists?: (path: string) => boolean;
}

/** Add `entry` to <cwd>/.gitignore if not already present (creating the file if needed). */
export function ensureGitignored(cwd: string, entry: string, deps: GitignoreDeps = {}): void {
  const path = join(cwd, ".gitignore");
  const exists = deps.exists ?? existsSync;
  const readFile = deps.readFile ?? ((p: string) => readFileSync(p, "utf8"));
  const writeFile = deps.writeFile ?? ((p: string, c: string) => writeFileSync(p, c));

  const current = exists(path) ? readFile(path) : "";
  const lines = current.split("\n").map((l) => l.trim());
  if (lines.includes(entry)) return;
  const next = current.length && !current.endsWith("\n") ? `${current}\n${entry}\n` : `${current}${entry}\n`;
  writeFile(path, next);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pinpoint/core exec vitest run src/config/profile-dir.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config/profile-dir.ts packages/core/src/config/profile-dir.test.ts
git commit -m "feat(config): persistent profile-dir resolution + .gitignore guard"
```

---

### Task 6: Read/write the gitignored `.pinpoint/config.json`

**Files:**
- Create: `packages/core/src/config/pinpoint-config.ts`
- Test: `packages/core/src/config/pinpoint-config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/config/pinpoint-config.test.ts
import { describe, expect, it } from "vitest";
import { CONFIG_RELPATH, readPinpointConfig, writePinpointConfig } from "./pinpoint-config.js";

describe("pinpoint-config", () => {
  it("CONFIG_RELPATH is the gitignored .pinpoint location", () => {
    expect(CONFIG_RELPATH).toBe(".pinpoint/config.json");
  });

  it("returns null when no config file exists", () => {
    expect(readPinpointConfig("/repo", { exists: () => false, readFile: () => "" })).toBeNull();
  });

  it("parses an existing config", () => {
    const cfg = readPinpointConfig("/repo", {
      exists: () => true,
      readFile: () => JSON.stringify({ driver: "cdp", profileDir: "/p", port: 7331 }),
    });
    expect(cfg).toEqual({ driver: "cdp", profileDir: "/p", port: 7331 });
  });

  it("returns null on malformed JSON instead of throwing", () => {
    expect(readPinpointConfig("/repo", { exists: () => true, readFile: () => "{not json" })).toBeNull();
  });

  it("writes pretty JSON to <cwd>/.pinpoint/config.json", () => {
    const writes: Array<[string, string]> = [];
    writePinpointConfig(
      "/repo",
      { driver: "cdp", profileDir: "/p" },
      { mkdir: () => {}, writeFile: (p, c) => void writes.push([p, c]) },
    );
    expect(writes[0][0]).toMatch(/\/repo\/\.pinpoint\/config\.json$/);
    expect(JSON.parse(writes[0][1])).toEqual({ driver: "cdp", profileDir: "/p" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pinpoint/core exec vitest run src/config/pinpoint-config.test.ts`
Expected: FAIL — cannot find module `./pinpoint-config.js`.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/config/pinpoint-config.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const CONFIG_RELPATH = ".pinpoint/config.json";

export interface PinpointFileConfig {
  driver?: "cdp";
  /** Persistent Chrome profile dir for the CDP driver. */
  profileDir?: string;
  port?: number;
}

export interface ReadDeps {
  exists?: (path: string) => boolean;
  readFile?: (path: string) => string;
}

export function readPinpointConfig(cwd: string, deps: ReadDeps = {}): PinpointFileConfig | null {
  const exists = deps.exists ?? existsSync;
  const readFile = deps.readFile ?? ((p: string) => readFileSync(p, "utf8"));
  const path = join(cwd, CONFIG_RELPATH);
  if (!exists(path)) return null;
  try {
    return JSON.parse(readFile(path)) as PinpointFileConfig;
  } catch {
    return null;
  }
}

export interface WriteDeps {
  mkdir?: (dir: string) => void;
  writeFile?: (path: string, content: string) => void;
}

export function writePinpointConfig(cwd: string, cfg: PinpointFileConfig, deps: WriteDeps = {}): void {
  const mkdir = deps.mkdir ?? ((d: string) => void mkdirSync(d, { recursive: true }));
  const writeFile = deps.writeFile ?? ((p: string, c: string) => writeFileSync(p, c));
  const path = join(cwd, CONFIG_RELPATH);
  mkdir(dirname(path));
  writeFile(path, `${JSON.stringify(cfg, null, 2)}\n`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pinpoint/core exec vitest run src/config/pinpoint-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config/pinpoint-config.ts packages/core/src/config/pinpoint-config.test.ts
git commit -m "feat(config): read/write gitignored .pinpoint/config.json"
```

---

### Task 7: `runSetup()` orchestrator

**Files:**
- Create: `packages/core/src/setup/run-setup.ts`
- Test: `packages/core/src/setup/run-setup.test.ts`

`runSetup` ties the pieces together: run the chosen driver's health check, resolve the profile dir, write the config, and guarantee `.pinpoint/` is gitignored. It takes the driver as a dependency (so tests pass a fake) and returns a summary.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/setup/run-setup.test.ts
import { describe, expect, it, vi } from "vitest";
import type { Driver } from "../driver/driver.js";
import { runSetup } from "./run-setup.js";

const okDriver = (): Driver => ({
  name: "cdp",
  healthCheck: async () => ({ ok: true }),
  connect: async () => {
    throw new Error("unused");
  },
});

describe("runSetup", () => {
  it("writes config + gitignore on a healthy driver (home mode)", async () => {
    const writeConfig = vi.fn();
    const ensureGitignored = vi.fn();
    const res = await runSetup({
      cwd: "/repo",
      home: "/home/me",
      profileMode: "home",
      driver: okDriver(),
      writeConfig,
      ensureGitignored,
    });

    expect(res.ok).toBe(true);
    expect(res.profileDir).toBe("/home/me/.pinpoint/profiles/repo-".length > 0 ? res.profileDir : "");
    expect(writeConfig).toHaveBeenCalledWith(
      "/repo",
      expect.objectContaining({ driver: "cdp", profileDir: res.profileDir }),
    );
    expect(ensureGitignored).toHaveBeenCalledWith("/repo", ".pinpoint/");
  });

  it("repo mode still gitignores .pinpoint/ (footgun guard)", async () => {
    const ensureGitignored = vi.fn();
    const res = await runSetup({
      cwd: "/repo",
      home: "/home/me",
      profileMode: "repo",
      driver: okDriver(),
      writeConfig: vi.fn(),
      ensureGitignored,
    });
    expect(res.profileDir).toBe("/repo/.pinpoint/chrome");
    expect(ensureGitignored).toHaveBeenCalledWith("/repo", ".pinpoint/");
  });

  it("fails without writing anything when the driver is unhealthy", async () => {
    const writeConfig = vi.fn();
    const driver: Driver = {
      name: "cdp",
      healthCheck: async () => ({ ok: false, reason: "no chrome", remedy: "install it" }),
      connect: async () => {
        throw new Error("unused");
      },
    };
    const res = await runSetup({
      cwd: "/repo",
      home: "/home/me",
      profileMode: "home",
      driver,
      writeConfig,
      ensureGitignored: vi.fn(),
    });
    expect(res.ok).toBe(false);
    expect(res.remedy).toBe("install it");
    expect(writeConfig).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pinpoint/core exec vitest run src/setup/run-setup.test.ts`
Expected: FAIL — cannot find module `./run-setup.js`.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/setup/run-setup.ts
import {
  ensureGitignored as ensureGitignoredImpl,
  type ProfileMode,
  resolveProfileDir,
} from "../config/profile-dir.js";
import {
  type PinpointFileConfig,
  writePinpointConfig as writeConfigImpl,
} from "../config/pinpoint-config.js";
import type { Driver } from "../driver/driver.js";

export interface RunSetupOptions {
  cwd: string;
  home: string;
  profileMode: ProfileMode;
  driver: Driver;
  /** seams (default to the real impls) */
  writeConfig?: (cwd: string, cfg: PinpointFileConfig) => void;
  ensureGitignored?: (cwd: string, entry: string) => void;
}

export type RunSetupResult =
  | { ok: true; driver: string; profileDir: string; configPath: string }
  | { ok: false; reason: string; remedy: string };

export async function runSetup(opts: RunSetupOptions): Promise<RunSetupResult> {
  const writeConfig = opts.writeConfig ?? writeConfigImpl;
  const ensureGitignored = opts.ensureGitignored ?? ensureGitignoredImpl;

  const health = await opts.driver.healthCheck();
  if (!health.ok) return { ok: false, reason: health.reason, remedy: health.remedy };

  const profileDir = resolveProfileDir({ cwd: opts.cwd, mode: opts.profileMode, home: opts.home });

  // Always gitignore .pinpoint/ — it holds the config and (in repo mode) a credential-bearing profile.
  ensureGitignored(opts.cwd, ".pinpoint/");
  writeConfig(opts.cwd, { driver: "cdp", profileDir });

  return { ok: true, driver: opts.driver.name, profileDir, configPath: `${opts.cwd}/.pinpoint/config.json` };
}
```

- [ ] **Step 4: Adjust the first test's loose assertion**

In `run-setup.test.ts`, replace the awkward `res.profileDir` assertion with an exact check:

```ts
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.profileDir).toMatch(/^\/home\/me\/\.pinpoint\/profiles\/repo-[0-9a-f]{8}$/);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @pinpoint/core exec vitest run src/setup/run-setup.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/setup/run-setup.ts packages/core/src/setup/run-setup.test.ts
git commit -m "feat(setup): runSetup orchestrator (health → profile → config + gitignore)"
```

---

### Task 8: CLI `setup` subcommand + merge file config + persistent profile + `/health` identity

**Files:**
- Modify: `packages/core/src/cli.ts`
- Modify: `packages/core/src/server/bridge-server.ts:11-22,45-50`
- Test: `packages/core/src/server/bridge-server.test.ts` (extend if present; else assert via the existing route tests)

**8a — `/health` advertises project identity.**

- [ ] **Step 1: Extend `BridgeServerDeps` and the `/health` payload**

In `bridge-server.ts`, add two fields to `BridgeServerDeps` (after `sessionId`):

```ts
  /** Human-facing project name (basename of cwd) — for multi-session disambiguation. */
  projectName: string;
  /** Absolute project dir — for multi-session disambiguation. */
  projectDir: string;
```

Change the `/health` responder (lines ~45-50) to:

```ts
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(
        JSON.stringify({
          ok: true,
          appUrl: deps.appUrl,
          sessionId: deps.sessionId,
          project: { name: deps.projectName, dir: deps.projectDir },
        }),
      );
      return;
    }
```

- [ ] **Step 2: Write/extend a test asserting `/health` includes `project`**

```ts
// packages/core/src/server/bridge-server.test.ts (add a case; mirror existing test setup)
it("/health advertises project identity", async () => {
  // start the server with projectName/projectDir in deps (see existing harness),
  // then:
  const r = await fetch(`http://127.0.0.1:${port}/health`);
  const body = await r.json();
  expect(body.project).toEqual({ name: "my-app", dir: "/abs/my-app" });
});
```

Run: `pnpm --filter @pinpoint/core exec vitest run src/server/bridge-server.test.ts`
Expected: PASS after deps include `projectName`/`projectDir`. (If no unit test file exists, instead add the assertion to `integration/bridge-routes.integration.test.ts`.)

**8b — CLI merges file config, uses a persistent profile, and gains a `setup` subcommand.**

- [ ] **Step 3: Rewrite `cli.ts` to branch on argv and merge config**

Replace `cli.ts` with:

```ts
#!/usr/bin/env node
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { systemClipboard } from "./clipboard/write.js";
import { parseConfig } from "./config.js";
import { readPinpointConfig } from "./config/pinpoint-config.js";
import { resolveProfileDir } from "./config/profile-dir.js";
import { createCdpDriver } from "./driver/cdp-driver.js";
import type { Driver, DriverSession } from "./driver/driver.js";
import { startBridgeServer } from "./server/bridge-server.js";
import { SessionRegistry } from "./server/sessions.js";
import { runSetup } from "./setup/run-setup.js";

function buildDriver(cfg: ReturnType<typeof parseConfig>, profileDir: string): Driver {
  return createCdpDriver({ cdpUrl: cfg.cdpUrl, chromePath: cfg.chromePath, profileDir });
}

async function setup(profileMode: "home" | "repo") {
  const cwd = process.cwd();
  const cfg = parseConfig(process.env as Record<string, string | undefined>);
  const profileDir = resolveProfileDir({ cwd, home: homedir(), mode: profileMode });
  const res = await runSetup({ cwd, home: homedir(), profileMode, driver: buildDriver(cfg, profileDir) });
  if (!res.ok) {
    console.error(`pinpoint setup: ${res.reason}\n${res.remedy}`);
    process.exit(1);
  }
  console.error(`pinpoint setup: driver=${res.driver} profile=${res.profileDir}\nwrote ${res.configPath}`);
}

async function start() {
  const cwd = process.cwd();
  const env = parseConfig(process.env as Record<string, string | undefined>);
  const file = readPinpointConfig(cwd) ?? {};
  // Precedence: explicit env override > config file > built-in default.
  const cfg = {
    ...env,
    port: process.env.PIN_PORT ? env.port : (file.port ?? env.port),
    profileDir: process.env.PIN_CHROME_PROFILE ? env.profileDir : (file.profileDir ?? env.profileDir),
  };
  const bridgeUrl = `http://localhost:${cfg.port}`;
  const driver = buildDriver(cfg, cfg.profileDir);

  const health = await driver.healthCheck();
  if (!health.ok) {
    console.error(`pinpoint: ${driver.name} driver unavailable — ${health.reason}\n${health.remedy}`);
    process.exit(1);
  }

  let session: DriverSession;
  try {
    session = await driver.connect({ appUrl: cfg.appUrl, bridgeUrl });
  } catch (err) {
    console.error(
      `Could not connect to Chrome at ${cfg.cdpUrl}. Launch Chrome with:\n` +
        `  <chrome> --remote-debugging-port=9222 --user-data-dir=${cfg.profileDir} ${cfg.appUrl}\n` +
        `Original error: ${(err as Error).message}`,
    );
    process.exit(1);
  }

  startBridgeServer(cfg.port, {
    page: session.page,
    sessions: new SessionRegistry(),
    writeClipboard: systemClipboard,
    bridgeUrl,
    tmpRoot: join(tmpdir(), "pinpoint"),
    appUrl: cfg.appUrl,
    sessionId: session.sessionId,
    projectName: basename(cwd),
    projectDir: cwd,
  });
  console.error(`pinpoint bridge on ${bridgeUrl} · session ${session.sessionId}`);
  process.on("SIGINT", async () => {
    await session.close();
    process.exit(0);
  });
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "setup") {
    const mode = rest.includes("--profile-mode")
      ? (rest[rest.indexOf("--profile-mode") + 1] as "home" | "repo")
      : "home";
    await setup(mode === "repo" ? "repo" : "home");
    return;
  }
  await start();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 4: Run the gate**

Run: `pnpm typecheck && pnpm lint && pnpm --filter @pinpoint/core test`
Expected: PASS. Manually sanity-check: `node packages/core/dist/cli.js setup --profile-mode home` (after `pnpm --filter @pinpoint/core build`) prints the profile path and writes `.pinpoint/config.json` + a `.gitignore` entry.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/cli.ts packages/core/src/server/bridge-server.ts packages/core/src/server/bridge-server.test.ts
git commit -m "feat(core): pinpoint setup subcommand; /start merges config + persistent profile; /health advertises project"
```

---

### Task 9: `/pinpoint:setup` command + `/start` doc touch + rebuild bundle

**Files:**
- Create: `packages/claude-code/commands/setup.md`
- Modify: `packages/claude-code/commands/start.md:56-60,72-76`

- [ ] **Step 1: Write the `/pinpoint:setup` command**

```markdown
<!-- packages/claude-code/commands/setup.md -->
---
description: One-time per-project setup — pick how Pinpoint reaches the browser, verify it's available, and record a gitignored config + persistent profile.
---

# Set up pinpoint

Run this once per project. It selects the browser **driver**, verifies the mechanism is available
(a health check), and writes a gitignored `.pinpoint/config.json` plus a persistent Chrome profile
so logins survive across runs. `/pinpoint:start` reads this; without it, start falls back to
defaults (CDP driver, throwaway profile).

## Steps

1. **Ensure the toolchain is on PATH** (same as `/pinpoint:start`): prefer launching through the
   login shell `"${SHELL:-bash}" -lic '<command>'`. Exit 127 = PATH problem.

2. **Choose where the persistent Chrome profile lives.** Ask the user:
   - **home** (default) — `~/.pinpoint/profiles/<project>`: zero repo footprint, nothing to commit.
   - **repo** — `<project>/.pinpoint/chrome`: self-contained; the profile holds cookies/tokens, so
     setup will ensure `.pinpoint/` is gitignored (never commit it).

3. **Run setup** through the login shell with the chosen mode:
   ```bash
   "${SHELL:-bash}" -lic 'pinpoint setup --profile-mode home'   # or: --profile-mode repo
   ```
   It runs the CDP driver's health check first. On failure it prints an actionable remedy
   (install Chrome / set `PIN_CHROME_PATH`) and exits non-zero — relay that to the user and stop.

4. **Confirm** it printed `wrote <cwd>/.pinpoint/config.json` and that `.pinpoint/` is in
   `.gitignore`. Tell the user they can now run `/pinpoint:start`.

## Notes
- Setup is an enhancement, not a gate — `/pinpoint:start` works with zero setup using defaults.
- Re-running setup is safe and idempotent (it overwrites the config and is a no-op on `.gitignore`).
```

- [ ] **Step 2: Update `/start` to mention config + persistent profile**

In `start.md` step 4 (lines ~56-60), append after the `PIN_CHROME_PROFILE` sentence:

```markdown
   If the user ran `/pinpoint:setup`, the bridge reads `.pinpoint/config.json` for the driver and a
   **persistent** profile (logins persist); explicit `PIN_*` env vars still override it.
```

And add a bullet to **Notes** (lines ~72-76):

```markdown
- First time in a project? Suggest `/pinpoint:setup` once to pick the driver + a persistent profile;
  `/start` otherwise falls back to defaults (CDP, throwaway profile).
```

- [ ] **Step 3: Rebuild the plugin bundle and run the gate**

Run: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS — the bundled `bin/pinpoint` includes the `setup` subcommand.

- [ ] **Step 4: Manual end-to-end check**

In `examples/vite-react`: `claude` → `/pinpoint:setup` (choose home) → confirm `.pinpoint/config.json` written and gitignored → `/pinpoint:start` → click + comment + Send → paste → edit lands → overlay clears. Run `/pinpoint:start` a second time and confirm it attaches to the still-open, still-logged-in window.

- [ ] **Step 5: Commit**

```bash
git add packages/claude-code/commands/setup.md packages/claude-code/commands/start.md packages/claude-code/bin
git commit -m "feat(plugin): /pinpoint:setup command; /start documents config + persistent profile"
```

> **Merge checkpoint:** rebase on `main`, merge `task-20--driver-abstraction`, verify the commits are on `main`, then flip TASK-20 → `Done`. Record any non-obvious calls in `docs/decisions.md`.

---

## Self-Review

**Spec coverage:**
- Driver interface in core → Tasks 1, 4 (bridge depends on the interface). ✓
- CDP driver, no regression → Tasks 2–4 + the integration loop in Task 4 Step 5. ✓
- Per-driver `healthCheck()` used by `/start` and `/setup` → Tasks 2, 7, 8. ✓
- `/pinpoint:setup` writes gitignored config; `/start` reads it, falls back to defaults → Tasks 6–9. ✓
- Persistent CDP profile (home default; repo opt-in + gitignore guard) → Tasks 5, 7, 8. ✓
- `/health` advertises project identity; no single-port assumption baked in → Task 8a. ✓
- Deferred (extension driver, multi-session discovery, container exposure) → out of scope, untouched. ✓

**Placeholder scan:** no TBD/TODO; every code step is complete. The Task 7 Step 1 test has an awkward
self-referential assertion that Step 4 immediately tightens — intentional and resolved within the task.

**Type consistency:** `Driver`/`DriverSession`/`HealthResult`/`DriverConnectOptions` (Task 1) are used
unchanged in Tasks 3, 7, 8. `CdpDriverConfig` (`cdpUrl`, `chromePath?`, `profileDir`) matches `buildDriver`
in Task 8. `PinpointFileConfig` (`driver`, `profileDir`, `port`) matches `readPinpointConfig` usage and
`writeConfig` in Task 7. `ProfileMode` (`"home"|"repo"`) is consistent across Tasks 5, 7, 8. `resolveProfileDir`
and `ensureGitignored` signatures match their callers.

**Open items deferred to execution:** confirming the live integration loop runs in this environment
(Task 4 Step 5); the extension driver's capture asymmetry (future card, not this plan).
