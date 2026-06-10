# Overlay Dev Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dev-only hot loop where editing `packages/core/src/overlay/**` re-injects the overlay into the already-open Chrome over the held CDP connection — no bin rebuild, no bridge restart, no Chrome reopen.

**Architecture:** esbuild `context().watch()` writes `packages/core/dist/overlay.iife.js`; the bridge under `PIN_DEV` `fs.watch`es that file and calls a new `page.reinject(preamble, source)` over the CDP connection. Re-inject works because the overlay installs a `window.__pinpointTeardown()` that fully unmounts (Preact `render(null)` + host removal + probe/link disposers). esbuild stays a build-time tool; `bin/pinpoint` gains no runtime deps.

**Tech Stack:** TypeScript, Preact (overlay), esbuild (bundler), Vitest + happy-dom (tests), raw Chrome DevTools Protocol.

**Spec:** `docs/superpowers/specs/2026-06-10-overlay-dev-loop-design.md`

---

## File structure

| File | Responsibility |
|---|---|
| `packages/core/src/overlay/selection-probe.ts` (modify) | install global extractor; **return a disposer** that deletes the global |
| `packages/core/src/overlay/bridge-link.ts` (modify) | install link global; track its `EventSource`; **return a disposer** that closes the ES + deletes the global |
| `packages/core/src/overlay/index.tsx` (modify) | install `window.__pinpointTeardown` alongside the guard |
| `packages/core/src/overlay/teardown.test.tsx` (create) | teardown + re-inject idempotency (happy-dom) |
| `packages/core/src/cdp/page.ts` (modify) | add `reinject(preamble, source)` to the `BridgePage` interface |
| `packages/core/src/cdp/cdp-page.ts` (modify) | implement `reinject`; capture/swap the on-new-document script id |
| `packages/core/src/cdp/fake-page.ts` (modify) | record `reinject` calls for tests |
| `packages/core/src/driver/cdp-driver.ts` (modify) | export `pinpointPreamble(bridgeUrl, sessionId)`; use it in `connect()` |
| `packages/core/src/dev/overlay-watch.ts` (create) | `reinjectFromFile()` + `startOverlayWatch()` (dev-only) |
| `packages/core/src/dev/overlay-watch.test.ts` (create) | reinject-from-file + debounce coalescing |
| `packages/core/src/cli.ts` (modify) | when `PIN_DEV` set, start the watcher after connect |
| `packages/core/scripts/build-overlay.mjs` (modify) | add `--watch` mode writing `dist/overlay.iife.js` |
| `packages/core/scripts/dev-overlay.mjs` (create) | launcher: esbuild watch + spawn `PIN_DEV=1 pinpoint` |
| `package.json` (modify) | add `"dev:overlay"` script |

**Note on `pnpm build` working dir:** all `pnpm`/`pnpm exec` commands below assume the user's `node` is on PATH. If a command fails with exit 127, prepend the nvm bin dir (resolve once: `export PATH="$(ls -d "$HOME"/.nvm/versions/node/*/bin | tail -1):$PATH"`).

---

### Task 1: Disposers for selection-probe and bridge-link

**Files:**
- Modify: `packages/core/src/overlay/selection-probe.ts`
- Modify: `packages/core/src/overlay/bridge-link.ts`
- Test: `packages/core/src/overlay/selection-probe.test.ts` (create)
- Test: `packages/core/src/overlay/bridge-link.test.ts` (create)

- [ ] **Step 1: Write the failing test for selection-probe disposer**

Create `packages/core/src/overlay/selection-probe.test.ts`:

```ts
// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { installSelectionProbe } from "./selection-probe.js";

afterEach(() => {
  delete (window as any).__pinpointExtractSelection;
});

it("installs the extractor global and returns a disposer that removes it", () => {
  const dispose = installSelectionProbe();
  expect(typeof (window as any).__pinpointExtractSelection).toBe("function");
  dispose();
  expect((window as any).__pinpointExtractSelection).toBeUndefined();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run packages/core/src/overlay/selection-probe.test.ts`
