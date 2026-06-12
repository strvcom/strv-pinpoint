# Driver Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the browser concerns out of `@pinpoint/core` into `@pinpoint/overlay`, `@pinpoint/driver-cdp`, and a composition-root `@pinpoint/cli`, so more drivers can be added without a dependency cycle — a pure structural refactor with no behavior change.

**Architecture:** Core keeps the engine (bridge server, sessions, annotations, clipboard, config, wire types) and the abstract `Driver`/`BridgePage` interfaces, depending on no driver. Concrete drivers depend on core (and on the overlay bundle); a top-level `@pinpoint/cli` names the concrete driver set and is the bin entry; `@pinpoint/claude-code` bundles that entry. The extraction order — **cli → driver-cdp → overlay** — keeps every intermediate commit acyclic, because the overlay-source *consumer* leaves core before the overlay UI does.

**Tech Stack:** pnpm workspaces, TypeScript (NodeNext), esbuild (overlay bundle + plugin bin), Preact (overlay), vitest (unit + live-browser integration), Biome.

**Reference spec:** `docs/superpowers/specs/2026-06-12-driver-packaging.md`

---

## Target package graph (acyclic — must hold at the end of every task)

```
@pinpoint/claude-code → @pinpoint/cli → { @pinpoint/core, @pinpoint/driver-cdp }
@pinpoint/driver-cdp  → { @pinpoint/core, @pinpoint/overlay }
@pinpoint/overlay     → @pinpoint/core   (TYPE-ONLY)
@pinpoint/core        → (nothing internal)
```

## Final module destinations (reference for all tasks)

| Module(s) | Final home |
|---|---|
| `server/*`, `annotations/*`, `clipboard/*`, `config/*`, `config.ts`, `types.ts`, `setup/*`, `index.ts` | **core** |
| `driver/driver.ts` (interfaces), `driver/page.ts` (`BridgePage`, relocated), `driver/fake-page.ts` (relocated) | **core** |
| `driver/cdp-driver.ts`, `cdp/cdp-connection.ts`, `cdp/cdp-page.ts`, `cdp/launch-chrome.ts`, `cdp/selection-probe.ts`, `cdp/overlay-script.ts` (+ tests) | **driver-cdp** |
| `overlay/*`, `scripts/build-overlay.mjs`, `scripts/dev-overlay.mjs`, the generated `OVERLAY_SOURCE`, `overlay/globals.ts` | **overlay** |
| `cli.ts`, the driver registry, `dev/overlay-watch.ts`, the `pinpoint` bin | **cli** |
| `integration/*.integration.test.ts` | **cli** |

## Key facts the executor must not rediscover

- `build-overlay.mjs` bundles `overlay/index.tsx` and (production mode) writes `OVERLAY_SOURCE` into a generated `.ts`; (watch mode) writes `dist/overlay.iife.js`. The generated file is **tracked**.
- The only non-overlay/non-cdp consumer of overlay code is `cdp/overlay-script.ts` (imports `overlay/globals.js` + the generated `OVERLAY_SOURCE`). No core engine file imports overlay globals.
- The only consumers of the `cdp/` folder from outside it are: `driver/cdp-driver.ts` (the impl) and the `BridgePage`-type / `FakePage` imports in `driver.ts`, `server/bridge-server.ts(+test)`, `annotations/save-screenshots.ts(+test)`, `dev/overlay-watch.ts(+test)`, integration tests. → `BridgePage`+`FakePage` are driver-agnostic and stay in core (Task 1 relocates them out of `cdp/`).
- `overlay/touched-selections.ts(+test)` is the only overlay file importing core (`import type { Rect, Selection } from "../types.js"`) — already type-only.
- `cli.ts` uses `pinpointPreamble` (from `cdp-driver`) and dynamically imports `dev/overlay-watch.js` under `PIN_DEV`, watching `../../core/dist/overlay.iife.js`.

## Conventions for every task

- Use `git mv` for moves (preserves history; keeps the diff readable).
- Node is on PATH via nvm: prefix commands with `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"` if `node`/`pnpm` is not found.
- After any package's files move, run that package's tests, then the full suite, before committing.
- New package `package.json` files are `"private": true` and `"version": "0.0.0"` (matches the repo; TASK-32 owns versioning).
- New package `tsconfig.json` extends `../../tsconfig.base.json` with `rootDir: src`, `outDir: dist`.

