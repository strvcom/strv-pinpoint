# Overlay declarative render layer — implementation plan (TASK-21)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. Spec: `docs/superpowers/specs/2026-06-10-overlay-declarative-render-design.md`. Behavior parity reference: the current `packages/core/src/overlay/install.ts` (765 lines) — cited by line range throughout; copy style strings / SVG / numeric constants from it verbatim.

**Goal:** Replace the imperative overlay (`install.ts` + manual `draw()/positionAll()`) with a Preact declarative render layer mounted in a Shadow DOM root, preserving all behavior + the bridge contracts, and folding in the 5 TASK-18 fixes.

**Architecture:** Preact function components (`preact` + `preact/hooks`, esbuild native JSX — no babel) render into an **open shadow root** on a single `<div data-pinpoint>` host. A pure `useReducer` owns structural state; a `requestAnimationFrame` loop does imperative host-element measurement + positioning via refs (never re-rendering on scroll). Host-global seams (`selection-probe`, `bridge-link`) reused verbatim from TASK-19.

**Tech Stack:** TypeScript (NodeNext, `.js`/`.jsx` specifiers), Preact (devDep, bundled), esbuild (`jsx:"automatic"`,`jsxImportSource:"preact"`), Vitest + happy-dom (per-file `@vitest-environment happy-dom`).

**Strategy — build new beside old, cut over last:** Phases P0–P4 add the new `*.tsx` modules + tests **without changing the bundle entry**, so `pnpm build`/`pnpm test` stay green throughout (esbuild JSX config only affects `.tsx`; the old `.ts` entry still builds). P5 flips the entry to `index.tsx`, deletes the old modules, regenerates the bundle. P6 is live verification. Commit after every task.

**Verification per task:** `pnpm typecheck && pnpm lint && pnpm test` green, `pnpm build` succeeds. Commit trailer (blank line then): `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Lefthook pre-commit runs — fix, never `--no-verify`. Node not on PATH by default: prepend `export PATH="/Users/lucas/.nvm/versions/node/v24.8.0/bin:$PATH"`.

**Shared contracts (every component task must conform):**

```typescript
// state/types.ts
export type Mode = "pick" | "screenshot" | null;
export type Kind = "element" | "screenshot";
export interface Item {
  id: string; kind: Kind;
  componentName: string | null; ancestry: string[];
  selector: string; tagName: string; text: string;
  rect: { x: number; y: number; width: number; height: number };
  pageX?: number; pageY?: number;          // screenshot kind only
  comment: string; wantScreenshot: boolean;
  cardOffset?: { x: number; y: number };   // user-dragged card delta
}
export interface OverlayState {
  mode: Mode; items: Item[]; open: Record<string, boolean>;
  fabOpen: boolean; ready: boolean; copied: boolean;
  nextId: number; batchId: number; lastPromptId: string | null;
  confirming: boolean; fab: { right: number; bottom: number };
}
export type Action =
  | { type: "setMode"; mode: Mode }
  | { type: "addElement"; data: Omit<Item,"id"|"comment"|"wantScreenshot"|"kind"> }
  | { type: "addScreenshot"; rect: Item["rect"]; pageX: number; pageY: number }
  | { type: "setComment"; id: string; comment: string }
  | { type: "toggleScreenshot"; id: string }
  | { type: "openCard"; id: string } | { type: "closeCard"; id: string }
  | { type: "deleteItem"; id: string }
  | { type: "clearAll" }
  | { type: "setFabOpen"; open: boolean }
  | { type: "setFabPos"; right: number; bottom: number }
  | { type: "markCopied" }   // sets ready=true, copied=true, batchId++
  | { type: "clearCopied" }  // copied=false
  | { type: "setConfirming"; confirming: boolean }
  | { type: "consumeRunning" }; // clears items/open/ready (running status)
