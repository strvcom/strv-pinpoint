# Overlay declarative render layer — design (TASK-21)

**Status:** design (brainstormed 2026-06-10). Authoritative for the implementation plan.
**Decided with the product owner:** library = **Preact + JSX**; scope = **behavior parity + fold in the 5 TASK-18 fixes**; **Shadow DOM** isolation is in (constraints below). Remaining details below were decided by best-assumption while the owner was away — see `## Assumptions`.

## Problem

The overlay is a single ~777-line `installOverlay()` closure (`packages/core/src/overlay/install.ts`) that braids DOM creation, inline styling, event wiring, host-element measurement, and a hand-rolled reconciler (`draw()` + `positionAll()`). It is hard for humans to reason about, and that manual reconciliation is the direct cause of the TASK-18 badge double-click bug. TASK-19 made the overlay modular + bundled + test-guarded; this task uses that foundation to replace the imperative render layer with a **declarative** one.

## Goals

1. Author the overlay UI declaratively with **Preact** (function components + `preact/hooks`), eliminating the manual `draw()`/`positionAll()` DOM reconciliation.
2. Decompose the monolith into small, single-purpose, independently testable units.
3. Isolate the overlay from the host app with a **Shadow DOM** root (styles no longer leak either direction).
4. **Behavior parity** with today's overlay, **plus** the 5 TASK-18 fixes implemented natively (TASK-18 is absorbed).
5. Preserve every external contract: host-page positioning, screenshot capture, the injected-IIFE/CDP delivery, the `window.__pinpoint*` globals, and zero **runtime** deps for the bridge.

## Non-goals

- No new UX beyond the 5 TASK-18 fixes (no new animations/keyboard nav/redesign).
- No change to the bridge server, clipboard flow, CDP connector, `selection-probe`, or `bridge-link` logic (the last two are reused verbatim from TASK-19).
- No change to `save-screenshots.ts` (the screenshot-hide mechanism keeps working — see below).

## Hard constraints (from the product owner)

- **C1 — Host-DOM positioning preserved.** Badges/cards must keep tracking picked elements' `getBoundingClientRect()` across scroll/resize/layout changes. `getBoundingClientRect` returns viewport coords and `position:fixed` inside a shadow root is viewport-relative, so tracking crosses the shadow boundary unchanged.
- **C2 — Screenshot capture unaffected.** The bridge hides the overlay before `Page.captureScreenshot` by injecting `<style id="__ppHide">[data-pinpoint]{visibility:hidden!important}</style>` (`save-screenshots.ts`). The new overlay mounts under a **single host `<div data-pinpoint>`**; `visibility:hidden` on that host hides its entire shadow subtree, so the existing mechanism keeps working **unchanged** (and now hides one element instead of many). `save-screenshots.ts` is not modified.
- **C3 — Lightweight + self-contained.** Stays a single IIFE injected via CDP; the bridge keeps **zero runtime deps** (Preact is a *build-time* dep bundled+tree-shaken into the IIFE string). Bundle stays small (Preact core+hooks ≈ 4–5 KB min+gz).

## Architecture

### Mounting & isolation
- The bundle entry (`index.tsx`) runs in the host page (injected via `Page.addScriptToEvaluateOnNewDocument` + `Runtime.evaluate`, behind the existing `__pinpointOverlayInstalled` + `readyState` guards).
- It installs the host-global seams first (`installSelectionProbe()`, `installBridgeLink()` — reused verbatim from TASK-19), then creates **one host element** `<div data-pinpoint>` appended to `document.documentElement`, attaches an **open** shadow root, injects the overlay stylesheet into that shadow root, and `render(<OverlayRoot/>, shadowRoot)`.
- All overlay DOM (toolbar/FAB, badges, cards, hover highlight, marquee, screenshot marks) lives **inside the shadow root**. Nothing else carries `data-pinpoint`; the single host does.

