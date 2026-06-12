# Driver packaging — split `@pinpoint/driver-cdp` + `@pinpoint/overlay` + `@pinpoint/cli` — design

**Task:** TASK-33 · **Date:** 2026-06-12 · **Status:** approved (brainstorm)

## Goal

Split the browser concerns out of `@pinpoint/core` into their own packages so we can add more
drivers (CDP today; bookmarklet, extension, other browsers later) **without a dependency cycle**.
This task is **packaging + composition root only** — pure structural refactor, no behavior change.
All 263 unit tests must stay green; the live-browser integration tests must still pass.

The capture-contract generalization (per-driver `Capture`, client-side `getDisplayMedia`) and the
bookmarklet driver are explicitly **out of scope** — they are TASK-34, which this task unblocks.

## Why now

The `Driver` interface already isolates browser acquisition behind a contract, but three things
still live in `core` that shouldn't:

1. The **concrete CDP driver** (`src/cdp/*`, `driver/cdp-driver`, `launch-chrome`) — a specific
   browser mechanism, not engine.
2. The **overlay** (`src/overlay/*`) — browser-side Preact UI + an esbuild string artifact; a
   distinct build output that multiple drivers will consume.
3. The **driver registry** — `buildDriver()` in `cli.ts` hardcodes `createCdpDriver`. This is the
   one true source of a future cycle (see below).

## The cycle, and the fix

A naive split (move the CDP driver to `@pinpoint/driver-cdp`, keep the registry in core) produces:

```
core → driver-cdp → core      ❌ cycle
```

because the driver imports core for the `Driver` interface while core imports the driver to build
it. Drivers depending on core (and on the overlay) is the **correct, downward** direction. The cycle
exists *only* because core names a concrete driver.

**Fix — composition root.** Core defines the *interfaces*; drivers *implement* them; a top-level
**`@pinpoint/cli`** package *names the concrete set* and is the bin entry. Core depends on no driver.

## Decisions (settled in brainstorm)

| Decision | Choice |
|---|---|
| Composition root | **Standalone `@pinpoint/cli`** (agent-agnostic): `cli.ts` + driver registry move here |
| Overlay | **Extracted to `@pinpoint/overlay`** (own esbuild bundle artifact) |
| `overlay → core` dependency | **Type-only** (wire/protocol types) — erased at build, zero runtime coupling into the browser bundle |
| CDP driver | **`@pinpoint/driver-cdp`** — owns `src/cdp/*`, `cdp-driver`, `launch-chrome`, the `CdpPage` impl of `BridgePage` |
| Capture contract | **Unchanged** — `BridgePage.screenshot*` stays server-side on the CDP page; the `Capture` split is TASK-34 |
| Registry | One entry (`cdp`, the default) for now; richer config-selection lands with TASK-34 |
| `claude-code` build | esbuild `../cli/src/cli.ts` → `bin/pinpoint` (re-pointed from `../core/src/cli.ts`) |
| `@pinpoint/protocol` types package | **Deferred** — type-only `overlay → core` is enough for now |

## Target package graph (acyclic — all arrows point down)

```
@pinpoint/claude-code   plugin: esbuild ../cli/src/cli.ts → bin/pinpoint; plugin.json + commands + skill
        │
        ▼
@pinpoint/cli           composition root (bin): cli.ts, driver registry, wires SessionRegistry + clipboard
        ├──────────────► @pinpoint/driver-cdp   implements Driver via CDP; injects the overlay bundle;
        │                        │               keeps today's server-side screenshot capture
        │                        ▼
        ▼               @pinpoint/overlay        browser-side Preact UI → bundled string artifact
@pinpoint/core ◄────────────────┘     ▲          (depends on core TYPE-ONLY: wire/protocol types)
   engine: bridge server, sessions,   │
   annotations, clipboard, config,    └─ overlay → core is type-only ⇒ no Node code in browser bundle
   wire/protocol types,
   Driver / BridgePage interfaces
   (depends on NO driver)
```

## Where each current `packages/core/src/*` lands

