# Annotation payload v2 (`selected[]`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat per-item identity fields with a `selected: Selection[]` array — one selection for element picks, outermost+innermost-per-stack for screenshots — across the overlay state, the wire contract (v2), and the paste skill.

**Architecture:** A `Selection` is identity-only (`selector`, `tagName`, `text`, `react|null`). The overlay state `Item` and the wire `Annotation`/`SerializedItem` both carry `selected: Selection[]` + `kind`. Screenshots resolve their selections with a new pure module that grid-samples `elementsFromPoint` and reduces each stack to its in-region-outermost + innermost endpoints, then maps each kept element through the existing extractor. Hard-cut to payload `version: 2`.

**Tech Stack:** TypeScript, Preact (overlay), Vitest + happy-dom (unit), Node http (bridge), esbuild (overlay bundle). Commands run via the login shell or with nvm node on PATH: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`.

**Spec:** `docs/superpowers/specs/2026-06-11-annotation-payload-v2-design.md`

**Conventions for every command below:** run from the worktree root
`/Users/lucas/code/repo/strv/open-source/pinpoint/.claude/worktrees/task-27--selected-array-v2`
with `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"` already exported. Commit with
`git -c core.hooksPath=/dev/null commit` (lefthook isn't installed in the worktree). End commit
messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File structure

| File | Responsibility / change |
|---|---|
| `packages/core/src/types.ts` | Add `Selection` (wire copy). Change `Annotation`: drop flat fields, add `kind` + `selected`. |
| `packages/core/src/overlay/state/types.ts` | Add `Selection` (overlay copy — structurally identical, mirrors the existing per-layer `Rect` duplication). Change `Item`: drop flat fields, add `selected`. Change `Action` `addElement`/`addScreenshot` to carry `selected`. |
| `packages/core/src/overlay/touched-selections.ts` | **NEW** pure module: `resolveTouchedSelections(region, deps)` → `Selection[]` (grid-sample + reduce + dedup + extract). |
| `packages/core/src/overlay/selection-probe.ts` | `__pinpointExtractSelection` returns `{ selector, tagName, text, rect, react: {componentName,ancestry}\|null }`. |
| `packages/core/src/overlay/state/reducer.ts` | `addElement`/`addScreenshot` store `selected`. |
| `packages/core/src/overlay/state/serialize.ts` | `SerializedItem`: drop flat fields, add `kind` + `selected`. |
| `packages/core/src/overlay/hooks/usePicker.ts` | (no shape change — still calls the extractor; the *consumer* maps it.) |
| `packages/core/src/overlay/components/OverlayRoot.tsx` | Pick → `selected:[oneSelection]`; screenshot → `resolveTouchedSelections` → `selected`. |
| `packages/core/src/overlay/components/Card.tsx` | Header label reads `selected[0]`. |
| `packages/core/src/overlay/hooks/usePositioning.ts` | Live-rect lookup reads `selected[0]?.selector`. |
| `packages/core/src/annotations/clipboard-payload.ts` | `version: 2`; emit `kind` + `selected` (drop flat). |
| `packages/core/src/annotations/save-screenshots.ts` | Branch on `kind` (element→selector, screenshot→clip rect). |
| `packages/claude-code/skills/pinpoint-paste/SKILL.md` | Read `version:2` + `item.selected[]`. |
| `packages/core/integration/loop.integration.test.ts` | Build a v2 item; assert `selected`. |

`Selection` is duplicated in `types.ts` (wire) and `overlay/state/types.ts` (overlay) on purpose —
the overlay layer is self-contained and already duplicates `Rect` the same way. Keep them
structurally identical; they describe the same JSON.

---

## Task 1: `Selection` type + touched-stack resolver (pure, additive)

**Files:**
- Modify: `packages/core/src/types.ts` (add `Selection` near `SelectionFound`)
- Modify: `packages/core/src/overlay/state/types.ts` (add `Selection`)
- Create: `packages/core/src/overlay/touched-selections.ts`
- Create: `packages/core/src/overlay/touched-selections.test.ts`

- [ ] **Step 1: Add the `Selection` type in both layers**

In `packages/core/src/types.ts`, add after the `SelectionFound` interface:
```ts
/** v2 annotation identity unit. `react` is null for plain (non-React) DOM.
 *  Extended additively by TASK-28 (source/identifiers). */
export interface Selection {
  selector: string;
  tagName: string;
  text: string;
  react: { componentName: string; ancestry: string[] } | null;
}
```

In `packages/core/src/overlay/state/types.ts`, add at the top (after `Kind`):
```ts
/** Identity unit (wire-mirrored in core types.ts — keep structurally identical). */
export interface Selection {
  selector: string;
  tagName: string;
  text: string;
  react: { componentName: string; ancestry: string[] } | null;
}
```

- [ ] **Step 2: Write the failing test for `resolveTouchedSelections`**

Create `packages/core/src/overlay/touched-selections.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import type { Selection } from "../types.js";
import { resolveTouchedSelections } from "./touched-selections.js";

// Minimal fake element: id (for assertions), rect, and a stack (innermost→outermost).
type FakeEl = { id: string; rect: { x: number; y: number; width: number; height: number } };
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h });

function makeDeps(opts: {
  stacksByPoint: FakeEl[][]; // returned by elementsFromPoint, in order, per sampled point
  host?: FakeEl;
}) {
  const points: FakeEl[][] = [...opts.stacksByPoint];
  return {
    elementsFromPoint: () => (points.length > 1 ? points.shift()! : points[0]) as unknown as Element[],
    getRect: (el: unknown) => (el as FakeEl).rect,
    isHost: (el: unknown) => !!opts.host && (el as FakeEl).id === opts.host.id,
    extract: (el: unknown) =>
      ({ selector: `#${(el as FakeEl).id}`, tagName: "DIV", text: "", react: null }) as Selection,
  };
}