// Note: any mutation of items/comment/wantScreenshot sets ready=false, copied=false (dirty).
```

The badge number for item `i` is `items.indexOf(it)+1` (1-based, by array order) — same as today.

---

## P0 — Toolchain (no entry change)

### Task 0: Preact dep + esbuild JSX config + toolchain smoke test

**Files:** `packages/core/package.json`, `packages/core/scripts/build-overlay.mjs`, `packages/core/src/overlay/__jsx-smoke.tsx` (temp), `packages/core/src/overlay/__jsx-smoke.test.tsx` (temp), `packages/core/tsconfig.json`.

- [ ] **Step 1:** Add `"preact": "^10.24.0"` to `@pinpoint/core` `devDependencies`; `pnpm install` (root).
- [ ] **Step 2:** In `tsconfig.json` add compilerOptions `"jsx": "react-jsx"`, `"jsxImportSource": "preact"` (so `tsc` typechecks `.tsx`). Keep everything else.
- [ ] **Step 3:** In `build-overlay.mjs` add to the esbuild call: `jsx: "automatic", jsxImportSource: "preact",`. Leave `entryPoints` pointing at `src/overlay/index.ts` (unchanged — still builds).
- [ ] **Step 4 (TDD):** Add a temporary `__jsx-smoke.tsx` exporting `export function Smoke() { return <div class="x">hi</div>; }` and `__jsx-smoke.test.tsx`:
```tsx
// @vitest-environment happy-dom
import { render } from "preact";
import { expect, it } from "vitest";
import { Smoke } from "./__jsx-smoke.js";
it("renders a preact component via esbuild jsx", () => {
  const host = document.createElement("div");
  render(<Smoke />, host);
  expect(host.querySelector(".x")?.textContent).toBe("hi");
});
```
- [ ] **Step 5:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — all green (proves preact + esbuild JSX + happy-dom + vitest JSX all work). Vitest needs JSX too: confirm `vitest.config.ts`/root resolves `.tsx`; if vitest doesn't transform JSX for preact, add `esbuild: { jsx: "automatic", jsxImportSource: "preact" }` to the root `vitest.config.ts` test config. (Vitest uses esbuild internally; this mirrors the build.)
- [ ] **Step 6:** Delete the two `__jsx-smoke*` files (they were a toolchain probe). `pnpm test` green. Commit everything in this task (package.json, lockfile, build-overlay.mjs, tsconfig.json, vitest.config.ts if changed). The smoke files are added-then-removed within the task; net commit = config only.

---

## P1 — State core (pure, fully unit-tested)

### Task 1: `state/types.ts` + `state/reducer.ts` + reducer tests
**Files:** `packages/core/src/overlay/state/types.ts`, `state/reducer.ts`, `state/reducer.test.ts`.
- [ ] **Step 1:** Create `types.ts` exactly as the "Shared contracts" block above.
- [ ] **Step 2 (TDD):** Write `reducer.test.ts` (node env) FIRST, covering: initial state (`createInitialState()` → matches today's `createOverlayState()` values: mode null, items [], open {}, fabOpen false, ready false, copied false, nextId 1, batchId 0, lastPromptId null, confirming false, fab {right:16,bottom:16}); `addElement` pushes an item with `id:"a"+nextId`, `comment:""`, `wantScreenshot:true` (TASK-18 #5), `kind:"element"`, increments nextId, sets `open[id]=true`, `ready=false`, `copied=false`; `addScreenshot` pushes `kind:"screenshot"`, `wantScreenshot:true`, sets open, dirty; `setComment` updates + dirties; `toggleScreenshot` flips + dirties; `openCard`/`closeCard` set `open[id]`; `deleteItem` removes item + `open[id]`; `clearAll` empties items/open + ready/copied false; `markCopied` → ready true, copied true, batchId+1; `clearCopied` → copied false; `consumeRunning` → items/open empty, ready false; dirty-on-mutation invariant (any items/comment/screenshot change ⇒ ready=false, copied=false).
- [ ] **Step 3:** Implement `reducer.ts`: `export function createInitialState(): OverlayState` and `export function reducer(s: OverlayState, a: Action): OverlayState` — pure, returns new state objects (no mutation). Make tests pass.
- [ ] **Step 4:** verify + commit.

### Task 2: `state/cluster.ts` (pure positioning math) + tests
**Files:** `state/cluster.ts`, `state/cluster.test.ts`.
- [ ] **Step 1 (TDD):** Test `clusterAnchors(anchors, opts)` where `anchors: {id, x, y}[]` and the algorithm is the verbatim port of `install.ts:535-558`: group anchors whose `x` and `y` are each within 18px of a cluster origin; for each cluster compute `multi = members>1`, and per member index `k` an offset `{ox,oy}`: if `multi && expanded` → `{0, k*24}`, else if `multi` → `{k*4, k*4}`, else `{0,0}`. `expanded` is passed in (derived from mouse-near OR any-open — that derivation stays in the hook, not here). Return per-anchor `{id, clusterX, clusterY, ox, oy, k, multi}`. Test: single anchor → no offset; two within 18px → one cluster, staggered; expanded → vertical fan `k*24`; two far apart → two clusters.
- [ ] **Step 2:** Implement; pass tests. **Step 3:** verify + commit.

### Task 3: `state/serialize.ts` (bridge-contract snapshot) + golden test
**Files:** `state/serialize.ts`, `state/serialize.test.ts`.
- [ ] **Step 1 (TDD):** `serializeState(state, vrect)` returns EXACTLY today's shape (`install.ts:207-227`): `{ batchId, ready, items: items.map((it,i) => ({ id, badge:i+1, componentName, ancestry, selector, tagName, text, rect:{x,y,width,height}, comment, wantScreenshot })) }` where `rect` comes from `vrect(it)` (injected, so testable without DOM). Also export `latestSelection(snapshot)` = last item or null. Golden test: given a 2-item state + a stub `vrect`, assert the exact object (pins the bridge contract).
- [ ] **Step 2:** Implement; pass. **Step 3:** verify + commit.

---

## P2 — Presentational pieces (happy-dom tested)

### Task 4: `styles.ts` + `icons.tsx`
**Files:** `styles.ts`, `icons.tsx`.
- [ ] **Step 1:** `styles.ts` exports `OVERLAY_CSS: string` = the stylesheet for the shadow root. Port the class rules from `install.ts:27-28` but DROP the `[data-pinpoint] ` prefix (the shadow root scopes them): `.pp-icon{...}`, `.pp-icon:hover{...}`, `.pp-icon.pp-active{...}`, `.pp-pill{...}`, `.pp-card{...}`, `.pp-badge{...}` — copy the declarations verbatim. Add `:host{ all: initial }` is NOT needed; instead add a base rule `*{box-sizing:border-box}` only if required by tests (optional). 
- [ ] **Step 2:** `icons.tsx` exports each SVG (`pick, shot, trash, camera, min, grip`) from `install.ts:13-20` as `Icon` components returning the SVG via `dangerouslySetInnerHTML` OR as JSX. Simplest faithful port: `export const ICON = { pick: "<svg…>", … }` (verbatim strings) and an `<Icon svg={ICON.pick}/>` helper using `dangerouslySetInnerHTML={{__html:svg}}` on a `<span style="display:inline-flex">`. Copy SVG strings verbatim.
- [ ] **Step 3:** verify (typecheck/lint) + commit. (No test needed for static assets; a trivial render test of `<Icon>` is optional.)

### Task 5: `components/ConfirmRow.tsx` + test
**Files:** `components/ConfirmRow.tsx`, `ConfirmRow.test.tsx`.
- [ ] Port `install.ts:251-273`. `<ConfirmRow yesLabel onYes onNo />` → a flex row with a "Cancel" button (`onNo`) and a `{yesLabel}` button (`onYes`), styles verbatim from those lines (Cancel `#3a3a3a`, yes `#b91c1c`). Each `onClick` calls `e.stopPropagation()` then the handler. happy-dom test: clicking each fires the right callback. Verify + commit.

