# Overlay Modularization (testable overlay) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal (TASK-19):** Re-author the injected overlay as real TypeScript modules bundled to the injectable string with esbuild, so its logic is type-checked and unit-testable under happy-dom — with **zero behavior change** to the shipped overlay.

**Architecture:** Today `OVERLAY_SOURCE` is a ~210-line template literal in `packages/core/src/cdp/overlay-script.ts` that concatenates two `String.raw` blocks (`EXTRACT_SELECTION_FN`, `BRIDGE_LINK_FN`) with an inline IIFE. The string is only an *injection-transport* requirement (CDP injects one self-contained script via `Page.addScriptToEvaluateOnNewDocument`). We move all overlay code into `packages/core/src/overlay/*.ts`, bundle the entry with esbuild (`platform=browser, format=iife, bundle`) into a generated TS module that exports `OVERLAY_SOURCE`, and keep `overlay-script.ts` as a thin barrel so `connector.ts` and the dead-but-exported probe consts are unchanged for importers.

**Tech Stack:** TypeScript (NodeNext, `.js` specifiers — esbuild resolves `.js`→`.ts`); esbuild `^0.28.0` (already used by `packages/claude-code`); Biome; Vitest (node default + happy-dom per-file via docblock).

**Hard contracts to preserve (the only external surface):**
- In-page globals: `window.__pinpointExtractSelection(el)`, `window.__pinpointLink` (`.init`/`.send`), reads `window.__pinpointConfig`; writes `window.__pinpointAnnotations` / `__pinpointSelection` / `__pinpointRegion`. (Integration tests call `__pinpointExtractSelection` in-page; the overlay POSTs items via `__pinpointLink`.)
- `connector.ts:59` injects `"<preamble>\n" + OVERLAY_SOURCE` — `OVERLAY_SOURCE` must stay exported from `./overlay-script.js`.
- `packages/claude-code` esbuilds `../core/src/cli.ts` (core **source**), so the generated bundle module **must be committed** (standalone `pnpm typecheck` / downstream bundle can't assume the overlay build ran first).

**Verification per task:** `pnpm typecheck && pnpm lint && pnpm test` green + `pnpm build` succeeds. Behavior-preservation is checked at the end of each stage by (a) the gated live integration tests and (b) visually in the live bridge **running the worktree's own CLI** (`pnpm --filter @pinpoint/core build && PIN_APP_URL=http://localhost:5173 node packages/core/dist/cli.js`) — NOT the globally-installed plugin `pinpoint` bin, which is built from old source.

**Two stages:** Stage A is a faithful lift-and-shift (modules + bundling pipe, same logic) — lowest risk, proves nothing changed. Stage B adds happy-dom + extracts the testable seams with unit tests. Commit after every task.

---

## Stage A — Modules + esbuild bundling pipe (no logic rewrite)

### Task A1: Add esbuild to core + the overlay globals module

**Files:**
- Modify: `packages/core/package.json`
- Create: `packages/core/src/overlay/globals.ts`
- Modify: `biome.json`

- [ ] **Step 1: Add esbuild devDep.** In `packages/core/package.json` add a `devDependencies` block:
```json
  "devDependencies": {
    "esbuild": "^0.28.0"
  }
```
Then run `pnpm install` from the repo root.

- [ ] **Step 2: Create the globals module** (`packages/core/src/overlay/globals.ts`) — plain string consts, no DOM, importable by both browser overlay and node consumers:
```typescript
// Window-global names + CDP probe expressions shared by the injected overlay
// and any node-side reader. No DOM access here so node code can import it too.
export const REGION_GLOBAL = "__pinpointRegion";
export const ANNOTATIONS_GLOBAL = "__pinpointAnnotations";
export const SELECTION_GLOBAL = "__pinpointSelection";
export const REGION_PROBE = `window.${REGION_GLOBAL} ?? null`;
export const ANNOTATIONS_PROBE = `window.${ANNOTATIONS_GLOBAL} ?? null`;
```

- [ ] **Step 3: Relax Biome for the overlay dir + ignore the generated bundle.** In `biome.json`, add `"!packages/core/src/cdp/overlay-source.generated.ts"` to `files.includes`, and add an override so the overlay's DOM/`any`/global code lints cleanly (mirrors the existing `playwright-page.ts` override):
```json
    {
      "includes": ["packages/core/src/overlay/**"],
      "linter": { "rules": { "suspicious": { "noExplicitAny": "off" }, "security": { "noGlobalEval": "off" } } }
    }
```

- [ ] **Step 4: Verify + commit.** `pnpm typecheck && pnpm lint` (no test changes yet).
```bash
git add packages/core/package.json pnpm-lock.yaml packages/core/src/overlay/globals.ts biome.json
git commit -m "chore(overlay): add esbuild dep + overlay globals module + biome overrides (TASK-19)"
```

---

### Task A2: Port `selection-probe` + `bridge-link` string-blocks into browser modules

These are currently `String.raw` blocks that attach window globals. Port them verbatim into real TS functions that do the same attachment. Keep the existing `packages/core/src/cdp/selection-probe.ts` `RawSelection` type and `SELECTION_GLOBAL` re-export intact for now (node imports it); only the *injected* code moves.

**Files:**
- Create: `packages/core/src/overlay/selection-probe.ts`
- Create: `packages/core/src/overlay/bridge-link.ts`
- Reference (read, copy bodies from): `packages/core/src/cdp/selection-probe.ts:44-106`, `packages/core/src/cdp/bridge-link.ts:7-28`

- [ ] **Step 1: `packages/core/src/overlay/selection-probe.ts`** — wrap the body of the old `EXTRACT_SELECTION_FN` (lines 45-105 of `cdp/selection-probe.ts`, i.e. everything assigned to `window.__pinpointExtractSelection`) in an exported installer. Copy the function body **verbatim** (it's plain DOM/React-fiber JS); type the param as `Element` and return `any`:
```typescript
// Attaches window.__pinpointExtractSelection — ported verbatim from the old
// EXTRACT_SELECTION_FN String.raw block (cdp/selection-probe.ts).
export function installSelectionProbe(): void {
  (window as any).__pinpointExtractSelection = function (el: Element) {
    // <<< paste the exact body that was inside the old String.raw block >>>
  };
}
```

- [ ] **Step 2: `packages/core/src/overlay/bridge-link.ts`** — same treatment for `BRIDGE_LINK_FN` (cdp/bridge-link.ts:8-27), preserving `var cfg = window.__pinpointConfig || {}`, `init`, `send`:
```typescript
// Attaches window.__pinpointLink — ported verbatim from the old BRIDGE_LINK_FN
// String.raw block (cdp/bridge-link.ts). Reads window.__pinpointConfig.
export function installBridgeLink(): void {
  (window as any).__pinpointLink = (function () {
    // <<< paste the exact IIFE body from the old String.raw block >>>
  })();
}
```

- [ ] **Step 3: Verify + commit.** `pnpm typecheck && pnpm lint` (these modules aren't wired in yet; this confirms they compile/lint).
```bash
git add packages/core/src/overlay/selection-probe.ts packages/core/src/overlay/bridge-link.ts
git commit -m "refactor(overlay): port selection-probe + bridge-link string-blocks to TS modules (TASK-19)"
```

---

### Task A3: Port the overlay IIFE into `src/overlay/install.ts` + `index.ts` entry

Move the inline IIFE (`overlay-script.ts:28-209`, the `install()` function and the bottom DOMContentLoaded guard) into a real module, verbatim, swapping the two interpolated globals and the two String.raw concatenations for imports.

**Files:**
- Create: `packages/core/src/overlay/install.ts`
- Create: `packages/core/src/overlay/index.ts` (esbuild entry)
- Reference: `packages/core/src/cdp/overlay-script.ts:28-209`

- [ ] **Step 1: `install.ts`** — paste the body of the IIFE verbatim as an exported `installOverlay()`. Replace the template interpolations `'${ANNOTATIONS_GLOBAL}'`, `'${SELECTION_GLOBAL}'`, `'${REGION_GLOBAL}'` (overlay lines 87, 194) with the imported consts (e.g. `window[ANNOTATIONS_GLOBAL]`). Type browser globals via `(window as any)` where TS complains. Header:
```typescript
import { ANNOTATIONS_GLOBAL, REGION_GLOBAL, SELECTION_GLOBAL } from "./globals.js";

// The overlay UI installer — ported verbatim from the inline IIFE that used to
// live in cdp/overlay-script.ts. No behavior change.
export function installOverlay(): void {
  // <<< paste the exact body that was inside `function install() { ... }` >>>
}
```
Note: the old code reads `window['__pinpointOverlayInstalled']`, builds DOM, wires events — copy it 1:1. The `window['<global>'] = snap` lines become `(window as any)[ANNOTATIONS_GLOBAL] = snap` etc.

- [ ] **Step 2: `index.ts`** (the bundle entry) — install the probes + link, then run the overlay, reproducing the old top-level order (`EXTRACT_SELECTION_FN`, then `BRIDGE_LINK_FN`, then the IIFE with its readyState guard):
```typescript
import { installBridgeLink } from "./bridge-link.js";
import { installSelectionProbe } from "./selection-probe.js";
import { installOverlay } from "./install.js";

installSelectionProbe();
installBridgeLink();
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installOverlay, { once: true });
} else {
  installOverlay();
}
```
(Move the readyState guard out of the old IIFE bottom into here so `installOverlay` is just the body.)

- [ ] **Step 3: Verify + commit.** `pnpm typecheck && pnpm lint`.
```bash
git add packages/core/src/overlay/install.ts packages/core/src/overlay/index.ts
git commit -m "refactor(overlay): port overlay IIFE into install.ts + esbuild entry index.ts (TASK-19)"
```

---

### Task A4: esbuild build script → generated `OVERLAY_SOURCE`, rewire `overlay-script.ts`

**Files:**
- Create: `packages/core/scripts/build-overlay.mjs`
- Create (generated, committed): `packages/core/src/cdp/overlay-source.generated.ts`
- Modify: `packages/core/src/cdp/overlay-script.ts` (becomes a thin barrel)
- Modify: `packages/core/package.json` (build script)

- [ ] **Step 1: `packages/core/scripts/build-overlay.mjs`** — bundle the entry in-memory and codegen the string module (`JSON.stringify` handles all escaping):
```javascript
import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const result = await build({
  entryPoints: [join(here, "../src/overlay/index.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  write: false,
});
const code = result.outputFiles[0].text;
const out = join(here, "../src/cdp/overlay-source.generated.ts");
writeFileSync(
  out,
  `// @generated by scripts/build-overlay.mjs — do not edit. Source: src/overlay/*.ts\n` +
    `export const OVERLAY_SOURCE = ${JSON.stringify(code)};\n`,
);
console.log("wrote", out, `(${code.length} bytes)`);
```

- [ ] **Step 2: Run it once** to produce the committed artifact: `node packages/core/scripts/build-overlay.mjs`. Confirm `packages/core/src/cdp/overlay-source.generated.ts` exists and is one `export const OVERLAY_SOURCE = "...";` line.

- [ ] **Step 3: Rewrite `overlay-script.ts`** as a thin barrel preserving its public names (so `connector.ts` and any probe-const importer are unchanged):
```typescript
// Public surface for the injected overlay. The overlay itself is authored as
// TS modules in ../overlay/*.ts and bundled to a string by scripts/build-overlay.mjs.
export { OVERLAY_SOURCE } from "./overlay-source.generated.js";
export {
  ANNOTATIONS_GLOBAL,
  ANNOTATIONS_PROBE,
  REGION_GLOBAL,
  REGION_PROBE,
  SELECTION_GLOBAL,
} from "../overlay/globals.js";
```
(The old inline IIFE, `EXTRACT_SELECTION_FN`/`BRIDGE_LINK_FN` imports, and the doc-comment now live with the modules. Delete the old body.)

- [ ] **Step 4: Wire the build order** in `packages/core/package.json`:
```json
    "build": "node scripts/build-overlay.mjs && tsc -p tsconfig.json",
```

- [ ] **Step 5: Retire the now-unused injected strings.** `cdp/selection-probe.ts` still legitimately exports `RawSelection` + `SELECTION_GLOBAL`-related types used by node — keep those, but delete the `EXTRACT_SELECTION_FN` export if nothing imports it (grep first: `grep -rn EXTRACT_SELECTION_FN packages/core/src`). Likewise delete `BRIDGE_LINK_FN` from `cdp/bridge-link.ts` if unused. (Both were only imported by the old `overlay-script.ts`.) If a file ends up empty/typeless, leave its still-used exports and remove only the dead string const.

- [ ] **Step 6: Verify.** `node packages/core/scripts/build-overlay.mjs && pnpm typecheck && pnpm lint && pnpm test && pnpm build`. All green; `pnpm build` regenerates the bundle then `tsc`.

- [ ] **Step 7: Behavior-preservation check (visual + integration).** Rebuild the worktree CLI and relaunch the bridge against the running example app, then exercise the overlay (Pick / Screenshot / comment / Copy) — it must behave exactly as before:
```bash
pnpm --filter @pinpoint/core build
# stop any prior bridge, then:
PIN_APP_URL=http://localhost:5173 node packages/core/dist/cli.js
```
If a live Chrome on `:9222` + app on `:5180` are available, also run the gated integration suite:
```bash
pnpm --filter @pinpoint/core exec vitest run --config vitest.integration.config.ts
```

- [ ] **Step 8: Commit.**
```bash
git add packages/core/scripts/build-overlay.mjs packages/core/src/cdp/overlay-source.generated.ts packages/core/src/cdp/overlay-script.ts packages/core/src/cdp/selection-probe.ts packages/core/src/cdp/bridge-link.ts packages/core/package.json
git commit -m "refactor(overlay): bundle overlay modules to generated OVERLAY_SOURCE via esbuild (TASK-19)"
```

---

## Stage B — happy-dom + extract testable seams with unit tests

### Task B1: Add happy-dom + a smoke DOM test

**Files:**
- Modify: root `package.json` (devDep) — install happy-dom
- Create: `packages/core/src/overlay/install.test.ts`

- [ ] **Step 1: Install happy-dom** at the workspace root: `pnpm add -Dw happy-dom`. (Root `vitest.config.ts` keeps `environment: "node"` as default; overlay tests opt in per-file.)

- [ ] **Step 2: Smoke test** that the overlay installs into a DOM without throwing and attaches the FAB. Top-of-file docblock switches just this file to happy-dom:
```typescript
// @vitest-environment happy-dom
import { beforeEach, expect, it } from "vitest";
import { installOverlay } from "./install.js";

beforeEach(() => {
  document.documentElement.innerHTML = "<body></body>";
  (window as any).__pinpointOverlayInstalled = false;
});

it("installs the overlay FAB into the document", () => {
  installOverlay();
  const orb = [...document.querySelectorAll("button")].find((b) => b.textContent === "✦");
  expect(orb).toBeTruthy();
  expect(document.querySelector("[data-pinpoint]")).toBeTruthy();
});
```

- [ ] **Step 3: Verify + commit.** `pnpm test` (the new test runs under happy-dom; node tests unaffected).
```bash
git add package.json pnpm-lock.yaml packages/core/src/overlay/install.test.ts
git commit -m "test(overlay): happy-dom setup + overlay install smoke test (TASK-19)"
```

---

### Task B2: Extract the state model + Copy-button render as testable units

This is the first real seam TASK-18 needs. Pull the inline `state` literal and the Copy-button visual logic out of `install.ts` into focused modules, behavior-preserving, with unit tests.

**Files:**
- Create: `packages/core/src/overlay/state.ts`
- Create: `packages/core/src/overlay/send-button.ts` + `send-button.test.ts`
- Modify: `packages/core/src/overlay/install.ts`

- [ ] **Step 1: `state.ts`** — export the state shape + a factory matching the current literal (`overlay-script.ts:41`) exactly:
```typescript
export interface OverlayState {
  mode: "pick" | "screenshot" | null;
  items: any[];
  ready: boolean;
  batchId: number;
  nextId: number;
  lastPromptId: string | null;
  open: Record<string, boolean>;
  fabOpen: boolean;
  fab: { right: number; bottom: number };
  mouse: { x: number; y: number } | null;
  confirming: boolean;
}

export function createOverlayState(): OverlayState {
  return { mode: null, items: [], ready: false, batchId: 0, nextId: 1, lastPromptId: null, open: {}, fabOpen: false, fab: { right: 16, bottom: 16 }, mouse: null, confirming: false };
}
```

- [ ] **Step 2: `send-button.ts`** — extract the current Copy-button render (today scattered across lines 62/88/109/198). Keep behavior identical to current `main` (button shows "Copy"/"Copied ✓", green; no disabled state yet — TASK-18 changes that later, NOT here):
```typescript
// Renders the Copy/Send button to match current behavior. (TASK-18 will extend
// this for the empty-disabled + transient-Copied states — out of scope here.)
export function renderSendButton(btn: HTMLButtonElement, opts: { ready: boolean }): void {
  btn.textContent = opts.ready ? "Copied ✓" : "Copy";
  btn.style.background = opts.ready ? "#0a4" : "#0a7d34";
}
```

- [ ] **Step 3: `send-button.test.ts`** — pure DOM unit test:
```typescript
// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { renderSendButton } from "./send-button.js";

it("shows Copy when not ready", () => {
  const b = document.createElement("button");
  renderSendButton(b, { ready: false });
  expect(b.textContent).toBe("Copy");
});

it("shows Copied ✓ when ready", () => {
  const b = document.createElement("button");
  renderSendButton(b, { ready: true });
  expect(b.textContent).toBe("Copied ✓");
});
```

- [ ] **Step 4: Use them in `install.ts`** — replace the inline `var state = {...}` with `createOverlayState()`, and route the button writes through `renderSendButton(...)`. Keep every other behavior byte-identical.

- [ ] **Step 5: Verify.** `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, then the visual check from Task A4 Step 7 (overlay still identical).

- [ ] **Step 6: Commit.**
```bash
git add packages/core/src/overlay/state.ts packages/core/src/overlay/send-button.ts packages/core/src/overlay/send-button.test.ts packages/core/src/overlay/install.ts packages/core/src/cdp/overlay-source.generated.ts
git commit -m "refactor(overlay): extract state model + send-button render with unit tests (TASK-19)"
```

---

### Task B3: Extract the badge/card open-close logic as a testable unit

The second seam TASK-18 needs (the double-click bug lives here). Extract the open/close toggle into a pure-ish function over `(state, els)` so it's unit-testable, behavior-preserving.

**Files:**
- Create: `packages/core/src/overlay/card-toggle.ts` + `card-toggle.test.ts`
- Modify: `packages/core/src/overlay/install.ts`

- [ ] **Step 1: `card-toggle.ts`** — extract the badge `onclick` decision (`overlay-script.ts:126`) and `closeCard` state transition (`:114`) as functions taking explicit state, returning the intended action. Mirror current logic exactly (toggle on `state.open[id]`):
```typescript
import type { OverlayState } from "./state.js";

// Returns the action a badge click should take given current open-state.
// Mirrors current behavior (TASK-18 will change the rule; not here).
export function badgeClickAction(state: OverlayState, id: string): "open" | "close" {
  return state.open[id] ? "close" : "open";
}
```

- [ ] **Step 2: `card-toggle.test.ts`:**
```typescript
import { expect, it } from "vitest";
import { createOverlayState } from "./state.js";
import { badgeClickAction } from "./card-toggle.js";

it("opens a closed card", () => {
  const s = createOverlayState();
  expect(badgeClickAction(s, "a1")).toBe("open");
});

it("closes an open card", () => {
  const s = createOverlayState();
  s.open.a1 = true;
  expect(badgeClickAction(s, "a1")).toBe("close");
});
```

- [ ] **Step 3: Use it in `install.ts`** — the badge `onclick` calls `badgeClickAction(state, it.id)` and branches. Behavior unchanged.

- [ ] **Step 4: Verify + commit.** `pnpm typecheck && pnpm lint && pnpm test && pnpm build` + visual check.
```bash
git add packages/core/src/overlay/card-toggle.ts packages/core/src/overlay/card-toggle.test.ts packages/core/src/overlay/install.ts packages/core/src/cdp/overlay-source.generated.ts
git commit -m "refactor(overlay): extract badge/card toggle decision with unit tests (TASK-19)"
```

---

## Self-Review

**AC coverage:**
- *Overlay logic in real .ts modules (state, send render, badge toggle, card, host-global seams)* → Tasks A2 (probe/link seams), A3 (install), B2 (state + send-button), B3 (card-toggle).
- *esbuild step bundles to one IIFE string, wired into `pnpm build`; `OVERLAY_SOURCE` resolves to it* → Task A4 (script + build order + barrel).
- *Host globals still attach; parse-check + live integration green* → A2/A3 preserve attachment order; A4 Step 7 runs integration + visual.
- *happy-dom set up (per-file env, node default) + overlay logic unit-tested via `pnpm test`* → B1 (setup + smoke), B2/B3 (unit tests).
- *No behavior change vs current main; verified visually* → A4 Step 7 + B2/B3 Step 5 visual checks; Stage A is a verbatim lift.

**Placeholder scan:** The two `<<< paste … >>>` markers in A2/A3 are deliberate verbatim-copy instructions (the bodies are long, pre-existing, plain JS) — the executor copies the exact current source ranges cited, not freehand. Every other step has concrete code/commands.

**Type consistency:** `OverlayState` (B1/state.ts) is consumed by `card-toggle.ts` (B3) and `install.ts`. `installSelectionProbe`/`installBridgeLink`/`installOverlay` names are used consistently in `index.ts`. `renderSendButton(btn, {ready})` and `badgeClickAction(state, id)` signatures match their tests. `OVERLAY_SOURCE` export name preserved through the barrel.

**Scope guard:** This is a pure refactor — it must NOT implement any TASK-18 fix. The send-button keeps its current (no-disabled) behavior; the badge keeps its current (`state.open`-based) toggle. TASK-18 changes them afterward, test-first, against these new seams.

**Follow-up (not this task):** consider a CI/precommit guard that regenerates the bundle and fails if `overlay-source.generated.ts` is stale.