### Build
- `scripts/build-overlay.mjs` esbuild config gains `jsx: "automatic"`, `jsxImportSource: "preact"` (esbuild's native JSX transform — **no babel**). `bundle/format:"iife"/platform:"browser"/target:"es2020"` unchanged. Entry becomes `src/overlay/index.tsx`.
- `preact` added as a **devDependency** of `@pinpoint/core` (compiled into the IIFE; not a runtime dep of the shipped bridge).
- The committed `overlay-source.generated.ts` + barrel `overlay-script.ts` + `pnpm build` ordering are unchanged from TASK-19.

### State model
- A single **pure reducer** (`state/reducer.ts`) owns structural state: `mode`, `items[]` (each: `id, kind, componentName, ancestry, selector, tagName, text, rect, comment, wantScreenshot`, plus screenshot `pageX/pageY`), `open` (per-id), `fabOpen`, `ready`, `copied`, `nextId`, `batchId`, `lastPromptId`, `confirming`. Actions: `setMode`, `addElement`, `addScreenshot`, `setComment`, `toggleScreenshot`, `openCard`, `closeCard`, `deleteItem`, `clearAll`, `setFabOpen`, `markCopied`, `clearCopied`, `setDirty`, `consumeRunning`.
- `OverlayRoot` holds the reducer via `useReducer`. Structural state changes re-render; **high-frequency positioning does not go through the reducer** (see C1 / positioning).
- `state/serialize.ts` maps reducer state → the snapshot written to `window.__pinpointAnnotations` (and `__pinpointSelection`, `__pinpointRegion`), called in an effect whenever serialized-relevant state changes — replacing the old `sync()`/`serialize()`. The serialized shape is **byte-identical** to today's (`{batchId, ready, items:[{id, badge, componentName, ancestry, selector, tagName, text, rect, comment, wantScreenshot}]}`), so the bridge contract is unchanged.

### Positioning (imperative measurement, declarative structure)
- `hooks/usePositioning.ts`: a `requestAnimationFrame`-throttled loop (driven by `scroll`(capture)/`resize`/`mousemove` listeners on `document`, same triggers as today) that reads each item's live rect via `vrect(item)` (element `getBoundingClientRect` for `kind:"element"`, or stored page coords minus scroll for `kind:"screenshot"`), runs the **cluster + fan-out** math (verbatim port of today's `positionAll` clustering: group anchors within 18px, fan apart by 24px vertically when expanded, else stagger 4px; expand when mouse within 90px or any member open), and writes `left/top/transform/zIndex` **directly onto refs** (badge/card/box DOM nodes). This never triggers a Preact re-render. Components register their nodes via refs in a shared map keyed by item id.
- Structure (which badges/cards exist, open/closed) is declarative; *where* they sit is imperative measurement. This mirrors today's split and avoids vdom cost on scroll.