| Current location | Destination | Notes |
|---|---|---|
| `server/*`, `annotations/*`, `clipboard/*`, `config/*`, `config.ts`, `types.ts`, `setup/*` | **core** | the engine; unchanged |
| `driver/driver.ts` (interfaces), `cdp/page.ts` (`BridgePage` iface), `cdp/fake-page.ts` (test double) | **core** | the abstract contract + its test fake stay with the contract |
| `driver/cdp-driver.ts`, `driver/cdp-driver.test.ts` | **driver-cdp** | concrete impl |
| `cdp/cdp-connection.ts`, `cdp/cdp-page.ts`, `cdp/launch-chrome.ts`, `cdp/selection-probe.ts`, `cdp/overlay-script.ts`, `cdp/overlay-source.generated.ts` (+ their tests) | **driver-cdp** | CDP mechanism + the injected-overlay source it consumes |
| `overlay/*` (Preact UI, hooks, components, state, styles, icons), `scripts/build-overlay.mjs`, `scripts/dev-overlay.mjs`, `dev/overlay-watch.ts` | **overlay** | browser-side; owns its esbuild bundle |
| `cli.ts`, `buildDriver()` / registry, `index.ts` (bin) | **cli** | composition root |

**Open detail for the plan:** `overlay-source.generated.ts` is the built overlay string consumed by
`driver-cdp`. Decide whether `@pinpoint/overlay` exposes it as a build output that `driver-cdp`
imports, or whether the build writes it into `driver-cdp` directly. Prefer: `@pinpoint/overlay`
build emits the bundle; `driver-cdp` imports it from `@pinpoint/overlay`.

## Build & tooling wiring

- `pnpm-workspace.yaml` already globs `packages/*` — new dirs are auto-discovered.
- Each new package gets a `package.json` (`build` script), `tsconfig.json` extending the base.
- `pnpm -r build` ordering: pnpm topologically orders by workspace deps, so `overlay` →
  `driver-cdp` → `cli` → `claude-code` builds in the right order automatically.
- Root `typecheck` (`tsc -p packages/core/tsconfig.json --noEmit`) must become a `-r` / project-refs
  typecheck so the new packages are covered (decide: TS project references vs `pnpm -r typecheck`).
- `claude-code` build re-points its esbuild entry from `../core/src/cli.ts` to `../cli/src/cli.ts`.
- `dev:overlay` root script path moves to `@pinpoint/overlay`.
- Biome / lefthook unaffected (operate on all of `packages/`).

## Testing strategy (TDD, refactor-safe)

This is a move-don't-change refactor, so the safety net is the **existing tests travelling with their
code**. Per task in the plan: move a unit + its colocated `*.test.ts` together, fix imports, run that
package's tests green before moving the next. The CDP integration tests
(`packages/core/integration/*`) move to wherever they exercise — likely `cli` or `driver-cdp` — and
must pass unchanged against a live browser as the final gate.

## Risks / watch-outs

- **Hidden coupling:** something in `server`/`annotations` may import overlay or CDP internals
  directly (not just via the `Driver` interface). The move will surface these as broken imports —
  resolve by depending on the interface, not the concrete package, to avoid reintroducing the cycle.
- **Type-only discipline:** `overlay → core` must use `import type` only; a value import would pull
  Node engine code into the browser bundle. Lint/verify this.
- **Integration-test relocation:** they currently sit under `core/integration` and drive CDP; ensure
  they still find a live browser after moving and that vitest's integration config follows them.
- **TASK-32 coupling:** TASK-32 (in progress) commits the bundled `bin/pinpoint`. This task changes
  both the bundled artifact's contents *and* the esbuild entry path (`../cli/src/cli.ts`). Whichever
  merges second must rebuild `bin/pinpoint` and update the esbuild entry in `claude-code`'s build +
  any path TASK-32's workflow references. Flag at merge time.

## Out of scope (→ TASK-34)

- The `Capture` interface split (per-driver capture capability).
- Client-side `getDisplayMedia` capture path.
- `@pinpoint/driver-bookmarklet` and bookmarklet install UX.
- Multi-driver config selection beyond a single `cdp` default.