Expected: FAIL — `dispose` is not a function (installSelectionProbe returns void).

- [ ] **Step 3: Make installSelectionProbe return a disposer**

In `packages/core/src/overlay/selection-probe.ts`, change the signature and add a return at the end of the function (the body that assigns `window.__pinpointExtractSelection` is unchanged):

```ts
export function installSelectionProbe(): () => void {
  (window as any).__pinpointExtractSelection = function (el: Element) {
    // ... existing body unchanged ...
  };
  return function disposeSelectionProbe() {
    delete (window as any).__pinpointExtractSelection;
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run packages/core/src/overlay/selection-probe.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for bridge-link disposer**

Create `packages/core/src/overlay/bridge-link.test.ts`:

```ts
// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { installBridgeLink } from "./bridge-link.js";

afterEach(() => {
  delete (window as any).__pinpointLink;
  delete (window as any).__pinpointConfig;
  vi.unstubAllGlobals();
});

it("installs the link global and returns a disposer that removes it", () => {
  const dispose = installBridgeLink();
  expect((window as any).__pinpointLink).toBeTruthy();
  dispose();
  expect((window as any).__pinpointLink).toBeUndefined();
});

it("closes the EventSource opened by init() when disposed", () => {
  const close = vi.fn();
  class FakeES {
    onmessage: ((e: MessageEvent) => void) | null = null;
    constructor(public url: string) {}
    close = close;
  }
  vi.stubGlobal("EventSource", FakeES as unknown as typeof EventSource);
  (window as any).__pinpointConfig = { bridgeUrl: "http://x", sessionId: "s1" };

  const dispose = installBridgeLink();
  (window as any).__pinpointLink.init(() => {});
  dispose();
  expect(close).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm exec vitest run packages/core/src/overlay/bridge-link.test.ts`
Expected: FAIL — `dispose` is not a function.

- [ ] **Step 7: Make installBridgeLink track the EventSource and return a disposer**

Rewrite `packages/core/src/overlay/bridge-link.ts`:

```ts
// Attaches window.__pinpointLink — ported from the old BRIDGE_LINK_FN String.raw block.
// Reads window.__pinpointConfig. Returns a disposer that closes the EventSource (opened by
// init()) and removes the global, so a dev re-inject leaves no dangling SSE connection.
export function installBridgeLink(): () => void {
  let es: EventSource | null = null;
  (window as any).__pinpointLink = (function () {
    var cfg = (window as any).__pinpointConfig || {};
    function init(onStatus: any) {
      if (!cfg.bridgeUrl || !cfg.sessionId) return;
      try {
        es = new EventSource(
          cfg.bridgeUrl + "/session/" + encodeURIComponent(cfg.sessionId) + "/events",
        );
        es.onmessage = function (e) {
          try {
            var d = JSON.parse(e.data);
            if (d && d.type === "status" && onStatus) onStatus(d.promptId, d.status);
          } catch (_) {}
        };
      } catch (_) {}
    }
    async function send(items: any) {
      var r = await fetch(
        cfg.bridgeUrl + "/session/" + encodeURIComponent(cfg.sessionId) + "/send",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ items: items }),
        },
      );
      var j = await r.json();
      return j.promptId;
    }
    return { init: init, send: send };
  })();
  return function disposeBridgeLink() {
    try {
      es?.close();
    } catch (_) {}
    es = null;
    delete (window as any).__pinpointLink;
  };
}
```

- [ ] **Step 8: Run both tests to verify they pass**

Run: `pnpm exec vitest run packages/core/src/overlay/selection-probe.test.ts packages/core/src/overlay/bridge-link.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/overlay/selection-probe.ts packages/core/src/overlay/bridge-link.ts packages/core/src/overlay/selection-probe.test.ts packages/core/src/overlay/bridge-link.test.ts
git commit -m "feat(overlay): selection-probe + bridge-link return disposers (TASK-22)"
```

---

### Task 2: Teardown contract in index.tsx

**Files:**
- Modify: `packages/core/src/overlay/index.tsx`
- Test: `packages/core/src/overlay/teardown.test.tsx` (create)

- [ ] **Step 1: Write the failing teardown test**

Create `packages/core/src/overlay/teardown.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { installOverlayApp } from "./index.js";

