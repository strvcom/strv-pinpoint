# Plain HTML/CSS example — non-React test fixture

**Task:** TASK-26
**Status:** Designed (approved 2026-06-11)

## Problem

Pinpoint's identity extraction (`window.__pinpointExtractSelection`) is built around the React
fiber tree. The only example app is `examples/vite-react`, so the **non-React path has never been
exercised end-to-end**. We want a framework-free example to confirm the overlay + the clipboard
loop still work, and that the extractor degrades gracefully where there is no fiber to walk.

The extractor already handles this: if no `__reactFiber$…` key is found on the element, `ancestry`
stays `[]` and `componentName` is `null`, while `selector`/`tagName`/`text`/`rect` are computed from
the DOM regardless. So this task **adds no core code** — it adds a non-React example plus a test
that proves and regression-guards that fallback.

## Goal

A pure HTML/CSS example (no framework runtime in the served page) that `/pinpoint:start` can drive,
and a gated integration test asserting the non-React extraction result.

## Design

### 1. Package & tooling

New workspace package `examples/html-css/` (auto-included via the `examples/*` glob in
`pnpm-workspace.yaml`):

- `package.json` — private, `type: module`, scripts: `"dev": "vite --port 5174"`,
  `"build": "vite build"` (keeps `pnpm -r build` green), `"preview": "vite preview"`. Single
  dev-dependency: `vite` (version matched to `examples/vite-react`). **No React, no framework.**
- `vite.config.ts` — `server: { port: 5174, strictPort: true }`. The distinct port avoids
  colliding with vite-react's 5173, and `strictPort` makes `/pinpoint:start`'s detection
  deterministic (Vite default + a config port → `http://localhost:5174`) instead of Vite silently
  hopping to another port.
- `index.html` + `styles.css`, **zero JavaScript** — the purest non-framework fixture (no fiber, no
  runtime). Vite serves a plain HTML page with a linked stylesheet and builds it with no JS entry.
- `README.md` — what it is, how to run, and that it exercises the non-React path.

### 2. Page content

A small, believable static page that also doubles as a fixture for the upcoming TASK-27/28 work:

- Semantic structure: `header > nav` (links), `main` with multiple `section`s (an `h1` and `h2`s,
  paragraphs, a `button`, a `form` with `label` + `input` + submit `button`, an `img`, a `ul > li`
  list), and a `footer`.
- **Deep nesting** for TASK-27's screenshot top/bottom resolution — e.g.
  `div.card > section > article > button`, so a region over it has an obvious outermost
  (`div.card`) and innermost (`button`).
- **Stable identifiers** for TASK-28 — `id`, `data-testid`, `aria-label`, and `role` sprinkled on a
  few elements.

The page renders cleanly via `styles.css` (basic layout/typography) so it is pleasant to click
through during manual verification.

### 3. Testing

- New gated test `packages/core/integration/html-css.integration.test.ts`, mirroring
  `vite.integration.test.ts`: connect via the CDP driver to the running html-css example, evaluate
  `window.__pinpointExtractSelection(document.querySelector(<known selector>))`, and assert the
  **non-React** result:
  - `componentName === null`
  - `ancestry` deep-equals `[]`
  - `tagName` is the element's tag (e.g. `"BUTTON"`)
  - `selector` is a non-empty string, and `rect`/`text` are populated.
  Integration tests are excluded from the default `vitest run` (per `vitest.config.ts`) and run
  manually with Chrome on `:9222` + the example up — same as the vite integration test. The test's
  header comment documents the exact run commands (example on `:5174`, headless Chrome on `:9222`).
- A documented **manual-verification** step: start the example, run `/pinpoint:start` (or
  `PIN_APP_URL=http://localhost:5174 pinpoint`), Pick an element, and confirm the pick → Send →
  paste loop works and the pasted JSON shows empty React identity with populated selector/text/tag.

### 4. Scope / non-goals

- **No core code changes** — the fallback already works; we prove and guard it.
- **No JavaScript** in the example (keeps it a clean non-framework fixture).
- **Not** wired into the default `vitest run` — integration tests stay gated, per existing
  convention.
- Does not implement TASK-27/28; it only provides a fixture that those tasks can reuse.

## Risks

- `strictPort: true` makes the example fail to start if `:5174` is occupied. That is the intended,
  loud behavior (better than a silent port hop that breaks URL detection); the README notes it.
- If a future change makes the extractor assume a fiber exists, this example's integration test
  catches the regression — which is the point.