---

## Task 0: Baseline + typecheck-all

**Files:**
- Modify: `package.json` (root) — `typecheck` script
- Modify: `packages/core/package.json` — add `typecheck` script

- [ ] **Step 1: Capture the green baseline**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"; pnpm test`
Expected: `Test Files 37 passed (37)`, `Tests 283 passed (283)`.

Run: `pnpm typecheck && pnpm build`
Expected: both exit 0; `packages/claude-code/bin/pinpoint` is rewritten.

- [ ] **Step 2: Add a per-package typecheck script to core**

In `packages/core/package.json`, add to `"scripts"`:

```json
"typecheck": "tsc -p tsconfig.json --noEmit"
```

- [ ] **Step 3: Switch root typecheck to recurse**

In root `package.json`, replace the `typecheck` script:

```json
"typecheck": "pnpm -r typecheck"
```

- [ ] **Step 4: Verify typecheck still passes**

Run: `pnpm typecheck`
Expected: runs `@pinpoint/core typecheck`, exits 0. (`@pinpoint/claude-code` has no `typecheck` script yet — pnpm skips it; that's fine.)

- [ ] **Step 5: Commit**

```bash
git add package.json packages/core/package.json
git commit -m "chore(build): per-package typecheck script; root typecheck recurses (TASK-33)"
```

---

## Task 1: Relocate `BridgePage` + `FakePage` to a driver-agnostic core home

The `cdp/` folder will move wholesale to `driver-cdp` later, but `BridgePage` (the interface) and `FakePage` (its test double) are driver-agnostic and consumed by the core engine — so move them next to `driver/driver.ts` first. Intra-core; no package boundary changes.

**Files:**
- Move: `packages/core/src/cdp/page.ts` → `packages/core/src/driver/page.ts`
- Move: `packages/core/src/cdp/fake-page.ts` → `packages/core/src/driver/fake-page.ts`
- Modify (import fixups): `driver/driver.ts`, `driver/cdp-driver.ts`, `cdp/cdp-page.ts`, `cdp/cdp-connection.ts` (if it references page), `server/bridge-server.ts`, `server/bridge-server.test.ts`, `annotations/save-screenshots.ts`, `annotations/save-screenshots.test.ts`, `dev/overlay-watch.ts`, `dev/overlay-watch.test.ts`, `integration/*.integration.test.ts`

- [ ] **Step 1: Move the two files**

```bash
cd packages/core/src
git mv cdp/page.ts driver/page.ts
git mv cdp/fake-page.ts driver/fake-page.ts
```

- [ ] **Step 2: Find every importer**

Run from repo root:
```bash
grep -rn 'cdp/page\.js\|cdp/fake-page\.js' packages/core --include=*.ts
```
Expected: a list of the files in **Files** above.

- [ ] **Step 3: Rewrite the import paths**

For each hit, rewrite the specifier so it points at the new `driver/` location, adjusting the relative depth:
- files in `core/src/driver/*` → `"./page.js"` / `"./fake-page.js"`
- files in `core/src/cdp/*` → `"../driver/page.js"` / `"../driver/fake-page.js"`
- files in `core/src/server/*`, `core/src/annotations/*`, `core/src/dev/*` → `"../driver/page.js"` / `"../driver/fake-page.js"`
- files in `core/integration/*` → `"../src/driver/page.js"` / `"../src/driver/fake-page.js"`

Concrete example — `server/bridge-server.ts`:
```ts
// before
import type { BridgePage } from "../cdp/page.js";
// after
import type { BridgePage } from "../driver/page.js";
```

- [ ] **Step 4: Confirm no stale references remain**

Run: `grep -rn 'cdp/page\.js\|cdp/fake-page\.js' packages/core --include=*.ts`
Expected: no output.

- [ ] **Step 5: Typecheck + test**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck exits 0; `283 passed`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(core): relocate BridgePage + FakePage out of cdp/ into driver/ (TASK-33)"
```

---

## Task 2: Extract `@pinpoint/cli` (composition root)

Move the bin entry, the driver registry, and the dev-loop watcher into a new agent-agnostic package. Core temporarily re-exports `createCdpDriver` + `pinpointPreamble` so `cli` can import them from `@pinpoint/core` (these flip to `@pinpoint/driver-cdp` in Task 3).

**Files:**
- Create: `packages/cli/package.json`, `packages/cli/tsconfig.json`
- Move: `packages/core/src/cli.ts` → `packages/cli/src/cli.ts`
- Move: `packages/core/src/dev/overlay-watch.ts` → `packages/cli/src/overlay-watch.ts`
- Move: `packages/core/src/dev/overlay-watch.test.ts` → `packages/cli/src/overlay-watch.test.ts`
- Modify: `packages/core/src/index.ts` (temporary re-exports), `packages/core/package.json` (drop `bin`)

- [ ] **Step 1: Scaffold the package**

Create `packages/cli/package.json`:
```json
{
  "name": "@pinpoint/cli",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "bin": { "pinpoint": "./dist/cli.js" },
  "main": "./dist/cli.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "start": "node ./dist/cli.js"
  },
  "dependencies": {
    "@pinpoint/core": "workspace:*"
  }
}
```

Create `packages/cli/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 2: Move the files**

