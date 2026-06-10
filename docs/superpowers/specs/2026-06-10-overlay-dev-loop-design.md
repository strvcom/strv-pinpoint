# Overlay dev loop: watch + teardown + auto re-inject

**Task:** TASK-22
**Status:** Designed (approved 2026-06-10)

## Problem

Iterating on the injected overlay is slow. Every tweak to `packages/core/src/overlay/**`
currently requires: `pnpm build` (regenerate the IIFE + rebundle `bin/pinpoint`) → restart the
bridge → reopen Chrome. There is no hot path.

True Vite HMR is not an option: the overlay is **not served by Vite**. It is authored as
Preact/TSX, bundled by esbuild into a single IIFE *string* (`OVERLAY_SOURCE`), and pushed into the
target page over CDP (`cdp-driver.ts:90` → `cdp-page.ts:24`:
`Page.addScriptToEvaluateOnNewDocument` + `Runtime.evaluate`). The bundle is opaque to the target
app's bundler — there is no module graph for Vite to hot-swap.

Re-injection is the right model, but two facts make a naive re-inject fail:

1. `index.tsx` guards on `window.__pinpointOverlayInstalled`, so re-running a *new* bundle is a
   silent no-op — it bails before mounting.
2. Even if the guard were cleared, re-injecting would **stack** a second overlay: a new host gets
   appended while the old host plus its document-level listeners (pointerup×2, escape, picker,
   screenshot-region, link.init, selection-probe, bridge-link) stay live.

So the enabling piece is a **teardown contract** that does not exist today.

## Goal

A dev-only hot loop: edit overlay source → see it in the already-open Chrome in well under a second,
with **no** bin rebuild, **no** bridge restart, **no** Chrome reopen. The shipped `bin/pinpoint`
stays a zero-dep, esbuild-bundled executable — esbuild must never be baked into it.

## Architecture

Two cooperating dev-only processes, launched together by one script:

```
pnpm dev:overlay
├─ esbuild ctx.watch()  packages/core/src/overlay/index.tsx
│     └─ writes packages/core/dist/overlay.iife.js   (raw IIFE, write:true)
└─ PIN_DEV=1 pinpoint
      └─ dev/overlay-watch module: fs.watch(dist/overlay.iife.js), debounced ~80ms
           └─ on change: page.reinject(preamble, freshSource) over the held CDP connection
```

Key boundaries:

- **esbuild stays a build-time tool.** The bridge only does `fs.watch` + `readFile` (Node
  builtins) — zero new runtime deps in the bin.
- **Production path untouched.** `build-overlay.mjs` still writes
  `src/cdp/overlay-source.generated.ts` for the bundled bin. `dist/overlay.iife.js` is a dev-only
  artifact (`dist/` is already gitignored). Default `pinpoint` (no `PIN_DEV`) never watches and
  behaves exactly as today; the bin has no source-tree dependency.
- **No HTTP surface added.** The bridge already holds the CDP connection, so re-inject happens over
  that connection — no `/reinject` endpoint, no auth concern.

### Dev artifact path resolution