afterEach(() => {
  (window as any).__pinpointTeardown?.();
  delete (window as any).__pinpointOverlayInstalled;
  delete (window as any).__pinpointTeardown;
  for (const h of [...document.querySelectorAll("[data-pinpoint]")]) h.remove();
  vi.restoreAllMocks();
});

it("mounts exactly one host and installs a teardown", () => {
  installOverlayApp();
  expect(document.querySelectorAll("[data-pinpoint]").length).toBe(1);
  expect(typeof (window as any).__pinpointTeardown).toBe("function");
  expect((window as any).__pinpointOverlayInstalled).toBe(true);
});

it("teardown removes the host, clears the guard, and balances document listeners", () => {
  const add = vi.spyOn(document, "addEventListener");
  const remove = vi.spyOn(document, "removeEventListener");

  installOverlayApp();
  (window as any).__pinpointTeardown();

  expect(document.querySelectorAll("[data-pinpoint]").length).toBe(0);
  expect((window as any).__pinpointOverlayInstalled).toBeUndefined();
  expect((window as any).__pinpointTeardown).toBeUndefined();
  // Every document listener added during install was removed by teardown.
  expect(remove.mock.calls.length).toBeGreaterThanOrEqual(add.mock.calls.length);
});

it("re-injecting after teardown mounts exactly one overlay (no stacking)", () => {
  installOverlayApp();
  (window as any).__pinpointTeardown();
  installOverlayApp();
  expect(document.querySelectorAll("[data-pinpoint]").length).toBe(1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run packages/core/src/overlay/teardown.test.tsx`
Expected: FAIL — `installOverlayApp` is not exported / `__pinpointTeardown` is undefined.

- [ ] **Step 3: Install the teardown in index.tsx**

Rewrite `packages/core/src/overlay/index.tsx` so `installOverlayApp` captures the disposers and host, and installs `window.__pinpointTeardown`:

```tsx
import { render } from "preact";
import { installBridgeLink } from "./bridge-link.js";
import { OverlayRoot } from "./components/OverlayRoot.js";
import { installSelectionProbe } from "./selection-probe.js";
import { OVERLAY_CSS } from "./styles.js";

export function installOverlayApp(): void {
  if ((window as any).__pinpointOverlayInstalled || !document.body) return;
  (window as any).__pinpointOverlayInstalled = true;
  const disposeProbe = installSelectionProbe();
  const disposeLink = installBridgeLink();
  const host = document.createElement("div");
  host.setAttribute("data-pinpoint", "1"); // C2: the single hideable host for screenshots
  host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483640";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = OVERLAY_CSS;
  root.appendChild(style);
  const mount = document.createElement("div"); // preact mount point inside the shadow root
  root.appendChild(mount);
  render(<OverlayRoot hostEl={host} />, mount);

  // Dev hot-reload contract: a full, idempotent unmount. Preact render(null) runs every
  // useEffect cleanup (picker/screenshot/escape/positioning/pointerup/link.init listeners);
  // the two installer disposers handle the non-Preact globals (extractor fn + SSE EventSource).
  (window as any).__pinpointTeardown = () => {
    render(null, mount);
    host.remove();
    disposeProbe();
    disposeLink();
    delete (window as any).__pinpointOverlayInstalled;
    delete (window as any).__pinpointTeardown;
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installOverlayApp, { once: true });
} else {
  installOverlayApp();
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec vitest run packages/core/src/overlay/teardown.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/overlay/index.tsx packages/core/src/overlay/teardown.test.tsx
git commit -m "feat(overlay): install window.__pinpointTeardown for clean re-inject (TASK-22)"
```

---

### Task 3: `reinject` on the page surface

**Files:**
- Modify: `packages/core/src/cdp/page.ts` (interface)
- Modify: `packages/core/src/cdp/cdp-page.ts` (impl)
- Modify: `packages/core/src/cdp/fake-page.ts` (test double)
- Test: `packages/core/src/cdp/cdp-page.test.ts` (extend)

- [ ] **Step 1: Add `reinject` to the BridgePage interface**

In `packages/core/src/cdp/page.ts`, add to the `BridgePage` interface (after `injectBootstrap`):

```ts
  /**
   * Dev hot-reload: tear down the live overlay, swap the on-new-document bootstrap so page
   * reloads use the fresh code, then evaluate `preamble + "\n" + source` to remount.
   */
  reinject(preamble: string, source: string): Promise<void>;
```

- [ ] **Step 2: Write the failing test for CdpPage.reinject**

Append to `packages/core/src/cdp/cdp-page.test.ts` (the file already defines `FakeCdp`):

```ts
describe("reinject", () => {
  it("tears down, swaps the on-new-document script, then evaluates fresh source", async () => {
    const cdp = new FakeCdp({
      "Page.addScriptToEvaluateOnNewDocument": { identifier: "id-1" },
    });
    const page = new CdpPage(cdp as never);
    await page.injectBootstrap("BOOT_V1"); // captures id-1

    // Next add returns a new identifier.
    (cdp as unknown as { results: Record<string, unknown> }).results[
      "Page.addScriptToEvaluateOnNewDocument"
    ] = { identifier: "id-2" };

    await page.reinject("PREAMBLE", "OVERLAY_V2");

    const methods = cdp.calls.map((c) => c.method);
    // teardown eval, remove old script, add new script, eval new source — in this order
    expect(methods).toEqual([
      "Page.addScriptToEvaluateOnNewDocument", // from injectBootstrap
      "Runtime.evaluate", // from injectBootstrap
      "Runtime.evaluate", // teardown
      "Page.removeScriptToEvaluateOnNewDocument",
      "Page.addScriptToEvaluateOnNewDocument",
      "Runtime.evaluate", // remount
    ]);
    const remove = cdp.calls.find((c) => c.method === "Page.removeScriptToEvaluateOnNewDocument");
    expect(remove?.params).toEqual({ identifier: "id-1" });
    const teardown = cdp.calls.filter((c) => c.method === "Runtime.evaluate")[1];
    expect(teardown.params.expression).toContain("__pinpointTeardown");
    const remount = cdp.calls.filter((c) => c.method === "Runtime.evaluate")[2];
    expect(remount.params.expression).toBe("PREAMBLE\nOVERLAY_V2");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm exec vitest run packages/core/src/cdp/cdp-page.test.ts`
Expected: FAIL — `page.reinject is not a function`.

- [ ] **Step 4: Implement reinject + script-id capture in CdpPage**

In `packages/core/src/cdp/cdp-page.ts`, add a field and replace `injectBootstrap`, then add `reinject`:

```ts
export class CdpPage implements BridgePage {
  private bootstrapScriptId: string | null = null;

  constructor(private readonly cdp: CdpConnection) {}

  // ... evaluate() unchanged ...

  async injectBootstrap(source: string): Promise<void> {
    const { identifier } = await this.cdp.send<{ identifier: string }>(
      "Page.addScriptToEvaluateOnNewDocument",
      { source },
    );
    this.bootstrapScriptId = identifier;
    await this.cdp.send("Runtime.evaluate", { expression: source });
  }

  async reinject(preamble: string, source: string): Promise<void> {
    const combined = `${preamble}\n${source}`;
    // 1. Clean unmount of the live overlay (guarded — no-op if not yet installed).
    await this.cdp.send("Runtime.evaluate", {
      expression: "window.__pinpointTeardown && window.__pinpointTeardown()",
    });
    // 2. Swap the on-new-document bootstrap so a manual reload uses the fresh code.
    if (this.bootstrapScriptId) {
      await this.cdp.send("Page.removeScriptToEvaluateOnNewDocument", {
        identifier: this.bootstrapScriptId,
      });
    }
    const { identifier } = await this.cdp.send<{ identifier: string }>(
      "Page.addScriptToEvaluateOnNewDocument",
      { source: combined },
    );
    this.bootstrapScriptId = identifier;
    // 3. Mount the fresh overlay now.
    await this.cdp.send("Runtime.evaluate", { expression: combined });
  }

  // ... screenshot methods unchanged ...
}
```

- [ ] **Step 5: Add reinject to FakePage**

In `packages/core/src/cdp/fake-page.ts`, add a recorder array and method:

```ts
  readonly reinjectCalls: Array<{ preamble: string; source: string }> = [];

  async reinject(preamble: string, source: string): Promise<void> {
    this.reinjectCalls.push({ preamble, source });
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/core/src/cdp/cdp-page.test.ts`
Expected: PASS (existing + new reinject test).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/cdp/page.ts packages/core/src/cdp/cdp-page.ts packages/core/src/cdp/fake-page.ts packages/core/src/cdp/cdp-page.test.ts
git commit -m "feat(cdp): page.reinject — teardown + on-new-document swap + remount (TASK-22)"
```

---

### Task 4: Shared preamble helper

**Files:**
- Modify: `packages/core/src/driver/cdp-driver.ts`
- Test: `packages/core/src/driver/cdp-driver.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `packages/core/src/driver/cdp-driver.test.ts`:

```ts
import { pinpointPreamble } from "./cdp-driver.js";

describe("pinpointPreamble", () => {
  it("builds the __pinpointConfig assignment", () => {
    expect(pinpointPreamble("http://localhost:7331", "sess-1")).toBe(
      'window.__pinpointConfig = {"bridgeUrl":"http://localhost:7331","sessionId":"sess-1"};',
    );
  });
});
```

(If `describe`/`expect`/`it` are not already imported at the top of the file, add them to the existing `vitest` import.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run packages/core/src/driver/cdp-driver.test.ts`
Expected: FAIL — `pinpointPreamble` is not exported.

- [ ] **Step 3: Add and use the helper**

In `packages/core/src/driver/cdp-driver.ts`, add the export near the top (after imports):

```ts
/** The bootstrap config line injected ahead of the overlay bundle. Shared by connect() and the
 *  dev overlay watcher so the re-injected bundle keeps the same bridge URL + session id. */
export function pinpointPreamble(bridgeUrl: string, sessionId: string): string {
  return `window.__pinpointConfig = ${JSON.stringify({ bridgeUrl, sessionId })};`;
}
```

Then replace the inline `const preamble = ...` line inside `connect()` (currently `cdp-driver.ts:88-89`) with:

```ts
      const sessionId = randomUUID();
      const preamble = pinpointPreamble(opts.bridgeUrl, sessionId);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/core/src/driver/cdp-driver.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/driver/cdp-driver.ts packages/core/src/driver/cdp-driver.test.ts
git commit -m "refactor(driver): extract pinpointPreamble helper (TASK-22)"
```

---

### Task 5: The overlay watcher (dev-only)

**Files:**
- Create: `packages/core/src/dev/overlay-watch.ts`
- Test: `packages/core/src/dev/overlay-watch.test.ts`

- [ ] **Step 1: Write the failing test for reinjectFromFile + debounce**

Create `packages/core/src/dev/overlay-watch.test.ts`:

```ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FakePage } from "../cdp/fake-page.js";
import { reinjectFromFile, startOverlayWatch } from "./overlay-watch.js";

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pp-watch-"));
  file = join(dir, "overlay.iife.js");
});
afterEach(() => {
  vi.useRealTimers();
});

it("reinjectFromFile reads the file and calls page.reinject with its contents", async () => {
  writeFileSync(file, "OVERLAY_BYTES");
  const page = new FakePage();
  await reinjectFromFile(page, file, "PREAMBLE");
  expect(page.reinjectCalls).toEqual([{ preamble: "PREAMBLE", source: "OVERLAY_BYTES" }]);
});

it("reinjectFromFile swallows a missing file (logs, does not throw)", async () => {
  const page = new FakePage();
  const log = vi.fn();
  await reinjectFromFile(page, join(dir, "nope.js"), "PRE", log);
  expect(page.reinjectCalls).toEqual([]);
  expect(log).toHaveBeenCalled();
});

it("startOverlayWatch debounces rapid changes into a single reinject", async () => {
  vi.useFakeTimers();
  writeFileSync(file, "V1");
  const page = new FakePage();
  let fire: () => void = () => {};
  // Inject a fake subscribe seam: capture the change callback instead of using fs.watch.
  const handle = startOverlayWatch({
    page,
    filePath: file,
    preamble: "PRE",
    debounceMs: 80,
    subscribe: (cb) => {
      fire = cb;
      return () => {};
    },
  });
  fire();
  fire();
  fire();
  await vi.advanceTimersByTimeAsync(80);
  expect(page.reinjectCalls.length).toBe(1);
  handle.stop();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run packages/core/src/dev/overlay-watch.test.ts`
Expected: FAIL — module `./overlay-watch.js` not found.

- [ ] **Step 3: Implement the watcher**

Create `packages/core/src/dev/overlay-watch.ts`:

```ts
import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import type { BridgePage } from "../cdp/page.js";

type Log = (msg: string) => void;

/** Read the built overlay IIFE and re-inject it. Errors (missing/locked file, eval failure)
 *  are logged, never thrown — a dev watch loop must survive a bad build. */
export async function reinjectFromFile(
  page: BridgePage,
  filePath: string,
  preamble: string,
  log: Log = (m) => console.error(m),
): Promise<void> {
  let source: string;
  try {
    source = await readFile(filePath, "utf8");
  } catch (e) {
    log(`pinpoint dev: cannot read overlay bundle ${filePath}: ${(e as Error).message}`);
    return;
  }
  try {
    await page.reinject(preamble, source);
    log("pinpoint dev: overlay re-injected");
  } catch (e) {
    log(`pinpoint dev: re-inject failed: ${(e as Error).message}`);
  }
}

export interface OverlayWatchOptions {
  page: BridgePage;
  filePath: string;
  preamble: string;
  debounceMs?: number;
  log?: Log;
  /** Seam for tests: register a change callback, return an unsubscribe. Defaults to fs.watch. */
  subscribe?: (onChange: () => void) => () => void;
}

/** Watch the built overlay bundle and re-inject (debounced) on every change. Dev-only. */
export function startOverlayWatch(opts: OverlayWatchOptions): { stop: () => void } {
  const { page, filePath, preamble } = opts;
  const debounceMs = opts.debounceMs ?? 80;
  const log = opts.log ?? ((m) => console.error(m));
  const subscribe =
    opts.subscribe ??
    ((onChange) => {
      const w = watch(filePath, { persistent: false }, () => onChange());
      return () => w.close();
    });

  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void reinjectFromFile(page, filePath, preamble, log);
    }, debounceMs);
  });

  log(`pinpoint dev: watching ${filePath} for overlay changes`);
  return {
    stop: () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/core/src/dev/overlay-watch.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/dev/overlay-watch.ts packages/core/src/dev/overlay-watch.test.ts
git commit -m "feat(dev): overlay-watch — debounced fs.watch -> page.reinject (TASK-22)"
```

---

### Task 6: Wire the watcher into the CLI under PIN_DEV

**Files:**
- Modify: `packages/core/src/cli.ts`

This task has no unit test (cli.ts is the process entrypoint and calls `process.exit`); it is covered by the manual verification in Task 9. Keep the wiring minimal.

- [ ] **Step 1: Add the dev-watch wiring to `start()`**

In `packages/core/src/cli.ts`, add these imports near the top:

```ts
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { pinpointPreamble } from "./driver/cdp-driver.js";
```

(There is already a `join` import from `node:path`; extend that line to `import { basename, dirname, join, resolve } from "node:path";`.)

Then, in `start()`, immediately after the `startBridgeServer(...)` call and before the `console.error("pinpoint bridge on ...")` line, insert:

```ts
  if (process.env.PIN_DEV) {
    // Dev hot loop: watch the esbuild-built overlay IIFE and re-inject on change.
    // Default path is repo-relative to the bundled CLI (bin/pinpoint -> ../../core/dist/...).
    const here = dirname(fileURLToPath(import.meta.url));
    const overlayFile =
      process.env.PIN_OVERLAY_FILE ?? resolve(here, "../../core/dist/overlay.iife.js");
    const { startOverlayWatch } = await import("./dev/overlay-watch.js");
    startOverlayWatch({
      page: session.page,
      filePath: overlayFile,
      preamble: pinpointPreamble(bridgeUrl, session.sessionId),
    });
  }
```

> The dynamic `import("./dev/overlay-watch.js")` keeps the watcher out of the default startup path. It pulls in only Node builtins (`fs`), so it adds no third-party dependency to the bundle.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no type errors).

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/cli.ts
git commit -m "feat(cli): start overlay watcher when PIN_DEV is set (TASK-22)"
```

---

### Task 7: esbuild `--watch` mode + dist artifact

**Files:**
- Modify: `packages/core/scripts/build-overlay.mjs`

- [ ] **Step 1: Add a `--watch` branch that writes `dist/overlay.iife.js`**

Rewrite `packages/core/scripts/build-overlay.mjs`:

```js
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, context } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, "../src/overlay/index.tsx");
const distFile = join(here, "../dist/overlay.iife.js");
const generated = join(here, "../src/cdp/overlay-source.generated.ts");

const common = {
  entryPoints: [entry],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  jsx: "automatic",
  jsxImportSource: "preact",
};

const watch = process.argv.includes("--watch");

if (watch) {
  // Dev: write the raw IIFE to dist/ on every change; the bridge (PIN_DEV) watches this file.
  mkdirSync(dirname(distFile), { recursive: true });
  const ctx = await context({ ...common, outfile: distFile, write: true });
  await ctx.watch();
  console.log("watching overlay ->", distFile);
} else {
  // Production: regenerate the .ts string embedded into bin/pinpoint.
  const result = await build({ ...common, write: false });
  const code = result.outputFiles[0].text;
  writeFileSync(
    generated,
    `// @generated by scripts/build-overlay.mjs — do not edit. Source: src/overlay/*.ts\n` +
      `export const OVERLAY_SOURCE = ${JSON.stringify(code)};\n`,
  );
  console.log("wrote", generated, `(${code.length} bytes)`);
}
```

- [ ] **Step 2: Verify production build still regenerates the .ts**

Run: `pnpm --filter @pinpoint/core build`
Expected: prints `wrote .../overlay-source.generated.ts (NNNNN bytes)`; `git status` shows no change to the generated file (byte-identical to committed).

- [ ] **Step 3: Verify watch mode writes the dist artifact**

Run: `node packages/core/scripts/build-overlay.mjs --watch &` then after ~1s `ls -la packages/core/dist/overlay.iife.js` and `kill %1`.
Expected: `dist/overlay.iife.js` exists and is non-empty; the file is gitignored (`git status` clean).

- [ ] **Step 4: Commit**

```bash
git add packages/core/scripts/build-overlay.mjs
git commit -m "build(overlay): add --watch mode writing dist/overlay.iife.js (TASK-22)"
```

---

### Task 8: `dev:overlay` launcher + npm script

**Files:**
- Create: `packages/core/scripts/dev-overlay.mjs`
- Modify: `package.json` (root)

- [ ] **Step 1: Write the launcher**

Create `packages/core/scripts/dev-overlay.mjs`:

```js
// Dev hot loop launcher: run the esbuild overlay watch and the bridge (PIN_DEV) together.
// The bridge reads PIN_APP_URL (your running dev app) like a normal `pinpoint` start.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const procs = [];

function run(cmd, args, extraEnv = {}) {
  const child = spawn(cmd, args, {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });
  procs.push(child);
  child.on("exit", (code) => {
    // If any child dies, tear the whole loop down.
    for (const p of procs) if (p !== child) p.kill();
    process.exit(code ?? 0);
  });
  return child;
}

// 1. esbuild watch -> packages/core/dist/overlay.iife.js
run("node", [join(here, "build-overlay.mjs"), "--watch"]);
// 2. the bridge in dev mode (re-injects on each rebuild). bin path resolves from this package.
const bin = join(here, "../../claude-code/bin/pinpoint");
run("node", [bin], { PIN_DEV: "1" });

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    for (const p of procs) p.kill();
    process.exit(0);
  });
}
```

- [ ] **Step 2: Add the root npm script**

In root `package.json` `scripts`, add:

```json
    "dev:overlay": "node packages/core/scripts/dev-overlay.mjs",
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/scripts/dev-overlay.mjs package.json
git commit -m "feat(dev): pnpm dev:overlay launches esbuild watch + PIN_DEV bridge (TASK-22)"
```

---

### Task 9: Full validation + live verification + decisions row

**Files:**
- Modify: `docs/decisions.md`

- [ ] **Step 1: Run the full gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all pass; `git status` shows no unexpected changes (the generated overlay .ts is byte-identical; `dist/` is gitignored).

- [ ] **Step 2: Live hot-reload check**

In one terminal start the example app (`pnpm --dir examples/vite-react dev`). In another, with node on PATH, run from the repo root: `PIN_APP_URL=http://localhost:5173 pnpm dev:overlay`. Wait for `pinpoint bridge on ...` and `pinpoint dev: watching ...`. In the Chrome the bridge opened, confirm the overlay orb is bottom-right. Then edit a visible overlay style — e.g. in `packages/core/src/overlay/components/Fab.tsx` change the orb `background:#2962ff` to `#e91e63` and save. Within ~1s the orb in the already-open Chrome should turn pink with **no** bridge restart and **no** Chrome reopen, and the bridge log should print `pinpoint dev: overlay re-injected`. Revert the color change.

- [ ] **Step 3: Confirm no overlay stacking across reloads**

After several saves, in the bridge's Chrome DevTools console run `document.querySelectorAll('[data-pinpoint]').length` — expected `1` (not growing). Run it via the page if DevTools is open; otherwise trust the teardown unit test plus the single visible orb.

- [ ] **Step 4: Record the decision**

Append one row to `docs/decisions.md` (match the existing table/format in that file):

> `2026-06-10` — Overlay dev hot loop (TASK-22): esbuild `--watch` writes `dist/overlay.iife.js`; bridge under `PIN_DEV` `fs.watch`es it and re-injects via `page.reinject` over the held CDP connection. esbuild stays build-time only (dynamic import in cli.ts), so `bin/pinpoint` keeps zero runtime deps. Enabled by `window.__pinpointTeardown` (Preact `render(null)` + host removal + probe/link disposers); re-inject also swaps the on-new-document bootstrap so reloads use fresh code. State resets on reload (v1).

- [ ] **Step 5: Commit**

```bash
git add docs/decisions.md
git commit -m "docs(decisions): record overlay dev hot loop (TASK-22)"
```

---

## Self-review notes

- **Spec coverage:** teardown contract (Task 2) + disposers (Task 1); `reinject` with on-new-document swap (Task 3); shared preamble (Task 4); watcher + debounce + error-tolerance (Task 5); PIN_DEV wiring + `PIN_OVERLAY_FILE` override + dynamic import to keep prod path clean (Task 6); esbuild `--watch` + dist artifact, prod path unchanged (Task 7); `dev:overlay` launcher (Task 8); state-resets-on-reload is the v1 scope (no hydration task — intentional); full gate + live check + decisions row (Task 9).
- **Type consistency:** `reinject(preamble, source)` is identical across `BridgePage`, `CdpPage`, `FakePage`, the watcher, and the cli wiring. `installSelectionProbe`/`installBridgeLink` both return `() => void`. `startOverlayWatch` returns `{ stop }`.
- **No placeholders:** every code step shows complete code; every run step shows the command + expected result.