```bash
cd packages
mkdir -p cli/src
git mv core/src/cli.ts cli/src/cli.ts
git mv core/src/dev/overlay-watch.ts cli/src/overlay-watch.ts
git mv core/src/dev/overlay-watch.test.ts cli/src/overlay-watch.test.ts
rmdir core/src/dev 2>/dev/null || true
```

- [ ] **Step 3: Add temporary re-exports to core's public surface**

In `packages/core/src/index.ts`, add (these are removed in Task 3):
```ts
export * from "./types.js";
export { createCdpDriver, pinpointPreamble } from "./driver/cdp-driver.js";
export type { Driver, DriverSession, DriverConnectOptions, HealthResult } from "./driver/driver.js";
export type { BridgePage } from "./driver/page.js";
export { parseConfig } from "./config.js";
export { readPinpointConfig } from "./config/pinpoint-config.js";
export { resolveProfileDir } from "./config/profile-dir.js";
export { startBridgeServer } from "./server/bridge-server.js";
export { SessionRegistry } from "./server/sessions.js";
export { systemClipboard } from "./clipboard/write.js";
export { runSetup } from "./setup/run-setup.js";
```

- [ ] **Step 4: Rewrite `cli/src/cli.ts` imports to consume `@pinpoint/core`**

Replace the relative imports at the top of `cli.ts` with package imports. Example:
```ts
// before
import { systemClipboard } from "./clipboard/write.js";
import { createCdpDriver, pinpointPreamble } from "./driver/cdp-driver.js";
import { startBridgeServer } from "./server/bridge-server.js";
// after (collapse into one block from @pinpoint/core)
import {
  createCdpDriver, pinpointPreamble, parseConfig, readPinpointConfig,
  resolveProfileDir, startBridgeServer, SessionRegistry, systemClipboard, runSetup,
} from "@pinpoint/core";
import type { Driver, DriverSession } from "@pinpoint/core";
```
Update the `PIN_DEV` dynamic import: `await import("./dev/overlay-watch.js")` → `await import("./overlay-watch.js")`.
Leave the `PIN_OVERLAY_FILE` default path (`../../core/dist/overlay.iife.js`) for now — Task 4 repoints it to the overlay package.

- [ ] **Step 5: Rewrite `cli/src/overlay-watch.ts` + its test imports**