Under `PIN_DEV`, the bridge resolves the watched file relative to the bundled CLI location
(`import.meta.url` of `bin/pinpoint` → `../../core/dist/overlay.iife.js`), which is correct when run
from the repo. `PIN_OVERLAY_FILE=<abs path>` overrides it. If the file is missing at startup, the
watcher logs a warning and stays idle until the file appears (esbuild's first build creates it).

## The teardown contract (core piece)

`installOverlayApp()` in `index.tsx` installs a global teardown alongside the existing guard:

```js
window.__pinpointTeardown = () => {
  render(null, mount);   // Preact runs every useEffect cleanup → removes OverlayRoot's document
                         //   listeners (pointerup×2, escape, picker, screenshot-region, link.init)
  host.remove();         // removes the single [data-pinpoint] host + shadow root
  disposeProbe();        // selection-probe listeners
  disposeLink();         // bridge-link listeners
  delete window.__pinpointOverlayInstalled;
  delete window.__pinpointTeardown;
};
```

Requires refactoring `installSelectionProbe()` and `installBridgeLink()` to **return disposers**
(today they register listeners and return nothing).

**Acceptance bar:** after teardown the page has zero pinpoint DOM nodes and zero pinpoint
listeners — verified in happy-dom by spying on `add/removeEventListener` (balanced) and asserting
`document.querySelectorAll('[data-pinpoint]').length === 0`.

Any listener registered outside a Preact `useEffect` cleanup (in the hooks `usePicker`,
`useScreenshotRegion`, `useEscape`, or in the probe/link installers) must be audited to ensure it is
removed by teardown. Hooks that already register via `useEffect` with a cleanup are covered by
`render(null, mount)`; the audit confirms no listener escapes.

## Re-inject sequence (`cdp-page.ts`)

New `page.reinject(preamble, source)`:

1. `Runtime.evaluate("window.__pinpointTeardown?.()")` — clean unmount; clears the guard.
2. `Runtime.evaluate(preamble + source)` — re-runs `installOverlayApp`; guard is clear, so exactly
   one overlay mounts.
3. **Refresh the on-new-document script:** `Page.removeScriptToEvaluateOnNewDocument(oldId)` +
   `addScriptToEvaluateOnNewDocument(newSource)`, storing the new id. Without this, a manual page
   reload would re-run the *stale* bootstrap registered at boot. `injectBootstrap` is updated to
   capture and store the script identifier so `reinject` can swap it.

`preamble` is the same `window.__pinpointConfig = {...}` line the driver builds at boot; the watcher
passes it into `reinject(preamble, source)` so the re-injected bundle keeps the same bridge
URL + session id.

## Units

| Unit | Change |
|---|---|
| `overlay/index.tsx` | install `__pinpointTeardown`; capture `mount`/`host`/disposers in closure |
| `overlay/selection-probe.ts` | return a disposer fn |
| `overlay/bridge-link.ts` | return a disposer fn |
| `cdp/cdp-page.ts` | add `reinject(preamble, source)`; capture + swap the on-new-document script id in `injectBootstrap`/`reinject` |
| `dev/overlay-watch.ts` *(new, dev-only)* | `fs.watch` + debounce + `page.reinject`; isolated so the prod path never imports it |
| `cli.ts` | when `PIN_DEV` set, wire `overlay-watch` to the page after injection |
| `scripts/build-overlay.mjs` | add `--watch` mode (esbuild `context().watch()`) writing `dist/overlay.iife.js` |
| `scripts/dev-overlay.mjs` *(new)* | launches esbuild watch + spawns `PIN_DEV=1 pinpoint` (tiny launcher, no `concurrently` dep) |
| root `package.json` | `"dev:overlay"` script |

## Testing (TDD)

- **Teardown** (happy-dom): mount → teardown → 0 hosts, guard deleted, `add/removeEventListener`
  balanced.
- **Re-inject idempotency**: mount → teardown → re-inject → exactly one `[data-pinpoint]` host and
  one set of listeners.
- **Disposers**: `installSelectionProbe` / `installBridgeLink` return fns that remove what they
  added.
- **Watcher** (existing `fake-page.ts` + a temp file): write file → `reinject` called once with new
  contents, debounced; rapid writes coalesce into one call.
- **`reinject` sequence** (fake page): asserts order teardown-eval → eval-new → script-id swap.
- **Prod path unchanged**: default run (no `PIN_DEV`) registers no watcher; `cli.ts` does not import
  the watcher module unless `PIN_DEV` is set.

## Scope boundaries (YAGNI)

- **State resets on reload** — no hydration path. Re-picking an element is one click. Preservation
  can be added later if it bites.
- Dev-only; localhost; no HTTP endpoint added.
- The user still starts the target app and the bridge against it as usual; `dev:overlay` adds the
  watch + dev re-inject on top.

## Risks

- A listener registered outside Preact's `useEffect` cleanup would survive teardown and leak across
  reloads. Mitigated by the audit + the balanced-listener test.
- esbuild watch write may emit multiple `fs.watch` events per save; the ~80ms debounce coalesces
  them so re-inject fires once.
- If a rebuild produces a syntactically broken bundle, `Runtime.evaluate` throws; `reinject` catches,
  logs the error, and leaves the previous overlay torn down (page shows no overlay until the next
  good build). Acceptable for a dev loop.