describe("resolveTouchedSelections", () => {
  it("reduces a div.card > section > button stack to [card, button] (section dropped)", () => {
    const region = rect(0, 0, 100, 100);
    const button = { id: "button", rect: rect(10, 10, 20, 10) };
    const section = { id: "section", rect: rect(5, 5, 90, 90) };
    const card = { id: "card", rect: rect(0, 0, 100, 100) }; // fully inside region
    const deps = makeDeps({ stacksByPoint: [[button, section, card]] });
    const out = resolveTouchedSelections(region, deps);
    expect(out.map((s) => s.selector).sort()).toEqual(["#button", "#card"]);
  });

  it("dedups the same element across multiple sample points", () => {
    const region = rect(0, 0, 100, 100);
    const a = { id: "a", rect: rect(1, 1, 5, 5) };
    const card = { id: "card", rect: rect(0, 0, 100, 100) };
    const deps = makeDeps({ stacksByPoint: [[a, card], [a, card], [a, card]] });
    const out = resolveTouchedSelections(region, deps);
    expect(out.map((s) => s.selector).sort()).toEqual(["#a", "#card"]);
  });

  it("region smaller than its leaf yields a single selection (outermost = innermost)", () => {
    const region = rect(0, 0, 10, 10);
    const big = { id: "big", rect: rect(-50, -50, 500, 500) }; // overflows region
    const deps = makeDeps({ stacksByPoint: [[big]] });
    const out = resolveTouchedSelections(region, deps);
    expect(out.map((s) => s.selector)).toEqual(["#big"]);
  });

  it("skips the overlay host element", () => {
    const region = rect(0, 0, 100, 100);
    const host = { id: "host", rect: rect(0, 0, 100, 100) };
    const leaf = { id: "leaf", rect: rect(10, 10, 5, 5) };
    const deps = makeDeps({ stacksByPoint: [[host, leaf]], host });
    const out = resolveTouchedSelections(region, deps);
    expect(out.map((s) => s.selector)).toEqual(["#leaf"]);
  });

  it("blank region (no elements) yields []", () => {
    const out = resolveTouchedSelections(rect(0, 0, 10, 10), makeDeps({ stacksByPoint: [[]] }));
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `pnpm exec vitest run src/overlay/touched-selections`
Expected: FAIL — `resolveTouchedSelections` is not defined / module missing.

- [ ] **Step 4: Implement `touched-selections.ts`**

Create `packages/core/src/overlay/touched-selections.ts`:
```ts
import type { Selection } from "../types.js";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TouchedDeps {
  /** Native hit-test at a viewport point → stack innermost→outermost. */
  elementsFromPoint: (x: number, y: number) => Element[];
  /** Bounding rect of an element (viewport coords). */
  getRect: (el: Element) => Rect;
  /** True for the overlay host or anything inside it (skip these). */
  isHost: (el: Element) => boolean;
  /** Map a kept element to its Selection. */
  extract: (el: Element) => Selection;
}

const GRID = 5; // sample a GRID×GRID lattice across the region (corners included)

function fullyInside(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/** Sample the region, reduce each hit stack to its in-region-outermost + innermost
 *  endpoints, dedup by DOM node, and map each kept element to a Selection. */
export function resolveTouchedSelections(region: Rect, deps: TouchedDeps): Selection[] {
  const kept = new Set<Element>();
  const order: Element[] = [];
  const keep = (el: Element) => {
    if (!kept.has(el)) {
      kept.add(el);
      order.push(el);
    }
  };

  const stepX = region.width / (GRID - 1 || 1);
  const stepY = region.height / (GRID - 1 || 1);
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const x = region.x + (GRID === 1 ? region.width / 2 : stepX * i);
      const y = region.y + (GRID === 1 ? region.height / 2 : stepY * j);
      const stack = deps.elementsFromPoint(x, y).filter((el) => !deps.isHost(el));
      if (!stack.length) continue;
      const innermost = stack[0];
      // outermost = largest ancestor fully inside the region; fallback to innermost.
      let outermost = innermost;
      for (const el of stack) {
        if (fullyInside(deps.getRect(el), region)) outermost = el;
      }
      keep(innermost);
      keep(outermost);
    }
  }
  return order.map((el) => deps.extract(el));
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `pnpm exec vitest run src/overlay/touched-selections`
Expected: PASS (5 tests).

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm typecheck` (Expected: clean)
```bash
git add packages/core/src/types.ts packages/core/src/overlay/state/types.ts \
  packages/core/src/overlay/touched-selections.ts packages/core/src/overlay/touched-selections.test.ts
git -c core.hooksPath=/dev/null commit -m "feat(overlay): Selection type + touched-stack resolver (TASK-27)
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
> Note: `state/types.ts` `Selection` is added but `Item` is not changed yet — Task 3 wires it in.
> The build stays green because nothing consumes the new types yet.

---

## Task 2: Extractor returns `react` (selection-probe)

**Files:**
- Modify: `packages/core/src/overlay/selection-probe.ts` (return shape)
- Test: `packages/core/src/overlay/selection-probe.test.ts`

- [ ] **Step 1: Update the test to expect the `react` shape**

Open `packages/core/src/overlay/selection-probe.test.ts`. It currently asserts flat
`componentName`/`ancestry` on the extractor result. Replace those assertions so:
- a node with **no** React fiber → `result.react === null`, and `result.selector`/`tagName`/`text`
  are still populated;
- a node with a stubbed fiber chain (the test's existing fiber stub) → `result.react` deep-equals
  `{ componentName: "<first>", ancestry: ["<first>", ...] }`.

Concretely, change the existing assertions from:
```ts
expect(r.componentName).toBe(...);
expect(r.ancestry).toEqual(...);
```
to:
```ts
expect(r.react).toEqual({ componentName: ..., ancestry: [...] });
```
and for the fiber-less case add/keep:
```ts
expect(r.react).toBeNull();
expect(typeof r.selector).toBe("string");
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run src/overlay/selection-probe`
Expected: FAIL — `r.react` is undefined (extractor still returns flat fields).

- [ ] **Step 3: Update the extractor return**

In `packages/core/src/overlay/selection-probe.ts`, change the final `return` of
`__pinpointExtractSelection` from the flat shape to:
```ts
    var r = el.getBoundingClientRect();
    var react =
      ancestry.length > 0
        ? { componentName: ancestry[0], ancestry: ancestry.slice(0, 8) }
        : null;
    return {
      selector: selectorFor(el),
      tagName: el.tagName,
      text: ((el as any).innerText || el.textContent || "").trim().slice(0, 120),
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      react: react,
    };
```
(Removes the top-level `componentName`/`ancestry`; groups them under `react`, or `null` when no
component ancestry was found — covers plain DOM, AC #4. `rect` stays in the return for the caller.)

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run src/overlay/selection-probe`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/overlay/selection-probe.ts packages/core/src/overlay/selection-probe.test.ts
git -c core.hooksPath=/dev/null commit -m "feat(overlay): extractor returns react:{}|null (TASK-27)
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
> Build note: `OverlayRoot.onPick` still reads `d.componentName` (now undefined) and builds the old
> flat `addElement`. That compiles (the cast is optional-keyed) and existing reducer/serialize tests
> still pass on the old shape; Task 3 replaces the whole overlay shape in one coherent change. If you
> prefer zero intermediate behavior drift, do Tasks 2 and 3 back-to-back without testing the app in between.

---

## Task 3: Overlay state v2 — `Item.selected`, reducer, serialize, producers, consumers

This is the coupled shape change: `Item` drops the flat fields, so the reducer, serializer,
`OverlayRoot`, `Card`, and `usePositioning` all change together (tsc enforces it).

**Files:**
- Modify: `packages/core/src/overlay/state/types.ts` (`Item`, `Action`)
- Modify: `packages/core/src/overlay/state/reducer.ts`
- Modify: `packages/core/src/overlay/state/serialize.ts`
- Modify: `packages/core/src/overlay/components/OverlayRoot.tsx`
- Modify: `packages/core/src/overlay/components/Card.tsx`
- Modify: `packages/core/src/overlay/hooks/usePositioning.ts`
- Tests: `packages/core/src/overlay/state/reducer.test.ts`, `.../serialize.test.ts`, `.../components/Card.test.tsx`

- [ ] **Step 1: Update reducer + serialize tests to the v2 shape (failing)**

In `reducer.test.ts`: change `addElement`/`addScreenshot` dispatch payloads to carry
`selected` and assert `item.selected`. Example for `addElement`:
```ts
const sel = { selector: "#x", tagName: "H1", text: "hi", react: { componentName: "Hero", ancestry: ["Hero"] } };
const s = reducer(state, { type: "addElement", data: { selected: [sel], rect: { x:0,y:0,width:1,height:1 } } });
expect(s.items[0].selected).toEqual([sel]);
expect(s.items[0].kind).toBe("element");
```
For `addScreenshot`:
```ts
const s = reducer(state, { type: "addScreenshot", rect, pageX: 0, pageY: 0, selected: [sel] });
expect(s.items[0].selected).toEqual([sel]);
expect(s.items[0].kind).toBe("screenshot");
```
Remove any assertions on `item.componentName`/`ancestry`/`selector`/`tagName`/`text`.

In `serialize.test.ts`: build state items with `selected` + `kind`; assert the serialized item has
`selected` (deep-equal) and `kind`, and **does not** have `componentName`/`ancestry`/`selector`/
`tagName`/`text`:
```ts
expect(out.items[0].selected).toEqual([sel]);
expect(out.items[0].kind).toBe("element");
expect(out.items[0]).not.toHaveProperty("componentName");
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `pnpm exec vitest run src/overlay/state`
Expected: FAIL — `selected` missing; type errors in test setup.

- [ ] **Step 3: Update `state/types.ts`**

In `packages/core/src/overlay/state/types.ts`:
- Change `Item` — remove `componentName`, `ancestry`, `selector`, `tagName`, `text`; add `selected`:
```ts
export interface Item {
  id: string;
  kind: Kind;
  selected: Selection[];
  rect: Rect;
  pageX?: number;
  pageY?: number; // screenshot kind only
  comment: string;
  wantScreenshot: boolean;
  cardOffset?: { x: number; y: number };
}
```
- Change the `Action` union members:
```ts
  | { type: "addElement"; data: { selected: Selection[]; rect: Rect } }
  | { type: "addScreenshot"; rect: Rect; pageX: number; pageY: number; selected: Selection[] }
```

- [ ] **Step 4: Update `reducer.ts`**

In `packages/core/src/overlay/state/reducer.ts`, replace the `addElement` item construction:
```ts
    case "addElement": {
      const id = `a${state.nextId}`;
      const item: Item = {
        id,
        kind: "element",
        selected: action.data.selected,
        rect: { ...action.data.rect },
        comment: "",
        wantScreenshot: true,
      };
      return { ...state, ...dirty(state), items: [...state.items, item],
        open: { ...state.open, [id]: true }, nextId: state.nextId + 1 };
    }
```
and `addScreenshot`:
```ts
    case "addScreenshot": {
      const id = `a${state.nextId}`;
      const item: Item = {
        id,
        kind: "screenshot",
        selected: action.selected,
        rect: { ...action.rect },
        pageX: action.pageX,
        pageY: action.pageY,
        comment: "",
        wantScreenshot: true,
      };
      return { ...state, ...dirty(state), items: [...state.items, item],
        open: { ...state.open, [id]: true }, nextId: state.nextId + 1 };
    }
```

- [ ] **Step 5: Update `serialize.ts`**

In `packages/core/src/overlay/state/serialize.ts`:
- Import `Selection`, `Kind` from `./types.js` (alongside existing imports).
- Change `SerializedItem`:
```ts
export interface SerializedItem {
  id: string;
  badge: number;
  kind: Kind;
  selected: Selection[];
  rect: Rect;
  comment: string;
  wantScreenshot: boolean;
}
```
- Change the `items.map` body:
```ts
      return {
        id: it.id,
        badge: i + 1,
        kind: it.kind,
        selected: it.selected,
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        comment: it.comment,
        wantScreenshot: it.wantScreenshot,
      };
```
(`latestSelection` is unchanged — it still returns the last `SerializedItem`.)

- [ ] **Step 6: Update `OverlayRoot.tsx` producers**

In `packages/core/src/overlay/components/OverlayRoot.tsx`:
- Import the resolver + Selection: `import { resolveTouchedSelections } from "../touched-selections.js";`
  and `import type { Rect, Selection } from "../state/types.js";` (Selection added).
- Replace the `usePicker` `onPick` body so it builds a one-element `selected` from the extractor
  result (which is now a `Selection` plus `rect`):
```ts
    onPick: (data: unknown) => {
      const d = data as (Selection & { rect?: Rect }) | undefined;
      if (!d) return;
      const selection: Selection = {
        selector: d.selector ?? "",
        tagName: d.tagName ?? "",
        text: d.text ?? "",
        react: d.react ?? null,
      };
      dispatch({
        type: "addElement",
        data: { selected: [selection], rect: d.rect ?? { x: 0, y: 0, width: 0, height: 0 } },
      });
    },
```
- Replace the `useScreenshotRegion` `onCapture` body so it resolves touched selections:
```ts
    onCapture: (rect: Rect) => {
      const extract = (window as unknown as Record<string, (el: Element) => Selection>)
        .__pinpointExtractSelection;
      const selected =
        typeof extract === "function"
          ? resolveTouchedSelections(rect, {
              elementsFromPoint: (x, y) => Array.from(document.elementsFromPoint(x, y)),
              getRect: (el) => el.getBoundingClientRect(),
              isHost: (el) => el === hostEl || !!hostEl?.contains(el),
              extract,
            })
          : [];
      dispatch({ type: "addScreenshot", rect, pageX: rect.x + window.scrollX, pageY: rect.y + window.scrollY, selected });
      (window as unknown as Record<string, unknown>)[REGION_GLOBAL] = rect;
    },
```
(`__pinpointExtractSelection` returns `Selection & {rect}`; `resolveTouchedSelections`'s `extract`
expects `Selection` — the extra `rect` is structurally ignored.)

- [ ] **Step 7: Update `Card.tsx` + `usePositioning.ts` consumers**

`Card.tsx` line ~143 — change the header label:
```tsx
        <span style={labelStyle}>
          {item.selected[0]?.react?.componentName || item.selected[0]?.tagName || "screenshot"}
        </span>
```
`usePositioning.ts` line ~34 — change the live-rect selector lookup:
```ts
  const selector = item.selected[0]?.selector;
  const el = selector ? document.querySelector(selector) : null;
```
(the surrounding `if (el) return el.getBoundingClientRect(); return item.rect;` logic is unchanged.)

- [ ] **Step 8: Update `Card.test.tsx` if it asserts the old label fields**

If `Card.test.tsx` constructs `Item`s with flat `componentName`/`tagName` or asserts the header text
via those, update the fixtures to use `selected: [{ selector, tagName, text, react }]` and keep the
same expected header text. (If it doesn't touch those fields, no change.)

- [ ] **Step 9: Run overlay tests + typecheck, verify green**

Run: `pnpm exec vitest run src/overlay && pnpm typecheck`
Expected: PASS, clean. Fix any remaining `Item` fixture references in tests (search:
`grep -rn "componentName\|ancestry" packages/core/src/overlay`).

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/overlay
git -c core.hooksPath=/dev/null commit -m "feat(overlay): Item.selected[] — reducer/serialize/producers/consumers v2 (TASK-27)
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Wire contract v2 — `Annotation`, clipboard payload, save-screenshots

**Files:**
- Modify: `packages/core/src/types.ts` (`Annotation`)
- Modify: `packages/core/src/annotations/clipboard-payload.ts`
- Modify: `packages/core/src/annotations/save-screenshots.ts`
- Tests: `packages/core/src/annotations/clipboard-payload.test.ts`, `bridge-server` + `save-screenshots` tests as needed

- [ ] **Step 1: Update `clipboard-payload.test.ts` to v2 (failing)**

Change the test's input `Annotation` items to the v2 shape (`kind`, `selected`, no flat fields) and
assert the output payload has `version: 2` and per-item `selected` + `kind` (and `screenshot`,
`comment`, `badge`), and **not** `componentName`/`selector`/etc. Example:
```ts
const items = [{ id: "a1", badge: 1, kind: "element", selected: [{ selector: "#x", tagName: "H1", text: "t", react: { componentName: "Hero", ancestry: ["Hero"] } }], rect: { x:0,y:0,width:1,height:1 }, comment: "c", wantScreenshot: true }];
const payload = JSON.parse(buildClipboardJson({ bridgeUrl, sessionId, promptId, items, screenshotPaths: { 1: "/p.png" } }));
expect(payload.version).toBe(2);
expect(payload.items[0].selected).toEqual(items[0].selected);
expect(payload.items[0].kind).toBe("element");
expect(payload.items[0]).not.toHaveProperty("componentName");
expect(payload.items[0].screenshot).toBe("/p.png");
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm exec vitest run src/annotations/clipboard-payload`
Expected: FAIL — `version` is 1 / `selected` missing / type errors.

- [ ] **Step 3: Update `Annotation` in `types.ts`**

```ts
export interface Annotation {
  id: string;
  badge: number;
  kind: "element" | "screenshot";
  selected: Selection[];
  rect: Rect;
  comment: string;
  wantScreenshot: boolean;
}
```
(`Selection` is already exported from this file from Task 1.)

- [ ] **Step 4: Update `clipboard-payload.ts`**

```ts
    version: 2,
    bridgeUrl: args.bridgeUrl,
    sessionId: args.sessionId,
    promptId: args.promptId,
    items: args.items.map((it) => ({
      badge: it.badge,
      kind: it.kind,
      selected: it.selected,
      comment: it.comment,
      screenshot: args.screenshotPaths[it.badge] ?? null,
    })),
```

- [ ] **Step 5: Update `save-screenshots.ts` to branch on `kind`**

Replace the selector/clip lines (~30–31):
```ts
        if (it.kind === "element" && it.selected[0]?.selector) {
          png = await page.screenshotElement(it.selected[0].selector);
        }
        if (!png) png = await page.screenshotClip(it.rect);
```

- [ ] **Step 6: Fix any other compile breaks (bridge-server test fixtures)**

Run `pnpm typecheck`. If `bridge-server.test.ts` (or `save-screenshots` test) constructs `Annotation`
items with the old flat fields, update those fixtures to `{ kind, selected, rect, ... }`. Search:
`grep -rn "componentName\|ancestry" packages/core/src/server packages/core/src/annotations`.

- [ ] **Step 7: Run annotation + server tests, verify green**

Run: `pnpm exec vitest run src/annotations src/server && pnpm typecheck`
Expected: PASS, clean.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/annotations packages/core/src/server
git -c core.hooksPath=/dev/null commit -m "feat(bridge): clipboard payload v2 — selected[]+kind, version 2 (TASK-27)
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Integration test + paste skill

**Files:**
- Modify: `packages/core/integration/loop.integration.test.ts`
- Modify: `packages/claude-code/skills/pinpoint-paste/SKILL.md`

- [ ] **Step 1: Update the integration test item to v2**

In `loop.integration.test.ts`, the test builds `const item = { ...sel, id, badge, comment, wantScreenshot }`
where `sel` came from `__pinpointExtractSelection`. The extractor now returns
`{ selector, tagName, text, rect, react }`. Build a v2 item instead:
```ts
const sel = await connection.page.evaluate<Selection & { rect: Rect }>(
  "window.__pinpointExtractSelection(document.querySelector('#hero-heading'))",
);
const item = {
  id: "a1", badge: 1, kind: "element",
  selected: [{ selector: sel.selector, tagName: sel.tagName, text: sel.text, react: sel.react }],
  rect: sel.rect, comment: "make it bigger", wantScreenshot: true,
};
```
and update the payload assertions: replace `payload.items[0].componentName === "Hero"` with
`payload.items[0].selected[0].react.componentName === "Hero"` and assert `payload.version === 2`.
(Adjust imports: `Selection`, `Rect` from `../src/types.js`.)

- [ ] **Step 2: Update the `pinpoint-paste` SKILL.md**

In `packages/claude-code/skills/pinpoint-paste/SKILL.md`, replace the example JSON + step 3 so it
reads v2. New example block:
```json
{ "source": "pinpoint", "version": 2, "bridgeUrl": "http://localhost:7331",
  "sessionId": "…", "promptId": "…",
  "items": [{ "badge": 1, "kind": "element",
    "selected": [{ "selector": "#hero-heading", "tagName": "H1", "text": "…",
      "react": { "componentName": "Hero", "ancestry": ["Hero","App"] } }],
    "comment": "make it bigger", "screenshot": "/abs/path/anno-1.png" }] }
```
Rewrite step 3 ("For each item, apply its `comment`") to:
> For each item, for each entry in `item.selected`:
> - Locate the source: grep `selected[].react.componentName` (`function <name>`, `const <name> =`,
>   `export default function <name>`); use `react.ancestry` (nearest-first) to disambiguate; if
>   `react` is `null`, fall back to the entry's `text` + CSS `selector`.
> - A `kind: "element"` item has one selection (the picked element). A `kind: "screenshot"` item has
>   the outermost container + innermost leaves the region covered — use them together to find the
>   right component(s); `Read` the `screenshot` PNG for visual context.

- [ ] **Step 3: Run the unit suite (integration is gated; don't require a live browser)**

Run: `pnpm test`
Expected: PASS (all unit tests; the `*.integration.test.ts` files only run with a live Vite+Chrome
and are skipped/failing-to-connect otherwise — that's expected in CI-less local runs).

- [ ] **Step 4: Commit**

```bash
git add packages/core/integration/loop.integration.test.ts packages/claude-code/skills/pinpoint-paste/SKILL.md
git -c core.hooksPath=/dev/null commit -m "feat: integration test + pinpoint-paste skill read selected[] v2 (TASK-27)
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Build, full gates, live verification

**Files:** none (verification + regenerate the committed overlay bundle)

- [ ] **Step 1: Regenerate the overlay bundle + full gates**

Run:
```bash
pnpm --filter @pinpoint/core build   # regenerates overlay-source.generated.ts
pnpm typecheck && pnpm lint && pnpm test
git status --short packages/core/src/cdp/overlay-source.generated.ts
```
Expected: build writes the generated file; typecheck/lint/test all green. Commit the regenerated
bundle:
```bash
git add packages/core/src/cdp/overlay-source.generated.ts
git -c core.hooksPath=/dev/null commit -m "chore(overlay): regenerate bundle for selected[] v2 (TASK-27)
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 2: Live-verify the `/send` payload shape (React page)**

Start Vite (`examples/vite-react`) + a headed/headless Chrome on a debug port + the bridge (see
`/pinpoint:start` flow). Inject the overlay, **Pick** `#hero-heading`, then POST `/session/<id>/send`
(or click Send) and inspect the clipboard JSON. Verify:
- `version === 2`
- the element item has `kind: "element"`, `selected.length === 1`, `selected[0].react.componentName`
  is the React component, no flat fields.
Then **Screenshot** a region over a card and verify its item has `kind: "screenshot"` and
`selected.length >= 2` (container + leaf), each with a `selector`/`tagName`.

- [ ] **Step 3: Live-verify `react: null` on a non-React page (AC #4)**

Point the bridge at a plain HTML page (the TASK-26 plain-HTML example if it exists, else serve a
trivial static `<div><button>` page). Pick/Screenshot and confirm the selections have `react: null`
and no errors in the console / `/send` succeeds.

- [ ] **Step 4: Confirm acceptance criteria**

- AC #1 `Selection` type + `selected: Selection[]` — Tasks 1, 3, 4. ✓
- AC #2 pick → len 1; screenshot → outermost+innermost deduped, fiber-aware — Tasks 1, 3 + live. ✓
- AC #3 serialize + types + reducer + paste skill — Tasks 3, 4, 5. ✓
- AC #4 non-React → `react` null, no errors — Task 2 (extractor) + live Step 3. ✓

---

## Notes for the implementer
- **Run order matters for green commits:** Tasks 2 and 3 are best done back-to-back (Task 2 leaves
  `OverlayRoot` reading stale fields that Task 3 rewrites). Don't run the live app between them.
- **Two `Selection` copies** (`types.ts`, `overlay/state/types.ts`) must stay structurally identical
  — they're the same JSON across the overlay/wire boundary (mirrors the existing `Rect` duplication).
- **Don't change** screenshot clip geometry, pick semantics, or any overlay visual — out of scope.
- After each task, `pnpm typecheck` must be clean before committing.