### Components (all under `src/overlay/components/`)
- `OverlayRoot.tsx` — owns reducer; renders `<Toolbar>`, `<HoverLayer>`, `<MarqueeLayer>`, and the `<MarksLayer>` (badges + cards); runs `usePositioning`, the picker, the screenshot-region capture, and the serialize effect; wires `__pinpointLink.init` (running-status → `consumeRunning` clears).
- `Toolbar.tsx` — the draggable FAB: `Fab` orb (✦) + collapsible `Pill` with Pick / Screenshot / Clear(trash) / **Copy** buttons. Drag via `useDrag`. Owns the Clear-all confirm panel.
- `CopyButton.tsx` — the Copy/Send button. **TASK-18 #1+#2:** `disabled` when `items.length === 0`; shows transient `Copied ✓` then reverts after 1600ms (a `copied` flag + timer effect); reverts immediately on edit (`setDirty`).
- `Badge.tsx` — one numbered badge; `onClick` toggles its card open/closed in **one click** (TASK-18 #3 — single source of truth in the reducer + a pointer guard so the card's focus-out close doesn't double-toggle).
- `Card.tsx` — annotation comment card: header (number, label, **camera toggle only for `kind:"element"`** — TASK-18 #4, minimize, delete-with-confirm), draggable, textarea (auto-focus, Shift+Enter minimizes, focus-out minimizes unless a delete-confirm is open or the badge was just pressed).
- `HoverLayer.tsx` — pick-mode element highlight (follows `elementFromPoint`).
- `MarqueeLayer.tsx` — screenshot drag rectangle.
- `MarksLayer.tsx` — renders `<Badge>` + `<Card>` per item; provides the ref registry to `usePositioning`.
- `ConfirmRow.tsx` — shared Cancel/confirm row (delete + clear-all).
- `icons.tsx` (SVG strings as components) and `styles.ts` (the shadow stylesheet text, ported from today's `<style>` + the inline cssCSS values).

### Hooks
- `usePositioning(items, mode, refs)` — the rAF measure/cluster/place loop (C1).
- `useDrag(onMove)` — pointer drag for the FAB and cards (verbatim port of the pointerdown/move/up logic).
- `usePicker(mode, dispatch)` — pick-mode `mousemove` (hover) + capture `click` → `__pinpointExtractSelection` → `addElement` (default `wantScreenshot:true` — TASK-18 #5).
- `useScreenshotRegion(mode, dispatch)` — screenshot-mode `mousedown/move/up` marquee → `addScreenshot` (`wantScreenshot:true`, writes `__pinpointRegion`).
- `useEscape(dispatch)` — Escape exits mode.

### TASK-18 fixes (folded in)
1. **Copy inactive when empty** → `CopyButton` `disabled={items.length===0}` + disabled styling.
2. **Transient "Copied ✓"** → `copied` flag set on copy, `setTimeout(…,1600)` clears it; edits clear it immediately.
3. **One-click badge toggle** → reducer `open[id]` is the single source of truth; `Badge.onClick` dispatches `openCard`/`closeCard` once; `Card` focus-out close is suppressed when the blur was caused by pressing that badge (pointerdown guard). The old `state.open`-vs-DOM desync cannot occur — the card renders iff `open[id]`.
4. **No redundant screenshot toggle** → camera control rendered only when `item.kind === "element"`.
5. **Pick includes screenshot by default** → `addElement` sets `wantScreenshot: true`.

## Testing

- **Reducer** (`reducer.test.ts`, node): pure, exhaustive — every action incl. the TASK-18 semantics (empty→disabled is a selector test; `copied` lifecycle; `open` toggle idempotence; element default `wantScreenshot:true`; screenshot items get no camera path).
- **serialize** (`serialize.test.ts`, node): reducer state → exact legacy snapshot shape (golden test pinning the bridge contract).
- **Components** (happy-dom, per-file `@vitest-environment happy-dom`): `CopyButton` (disabled when empty; Copy→"Copied ✓"→revert), `Card` (camera present for element, absent for screenshot; delete-confirm; Shift+Enter minimize), `Badge` (single-click open then close), `OverlayRoot` smoke (mounts into a shadow root, FAB present).
- **Positioning cluster math** extracted as a pure function (`clusterAnchors`) and unit-tested in node (happy-dom can't do layout; the rAF/measure wiring is covered by live verification).
- **Live verification** (manual/controller, like TASK-19): build, inject into the running example app via the worktree CLI, confirm pick/screenshot/comment/copy + drag + scroll-tracking + a real `Page.captureScreenshot` excludes the overlay.

## Risks & mitigations

- **Parity regressions** in the intricate behavior (clustering, drag, focus, confirm flows). *Mitigation:* the current `install.ts` is the behavior reference; port logic verbatim into hooks where it's imperative; broad happy-dom + reducer tests; live verification before merge; keep diffs reviewed (subagent spec+quality review per task).
- **Shadow-root event/focus quirks** (focus-out across shadow boundary, `elementFromPoint` returning the host). *Mitigation:* `elementFromPoint` is called on `document` and ignores overlay nodes via a host-contains check (today it checks `fab.contains`/`insideMarks`; now: ignore if the hit node is our host); focus-out uses `composedPath`/`relatedTarget` within the shadow.
- **esbuild + Preact automatic JSX** resolving `preact/jsx-runtime` inside the bundle. *Mitigation:* verified pattern; bundle sanity-check asserts the IIFE still contains the hallmark globals and is self-contained.

## File layout (target, under `packages/core/src/overlay/`)

```
index.tsx                     entry: probes/link + host+shadow mount + render(<OverlayRoot/>)
OverlayRoot.tsx
components/{Toolbar,Fab,CopyButton,Badge,Card,HoverLayer,MarqueeLayer,MarksLayer,ConfirmRow}.tsx
icons.tsx
styles.ts                     shadow stylesheet text
state/{reducer.ts, serialize.ts, types.ts, cluster.ts}  (+ .test.ts)
hooks/{usePositioning,useDrag,usePicker,useScreenshotRegion,useEscape}.ts
globals.ts                    (kept from TASK-19)
selection-probe.ts            (kept from TASK-19, verbatim)
bridge-link.ts                (kept from TASK-19, verbatim)
```
Removed/absorbed: `install.ts`, `index.ts`, `state.ts`, `send-button.ts`, `card-toggle.ts` (+ their tests) from TASK-19 — superseded by the above.

## Assumptions (made while owner asleep)

- **Open** shadow root (debuggable/testable; the bridge reads `window.__pinpoint*`, not the DOM, so open vs closed doesn't affect it).
- **Preact + `preact/hooks` only** — no `@preact/signals`. Structural state via `useReducer`; high-frequency positioning is imperative (refs), so signals aren't needed. Keeps deps minimal.
- Visual styling is **ported faithfully** (same colors, sizes, SVGs, animations) into a single shadow stylesheet + a few inline styles; no visual redesign.
- TASK-18 is **absorbed**: its card is marked Done (delivered via TASK-21) on merge; the stale `task-18--overlay-ui-improvements` worktree/branch (planned against the old architecture) is removed.
- Merge to `main` autonomously **only if** all gates + live verification pass convincingly; otherwise leave the branch for review rather than merge a risky change.
- The pre-existing stale integration test (`#hero-heading`) is **out of scope** (unrelated fixture drift); not fixed here.