### Task 6: `components/CopyButton.tsx` + test  — **TASK-18 #1 + #2**
**Files:** `components/CopyButton.tsx`, `CopyButton.test.tsx`.
- [ ] **Props:** `{ itemCount: number; copied: boolean; onCopy: () => void }`.
- [ ] **Render:** a `<button>` with base style from `install.ts:102-103`. **Disabled when `itemCount===0`** (TASK-18 #1): set `disabled`, and disabled styling (`background:#2a2a2a;color:#777;cursor:not-allowed;opacity:.55`). When enabled: `copied ? ("Copied ✓", bg #0a4) : ("Copy", bg #0a7d34)` (TASK-18 #2 — the transient flag lives in state; this component just reflects `copied`). `onClick`→`e.stopPropagation(); onCopy()`.
- [ ] **Tests (happy-dom):** itemCount 0 → `disabled` true, text "Copy"; itemCount>0, copied false → enabled, "Copy"; copied true → "Copied ✓", bg `#0a4`; clicking enabled calls `onCopy`; clicking when disabled does not. (The 1600ms revert is an OverlayRoot effect, tested in Task 13.) Verify + commit.

### Task 7: `components/Badge.tsx` + test — **TASK-18 #3 (one-click)**
**Files:** `components/Badge.tsx`, `Badge.test.tsx`.
- [ ] **Props:** `{ n: number; kind: Kind; isOpen: boolean; onToggle: () => void; onPressStart: () => void; nodeRef: (el: HTMLDivElement|null) => void }`.
- [ ] **Render:** a `<div class="pp-badge">` styled from `install.ts:367-370` (color `#22c55e` element / `#a855f7` screenshot via `kind`), `pointer-events:auto;cursor:pointer`, text `{n}`. `onClick`→`e.stopPropagation(); onToggle()`. `onPointerDown`→`onPressStart()` (feeds the TASK-18 focus-out guard). `ref={nodeRef}` registers the DOM node for positioning. Positioning (left/top/transform/z) is written imperatively by `usePositioning` via the registered node — Badge sets NO position styles itself.
- [ ] **Tests (happy-dom):** clicking calls `onToggle` once; pointerdown calls `onPressStart`; renders the number + the right color by kind. (Single-click semantics validated end-to-end in Task 13 because they depend on reducer `open` being the single source of truth.) Verify + commit.

### Task 8: `components/Card.tsx` + test — **TASK-18 #4 (no camera on screenshot)**
**Files:** `components/Card.tsx`, `Card.test.tsx`.
- [ ] **Props:** `{ item: Item; n: number; confirming: boolean; pressingBadge: boolean; onComment(v): void; onToggleScreenshot(): void; onMinimize(): void; onDelete(): void; onSetConfirming(b): void; onDragDelta(dx,dy): void; nodeRef, hbRef }`.
- [ ] **Render** (port `buildCard` `install.ts:383-526`): `<div class="pp-card">` (style from :390-393 minus the imperatively-set left/top — those come from positioning; keep the entry `opacity:0;transform:scale(.85)` and animate-in via an effect setting `opacity:1;transform:none` on mount, mirroring :518-521). Header (`:394-396`): number badge `hb` (ref `hbRef`, style :398-401), label (`item.componentName||item.tagName||"screenshot"`), **camera button ONLY when `item.kind==="element"`** (TASK-18 #4; style :410, `pp-active` when `item.wantScreenshot`, onClick→`onToggleScreenshot`), minimize (→`onMinimize`), delete (→ shows an inline confirm overlay using `<ConfirmRow yesLabel="Delete">`; on confirm `onDelete()`, on cancel hide overlay + refocus textarea; set `onSetConfirming(true/false)` around it — port :431-461). Header `onPointerDown` starts a drag that calls `onDragDelta` (port :467-486; ignore if target is a button). Textarea (`:487-508`): value=item.comment, `onInput`→`onComment(value)`, `onMouseDown/onClick` stopPropagation, Shift+Enter→`onMinimize()`; auto-focus + caret-to-end on mount (effect). **Focus-out** (`:510-513` + TASK-18 #3 guard): on `focusout`, if `confirming` or `pressingBadge` → ignore; else if focus left the card → `onMinimize()`.
- [ ] **Tests (happy-dom):** element item renders a camera button; screenshot item does NOT; typing fires `onComment`; clicking delete shows confirm, confirm fires `onDelete`; Shift+Enter fires `onMinimize`. Verify + commit.

### Task 9: `components/HoverLayer.tsx` + `components/MarqueeLayer.tsx`
**Files:** `components/HoverLayer.tsx`, `components/MarqueeLayer.tsx` (+ optional tests).
- [ ] `HoverLayer`: a `position:fixed;pointer-events:none` div, border `2px solid #4f8cff`, bg `rgba(79,140,255,.12)` (port `mkLayer` :45). Props `{ rect: Rect|null }` → shown at rect or `display:none`. `MarqueeLayer`: same but dashed border (:46), props `{ rect: Rect|null }`. Verify + commit.

### Task 10: `components/MarksLayer.tsx` + `components/Fab.tsx` + `components/Toolbar.tsx`
**Files:** `components/MarksLayer.tsx`, `Fab.tsx`, `Toolbar.tsx`.
- [ ] `MarksLayer` (props: `items, open, n-map, confirming, pressingBadge, handlers, registerNode`): a `position:fixed;inset:0;pointer-events:none` container (port `marks` :47-49) that maps items → an outline box (`createNodes` box :357-362) + `<Badge>`; and for each `open[id]` item a `<Card>`. Provides each node to a ref registry (`registerNode(id, kind, el)`). Renders nothing structural for closed cards. (No position styles here — positioning hook writes them.)
- [ ] `Fab`: the ✦ orb (`:112-116`) + collapsible `Pill` (`:69-72`) containing the grip handle (`:73-76`), Pick/Screenshot/Clear icon-buttons (`tbtn` :78-90 → small components or a shared `IconButton`), and `<CopyButton>`. Props: `{ fabOpen, mode, itemCount, copied, onToggleFab, onSetMode, onClear, onCopy, onOrbPointerDown, onHandlePointerDown }`. Orb click toggles fab (the open/close pill animation :139-155 via a small effect/class). `pp-active` on Pick/Screenshot per `mode`.
- [ ] `Toolbar`: positions the Fab (anchored right/bottom from `fab` state via `setFabPos` math :120-129), owns the Clear-all confirm panel (`clearAnnotations` :276-313 → a panel with `<ConfirmRow yesLabel="Clear all">`), and wires FAB drag (`useDrag`) updating `fab` pos. Props pass through to `Fab`.
- [ ] verify + commit (a light render test that Toolbar shows the orb and, when `fabOpen`, the pill with 4 buttons).

---

## P3 — Hooks (imperative glue)

### Task 11: `hooks/useDrag.ts`, `hooks/useEscape.ts`, `hooks/usePositioning.ts`
**Files:** `hooks/useDrag.ts`, `hooks/useEscape.ts`, `hooks/usePositioning.ts` (+ tests where pure).
- [ ] `useDrag(onDelta: (dx,dy)=>void, opts?)` — returns a `pointerdown` handler that tracks pointermove (capture) and reports deltas, ending on pointerup; ports the FAB/card drag bookkeeping (:160-184, :467-486) incl. a `>3px` move threshold flag for the FAB (to suppress the orb click after a drag, :131-137,171). 
- [ ] `useEscape(onEscape)` — document keydown(capture); Escape → `onEscape()` (:727-733).
- [ ] `usePositioning({ itemsRef, openRef, modeRef, mouseRef, fabOpen, registry })` — a rAF-throttled loop bound to `scroll`(capture)/`resize`/`mousemove`(capture) (:610-631). On each tick: if `!fabOpen` hide marks and return; compute each item's `vrect` (port :194-206), build anchors `{id, x, y:max(0,r.y-18)}`, derive `expanded` per cluster (`multi && (mouseNear<90 || anyOpen)` :552-557), call `clusterAnchors`, then write `left/top/width/height` to each box, `left/top/transform/zIndex` to each badge, and `left/top` (+ `cardOffset`) to each open card + its `hb` number (port :563-591) using the DOM nodes from `registry`. Pure `vrect` extracted + unit-tested; the rAF wiring covered by live verification.
- [ ] verify + commit.

### Task 12: `hooks/usePicker.ts` + `hooks/useScreenshotRegion.ts` — **TASK-18 #5**
**Files:** `hooks/usePicker.ts`, `hooks/useScreenshotRegion.ts`.
- [ ] `usePicker({ mode, hostEl, onHover, onPick })` — document `mousemove`(capture): in pick mode, `el=elementFromPoint`; ignore if `!el || el===hostEl || hostEl.contains(el)` (shadow-host check replaces today's `fab.contains||insideMarks` :638); else `onHover(el.getBoundingClientRect())`. document `click`(capture): in pick mode, ignore host hits, else `preventDefault/stopPropagation`, `el=elementFromPoint`, `data=window.__pinpointExtractSelection(el)`, `onPick(data)` (→ dispatch `addElement`; reducer sets `wantScreenshot:true` per TASK-18 #5). (:633-665)
- [ ] `useScreenshotRegion({ mode, hostEl, onMarquee, onCapture })` — document mousedown/mousemove/mouseup(capture) in screenshot mode, ignoring host hits; draws marquee rect via `onMarquee`, and on mouseup if `>6px` both dims calls `onCapture(rect)` (→ dispatch `addScreenshot`; also writes `window.__pinpointRegion` — do that in OverlayRoot). (:667-725)
- [ ] verify + commit.

---

## P4 — Root + entry

### Task 13: `OverlayRoot.tsx` + test — wires everything, **TASK-18 #2 timer**, serialize effect, link.init
**Files:** `OverlayRoot.tsx`, `OverlayRoot.test.tsx`.
- [ ] `OverlayRoot({ hostEl })`: `useReducer(reducer, undefined, createInitialState)`; refs for items/open/mode/mouse (kept in sync via effects for the positioning hook); a ref registry (`Map<id,{box,badge,card,hb}>`) + `registerNode`; `pressingBadge` ref. Renders `<Toolbar>`, `<HoverLayer>`, `<MarqueeLayer>`, `<MarksLayer>`. Runs `usePositioning`, `usePicker`, `useScreenshotRegion`, `useEscape`, FAB/card drag.
- [ ] **Serialize effect:** on change to items/comment/wantScreenshot/ready/batchId, write `window[ANNOTATIONS_GLOBAL]=serializeState(state, vrect)` and `window[SELECTION_GLOBAL]=latestSelection(...)` (replaces `sync()`). Use the SAME `vrect` as positioning.
- [ ] **Copy flow (`doSend`, :735-747 + TASK-18 #2):** on Copy: dispatch `markCopied`, write serialized snapshot, call `window.__pinpointLink?.send(serialized.items)` (store `lastPromptId`), start a 1600ms timer → dispatch `clearCopied`. Any dirtying action clears `copied` via the reducer (immediate revert).
- [ ] **Screenshot region global:** on `addScreenshot`, also set `window[REGION_GLOBAL]=rect`.
- [ ] **Link running-status (`:750-763`):** `useEffect(()=> window.__pinpointLink?.init((promptId,status)=>{ if(status==="running" && promptId===lastPromptId.current) dispatch({type:"consumeRunning"}); }), [])`.
- [ ] **Tests (happy-dom):** mounting renders the FAB orb; opening the FAB (set fabOpen) shows the pill; after a simulated `addElement` the Copy button enables; copying sets "Copied ✓" then (fake timers) reverts after 1600ms; editing a comment reverts immediately; serialized `window.__pinpointAnnotations` matches the golden shape after add. Verify + commit.

### Task 14: `index.tsx` — shadow mount entry (NOT yet the build entry)
**Files:** `index.tsx`.
- [ ] Port the install guard (`:9-10`) + readyState wiring (from old `index.ts`). On install: `installSelectionProbe()`, `installBridgeLink()`; create `host=document.createElement("div"); host.setAttribute("data-pinpoint","1"); host.style.cssText="position:fixed;inset:0;pointer-events:none;z-index:2147483640"` (so fixed children are viewport-relative and the empty host never blocks page clicks); `document.documentElement.appendChild(host)`; `const root=host.attachShadow({mode:"open"})`; inject `<style>${OVERLAY_CSS}</style>` into `root`; `render(<OverlayRoot hostEl={host}/>, root)`. Guard with `__pinpointOverlayInstalled`. Keep `installOverlayApp()` exported + the `document.readyState==="loading"` guard calling it.
- [ ] verify (typecheck/lint/build — build still uses old entry, so `index.tsx` is just compiled by tsc) + commit.

---

## P5 — Cutover

### Task 15: Flip entry, delete old modules, regenerate bundle
**Files:** `build-overlay.mjs` (entry → `index.tsx`); delete `install.ts`, `index.ts`, `state.ts`, `send-button.ts`, `card-toggle.ts` + their `.test.ts`; barrel `overlay-script.ts` unchanged (still re-exports `OVERLAY_SOURCE` + globals).
- [ ] **Step 1:** `build-overlay.mjs` `entryPoints: [".../src/overlay/index.tsx"]`.
- [ ] **Step 2:** `git rm` the 5 old modules + their tests. Grep first to confirm nothing else imports them (`grep -rn "install.js\|/state.js\|send-button\|card-toggle\|overlay/index\b"`). `globals.ts`/`selection-probe.ts`/`bridge-link.ts` stay.
- [ ] **Step 3:** `node scripts/build-overlay.mjs` → regenerate `overlay-source.generated.ts`; commit the regenerated bundle (built in THIS canonical checkout). `pnpm build && pnpm typecheck && pnpm lint && pnpm test` green.
- [ ] **Step 4:** Bundle sanity: `grep` the generated file for `__pinpointExtractSelection`, `__pinpointLink`, `Copied`, `pp-card`, `attachShadow` — all present; confirm it starts as a self-contained IIFE. Confirm a second `pnpm build` leaves the generated file clean (reproducible in this checkout).
- [ ] **Step 5:** commit.

---

## P6 — Live verification (controller, before merge)

### Task 16: Inject into the running example app and confirm parity + fixes + screenshot
- [ ] Build the worktree CLI; relaunch the bridge from the worktree against the example app; in the browser confirm: FAB opens; **Pick** highlights + creates a green badge/card with the camera **on by default** (TASK-18 #5); typing a comment; **Copy** is disabled with zero annotations, shows "Copied ✓" briefly then reverts (TASK-18 #1/#2); minimizing then clicking the badge **reopens in one click** (TASK-18 #3); a **screenshot** region's card has **no camera button** (TASK-18 #4); badges/cards **track on scroll**; dragging the FAB + a card; Escape exits mode; Clear-all confirm. Then trigger a real `Page.captureScreenshot` (Copy with a wantScreenshot item) and confirm the saved PNG **excludes the overlay** (C2). Also run the live probe (`window.__pinpointExtractSelection` works) + assert `window.__pinpointAnnotations` shape.
- [ ] If all pass: proceed to finishing (merge). If any parity gap is found, fix on-branch (new task) and re-verify; only merge when clean.

---

## Self-Review

**Spec coverage:** declarative authoring + decomposition (P1–P4); Shadow DOM mount (Task 14); host-DOM positioning preserved (Task 11, C1); screenshot unaffected (Task 14 single `data-pinpoint` host + Task 16 verify, C2); lightweight/self-contained/zero-runtime-dep (Task 0 devDep + Task 15 bundle sanity, C3); the 5 TASK-18 fixes (Tasks 6,7,8,1,12); behavior parity (every task cites install.ts line ranges; Task 16 live verify); happy-dom tests (P1–P4). All covered.

**Placeholder scan:** style strings / SVGs / numeric constants are "copy verbatim from install.ts:NNN" — deliberate (long, pre-existing, must be byte-faithful), not vague TODOs. Contracts (types, serialize shape, reducer actions, component props) are spelled out. esbuild JSX + vitest JSX config is the one toolchain risk → Task 0 proves it before any component is built.

**Type consistency:** `OverlayState`/`Action`/`Item` defined once (Task 1) and referenced everywhere; `serializeState(state,vrect)` signature shared by Task 3 + Task 13; `registerNode(id,kind,el)` registry shared by MarksLayer (Task 10) + usePositioning (Task 11) + OverlayRoot (Task 13); `clusterAnchors` shared by Task 2 + Task 11.

**Scope guard:** pure migration + the 5 named TASK-18 fixes only. No bridge/connector/save-screenshots changes. The pre-existing `#hero-heading` integration-test drift is out of scope.