```ts
// overlay-watch.ts — before
import type { BridgePage } from "../driver/page.js";
// after
import type { BridgePage } from "@pinpoint/core";
```
In `overlay-watch.test.ts`: `import { FakePage } from "../driver/fake-page.js"` → `import { FakePage } from "@pinpoint/core"`. (Core's `index.ts` already exports `BridgePage`; add `FakePage` to the export block in Step 3 if the test imports it as a value — `export { FakePage } from "./driver/fake-page.js";`.)

- [ ] **Step 6: Drop the bin from core**

In `packages/core/package.json`, remove the `"bin"` block (the `pinpoint` bin now lives in `@pinpoint/cli`). Keep `"main": "./dist/index.js"`.

- [ ] **Step 7: Install + typecheck + test**

Run: `pnpm install` (links the new `@pinpoint/cli` workspace package).
Run: `pnpm typecheck && pnpm test`
Expected: typecheck exits 0; `283 passed` (overlay-watch's 3 tests now run under `@pinpoint/cli`).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: extract @pinpoint/cli composition root (cli + dev overlay-watch + bin) (TASK-33)"
```

---

## Task 3: Extract `@pinpoint/driver-cdp`

Move the concrete CDP mechanism and the `Driver` impl. It imports the `BridgePage`/`Driver` interfaces and (temporarily) the overlay `OVERLAY_SOURCE`/globals from `@pinpoint/core`; `cli`'s driver imports flip from core to `driver-cdp`. After this task **core depends on nothing internal**.

**Files:**
- Create: `packages/driver-cdp/package.json`, `packages/driver-cdp/tsconfig.json`
- Move: `packages/core/src/driver/cdp-driver.ts(+.test.ts)` → `packages/driver-cdp/src/`
- Move: `packages/core/src/cdp/{cdp-connection,cdp-page,launch-chrome,selection-probe,overlay-script}.ts` (+ their `.test.ts`) → `packages/driver-cdp/src/`
- Modify: `packages/core/src/index.ts` (drop the cdp re-exports), `packages/cli/src/cli.ts` (import driver from `@pinpoint/driver-cdp`)

- [ ] **Step 1: Scaffold the package**

Create `packages/driver-cdp/package.json`:
```json
{
  "name": "@pinpoint/driver-cdp",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@pinpoint/core": "workspace:*"
  }
}
```

Create `packages/driver-cdp/tsconfig.json` (same shape as `cli`'s, excluding tests).

- [ ] **Step 2: Move the files (flatten `cdp/` into `driver-cdp/src/`)**

```bash
cd packages
mkdir -p driver-cdp/src
git mv core/src/driver/cdp-driver.ts driver-cdp/src/cdp-driver.ts
git mv core/src/driver/cdp-driver.test.ts driver-cdp/src/cdp-driver.test.ts
git mv core/src/cdp/cdp-connection.ts driver-cdp/src/cdp-connection.ts
git mv core/src/cdp/cdp-connection.test.ts driver-cdp/src/cdp-connection.test.ts
git mv core/src/cdp/cdp-page.ts driver-cdp/src/cdp-page.ts
git mv core/src/cdp/cdp-page.test.ts driver-cdp/src/cdp-page.test.ts
git mv core/src/cdp/launch-chrome.ts driver-cdp/src/launch-chrome.ts
git mv core/src/cdp/launch-chrome.test.ts driver-cdp/src/launch-chrome.test.ts
git mv core/src/cdp/selection-probe.ts driver-cdp/src/selection-probe.ts
git mv core/src/cdp/overlay-script.ts driver-cdp/src/overlay-script.ts
# overlay UI + the generated source + globals stay in core for now (Task 4 moves them)
ls core/src/cdp   # expect only: overlay-source.generated.ts
```

- [ ] **Step 3: Create the package barrel**

Create `packages/driver-cdp/src/index.ts`:
```ts
export { createCdpDriver, pinpointPreamble } from "./cdp-driver.js";
```

- [ ] **Step 4: Rewrite imports inside `driver-cdp/src/*`**

- Cross-cdp relative imports stay relative but flatten (`../cdp/cdp-page.js` → `./cdp-page.js`).
- Interface imports point at core: `../driver/page.js` / `../driver/driver.js` → `@pinpoint/core`; `../types.js` → `@pinpoint/core`.
- `overlay-script.ts` still needs the overlay bundle + globals, which are **still in core** this task. Have core re-export them (Step 6) and import from `@pinpoint/core`:
```ts
// overlay-script.ts — before
import { ... } from "../overlay/globals.js";
export { OVERLAY_SOURCE } from "./overlay-source.generated.js";
// after
import { ... } from "@pinpoint/core";
export { OVERLAY_SOURCE } from "@pinpoint/core";
```

- [ ] **Step 5: Point `cli` at the new driver package**

In `packages/cli/package.json` `dependencies`, add `"@pinpoint/driver-cdp": "workspace:*"`.
In `packages/cli/src/cli.ts`, move `createCdpDriver` + `pinpointPreamble` off the `@pinpoint/core` import and onto a new `import { createCdpDriver, pinpointPreamble } from "@pinpoint/driver-cdp";`.

- [ ] **Step 6: Adjust core's public surface**

In `packages/core/src/index.ts`:
- Remove `export { createCdpDriver, pinpointPreamble } from "./driver/cdp-driver.js";` (the file is gone).
- Add temporary overlay re-exports (removed in Task 4) so `driver-cdp` can read them from core:
```ts
export { OVERLAY_SOURCE } from "./cdp/overlay-source.generated.js";
export * from "./overlay/globals.js";
```
Keep the interface/engine exports (`Driver`, `BridgePage`, `parseConfig`, `startBridgeServer`, etc.).

- [ ] **Step 7: Install + typecheck + test + build**

Run: `pnpm install && pnpm typecheck && pnpm test && pnpm build`
Expected: typecheck exits 0; `283 passed` (cdp tests now under `@pinpoint/driver-cdp`); `pnpm build` exits 0 and rebuilds `packages/claude-code/bin/pinpoint` (the esbuild bundle now pulls cli → core → driver-cdp). The `bin/pinpoint` artifact is **tracked** — its rebuilt version must be committed in Step 9 (`git add -A` covers it).

- [ ] **Step 8: Verify the graph is acyclic**

Run: `grep -n '"@pinpoint' packages/core/package.json`
Expected: **no** `@pinpoint/*` dependency in core (core depends on nothing internal).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: extract @pinpoint/driver-cdp (cdp mechanism + Driver impl); core depends on no driver (TASK-33)"
```

---

## Task 4: Extract `@pinpoint/overlay`

Move the Preact UI, the overlay build, the generated `OVERLAY_SOURCE`, and `globals`. `driver-cdp` flips its overlay imports from `@pinpoint/core` to `@pinpoint/overlay`; core stops re-exporting overlay. Final graph reached.

**Files:**
- Create: `packages/overlay/package.json`, `packages/overlay/tsconfig.json`, `packages/overlay/src/source.ts` (consumer entry)
- Move: `packages/core/src/overlay/*` → `packages/overlay/src/*`; `packages/core/scripts/build-overlay.mjs` + `dev-overlay.mjs` → `packages/overlay/scripts/`; `packages/core/src/cdp/overlay-source.generated.ts` → `packages/overlay/src/overlay-source.generated.ts`
- Modify: `packages/driver-cdp/src/overlay-script.ts`, `packages/driver-cdp/package.json`, `packages/core/src/index.ts` (drop overlay re-exports), `packages/core/package.json` (drop `preact`/`esbuild` overlay devDeps + `build-overlay` step), `packages/cli/src/cli.ts` (`PIN_OVERLAY_FILE` default path), root `package.json` (`dev:overlay` path)

- [ ] **Step 1: Scaffold the package**

Create `packages/overlay/package.json`:
```json
{
  "name": "@pinpoint/overlay",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/source.js",
  "scripts": {
    "build": "node scripts/build-overlay.mjs && tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "dev": "node scripts/build-overlay.mjs --watch"
  },
  "dependencies": {
    "@pinpoint/core": "workspace:*"
  },
  "devDependencies": {
    "esbuild": "^0.28.0",
    "preact": "^10.24.0"
  }
}
```

Create `packages/overlay/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "jsx": "react-jsx", "jsxImportSource": "preact" },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["src/**/*.test.ts", "src/**/*.test.tsx"]
}
```

- [ ] **Step 2: Move the files**

```bash
cd packages
mkdir -p overlay/src overlay/scripts
git mv core/src/overlay/* overlay/src/
git mv core/src/cdp/overlay-source.generated.ts overlay/src/overlay-source.generated.ts
git mv core/scripts/build-overlay.mjs overlay/scripts/build-overlay.mjs
git mv core/scripts/dev-overlay.mjs overlay/scripts/dev-overlay.mjs
rmdir core/src/cdp core/src/overlay core/scripts 2>/dev/null || true
```

- [ ] **Step 3: Create the consumer entry (the package's `main`)**

Create `packages/overlay/src/source.ts`:
```ts
// Node-facing entry consumed by drivers: the built overlay string + the window-global constants.
export { OVERLAY_SOURCE } from "./overlay-source.generated.js";
export * from "./globals.js";
```

- [ ] **Step 4: Fix paths in `build-overlay.mjs`**

The script moved from `core/scripts/` to `overlay/scripts/`, and the UI entry is now `overlay/src/index.tsx`. Update the three path constants:
```js
const entry = join(here, "../src/index.tsx");
const distFile = join(here, "../dist/overlay.iife.js");
const generated = join(here, "../src/overlay-source.generated.ts");
```

- [ ] **Step 5: Fix the moved overlay files' core import**

`packages/overlay/src/touched-selections.ts` and its test:
```ts
// before
import type { Rect, Selection } from "../types.js";
// after
import type { Rect, Selection } from "@pinpoint/core";
```
Run `grep -rn 'from "\.\./types' packages/overlay/src` — expect no output after the fix.

- [ ] **Step 6: Flip `driver-cdp` overlay imports to the overlay package**

In `packages/driver-cdp/package.json` `dependencies`, add `"@pinpoint/overlay": "workspace:*"`.
In `packages/driver-cdp/src/overlay-script.ts`, change the `@pinpoint/core` overlay imports to `@pinpoint/overlay`:
```ts
import { /* REGION_GLOBAL, ... */ } from "@pinpoint/overlay";
export { OVERLAY_SOURCE } from "@pinpoint/overlay";
```

- [ ] **Step 7: Clean core**

In `packages/core/src/index.ts`, remove the two temporary overlay re-export lines added in Task 3 Step 6 (`OVERLAY_SOURCE`, `./overlay/globals.js`).
In `packages/core/package.json`: remove `preact` + `esbuild` from `devDependencies`, and remove the `node scripts/build-overlay.mjs &&` prefix from the `build` script (core no longer builds the overlay):
```json
"build": "tsc -p tsconfig.json"
```

- [ ] **Step 8: Repoint dev paths**

In `packages/cli/src/cli.ts`, the `PIN_DEV` default overlay path must resolve the overlay package's dist. Replace:
```ts
const overlayFile =
  process.env.PIN_OVERLAY_FILE ?? resolve(here, "../../core/dist/overlay.iife.js");
```
with a resolve against `@pinpoint/overlay`:
```ts
const overlayFile =
  process.env.PIN_OVERLAY_FILE ??
  fileURLToPath(new URL("../dist/overlay.iife.js", import.meta.resolve("@pinpoint/overlay")));
```
In root `package.json`, update `dev:overlay`:
```json
"dev:overlay": "node packages/overlay/scripts/dev-overlay.mjs"
```

- [ ] **Step 9: Install + build + typecheck + test**

Run: `pnpm install && pnpm build && pnpm typecheck && pnpm test`
Expected: build regenerates `packages/overlay/src/overlay-source.generated.ts`; typecheck exits 0; `283 passed`.

- [ ] **Step 10: Verify final acyclic graph**

Run:
```bash
grep -l '"@pinpoint' packages/*/package.json | xargs -I{} sh -c 'echo "== {} =="; grep "@pinpoint" {}'
```
Expected edges only: `overlay→core`, `driver-cdp→{core,overlay}`, `cli→{core,driver-cdp}`, `claude-code→core` (fixed in Task 6). No package lists a dependency that lists it back.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor: extract @pinpoint/overlay (UI + build + OVERLAY_SOURCE + globals); core is browser-free (TASK-33)"
```

---

## Task 5: Relocate the live-browser integration tests to `@pinpoint/cli`

The integration tests wire `startBridgeServer` (core) + `createCdpDriver` (driver-cdp) — the exact composition `cli` owns — so they belong there.

**Files:**
- Move: `packages/core/integration/*.integration.test.ts` → `packages/cli/integration/`
- Move: `packages/core/vitest.integration.config.ts` → `packages/cli/vitest.integration.config.ts`
- Modify: moved test imports

- [ ] **Step 1: Move the files**

```bash
cd packages
mkdir -p cli/integration
git mv core/integration/*.integration.test.ts cli/integration/
git mv core/vitest.integration.config.ts cli/vitest.integration.config.ts
rmdir core/integration 2>/dev/null || true
```

- [ ] **Step 2: Rewrite the moved tests' imports to package specifiers**

```ts
// before                                            // after
import { createCdpDriver } from "../src/driver/cdp-driver.js";   → from "@pinpoint/driver-cdp"
import type { DriverSession } from "../src/driver/driver.js";    → from "@pinpoint/core"
import { FakePage } from "../src/cdp/fake-page.js";              → from "@pinpoint/core"
import { startBridgeServer } from "../src/server/bridge-server.js"; → from "@pinpoint/core"
import { SessionRegistry } from "../src/server/sessions.js";     → from "@pinpoint/core"
import type { Rect, Selection } from "../src/types.js";          → from "@pinpoint/core"
```
Adjust `packages/cli/vitest.integration.config.ts` include globs to `integration/*.integration.test.ts` if it references a path.

- [ ] **Step 3: Build, then run the integration suite against a live browser**

Run: `pnpm build`
Run (from `packages/cli`): `pnpm exec vitest run -c vitest.integration.config.ts`
Expected: the live-browser loop tests pass (per `docs/superpowers/notes/phase1-manual-loop.md` prerequisites — a reachable Chrome/CDP).
If no browser is available in this environment, note it and defer this run to Task 6's manual verification, but still confirm `pnpm typecheck && pnpm test` (unit) stays green.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: relocate live-browser integration tests to @pinpoint/cli (TASK-33)"
```

---

## Task 6: Final verification

**Note:** The `@pinpoint/claude-code` esbuild entry + dependency repoint (originally planned here) was
pulled forward into **Task 2** (commit `9da0896`) to keep `pnpm build` green at every intermediate
commit — `packages/claude-code/package.json` already builds `../cli/src/cli.ts` and depends on
`@pinpoint/cli`. This task is now final whole-branch verification + decision log.

- [ ] **Step 1: Confirm the claude-code build is already repointed**

Run: `grep -n 'cli/src/cli.ts\|@pinpoint/cli' packages/claude-code/package.json`
Expected: the `build` script references `../cli/src/cli.ts` and the dependency is `@pinpoint/cli` (done in Task 2). If not, apply the change here.

- [ ] **Step 2: Full clean build + all gates**

Run: `pnpm install && pnpm build && pnpm typecheck && pnpm test && pnpm lint`
Expected: all exit 0; `283 passed`; `packages/claude-code/bin/pinpoint` is produced as a single esbuilt file (all referenced packages — core, cli, driver-cdp, overlay's `OVERLAY_SOURCE` — bundled in).

- [ ] **Step 3: Smoke-test the bundled bin**

Run: `node packages/claude-code/bin/pinpoint --help` (or with no live app, confirm it starts and prints the bridge/usage line without a module-resolution error).
Expected: no `ERR_MODULE_NOT_FOUND`; the CLI's own usage/error path runs (proves the bundle is self-contained).

- [ ] **Step 4: Manual plugin load (per CLAUDE.md local-dev)**

Per `CLAUDE.md`: `claude --plugin-dir ./packages/claude-code` after `pnpm build`. Confirm `/pinpoint:start` + `/pinpoint:setup` resolve and the bundled bridge launches. (If a live browser/app isn't available, document what was and wasn't exercised — do not claim the live loop passed if it wasn't run.)

- [ ] **Step 5: Record the decision row**

Append one row to `docs/decisions.md` capturing: drivers split into packages behind a composition root (`cli`), overlay extracted, extraction order chosen to stay acyclic, capture contract deliberately left unchanged (→ TASK-34).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "build(claude-code): bundle @pinpoint/cli entry; finalize driver packaging (TASK-33)"
```

---

## Done criteria

- `pnpm test` → 283 passing; `pnpm typecheck`, `pnpm lint`, `pnpm build` all green.
- Live-browser integration suite passes (or is explicitly documented as un-run with the reason).
- Packages exist: `@pinpoint/core` (no internal deps), `@pinpoint/overlay`, `@pinpoint/driver-cdp`, `@pinpoint/cli`, `@pinpoint/claude-code`; the dependency graph matches the target and is acyclic.
- `packages/claude-code/bin/pinpoint` builds from the `@pinpoint/cli` entry and runs self-contained.
- No behavior change: the click→comment→Send→clipboard→paste loop works exactly as before.
- TASK-32 merge note recorded (whoever lands second rebuilds `bin/pinpoint`).

## Out of scope (→ TASK-34)

`Capture` interface split, client-side `getDisplayMedia` capture, `@pinpoint/driver-bookmarklet`, multi-driver config selection beyond the single `cdp` default.
