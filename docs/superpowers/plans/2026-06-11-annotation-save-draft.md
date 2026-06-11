# Annotation Save/Draft Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make new annotations unsaved **drafts** that are excluded from the clipboard payload until an explicit Save; one draft at a time; Save collapses to the badge.

**Architecture:** Add `Item.saved` + a `saveItem` action; `addElement`/`addScreenshot` create drafts (`saved:false`) and drop any existing draft; `serialize` filters to saved. The Card renders draft vs saved control sets. The pick-while-drafting-with-text confirm lives in `OverlayRoot` (a `pendingAdd` state + a `ConfirmRow` modal), keeping the reducer pure. Copy saves the open draft first.

**Tech Stack:** Preact (overlay), Vitest + happy-dom, the bundled CDP overlay.

**Spec:** `docs/superpowers/specs/2026-06-11-annotation-save-draft-design.md`

**Toolchain:** if a command fails with exit 127, prepend nvm: `export PATH="$(ls -d "$HOME"/.nvm/versions/node/*/bin | tail -1):$PATH"`. Run from the repo root (or worktree root).

---

## File structure

| File | Change |
|---|---|
| `overlay/state/types.ts` | `Item.saved: boolean`; add `{ type: "saveItem"; id: string }` action |
| `overlay/state/reducer.ts` | `addElement`/`addScreenshot` → `saved:false` + drop existing draft; `saveItem` → `saved:true` + collapse |
| `overlay/state/serialize.ts` | filter items to `saved === true` |
| `overlay/components/Card.tsx` | draft vs saved controls; Save button (bottom-right); Shift+Enter→save; Escape→discard; draft no-minimize-on-blur |
| `overlay/components/OverlayRoot.tsx` | wire `onSave`; `pendingAdd` confirm flow on pick-while-draft-with-text; Copy saves open draft |

---

### Task 1: Data model — `saved` field + `saveItem` action + reducer

**Files:**
- Modify: `packages/core/src/overlay/state/types.ts`
- Modify: `packages/core/src/overlay/state/reducer.ts`
- Test: `packages/core/src/overlay/state/reducer.test.ts`

- [ ] **Step 1: Add the failing reducer tests**

Append to `packages/core/src/overlay/state/reducer.test.ts` (it already imports `reducer`, `createInitialState`; if not, add `import { reducer, createInitialState } from "./reducer.js";` and `expect, it, describe` from vitest):

```ts
describe("save/draft (TASK-30)", () => {
  function withElement() {
    return reducer(createInitialState(), {
      type: "addElement",
      data: { componentName: "Btn", ancestry: ["Btn"], selector: "#b", tagName: "BUTTON", text: "x", rect: { x: 0, y: 0, width: 10, height: 10 } },
    });
  }

  it("addElement creates an unsaved draft", () => {
    const s = withElement();
    expect(s.items).toHaveLength(1);
    expect(s.items[0].saved).toBe(false);
    expect(s.open[s.items[0].id]).toBe(true);
  });

  it("adding a second element drops the existing unsaved draft (one draft at a time)", () => {
    const s1 = withElement();
    const s2 = reducer(s1, {
      type: "addElement",
      data: { componentName: "Two", ancestry: ["Two"], selector: "#t", tagName: "DIV", text: "y", rect: { x: 0, y: 0, width: 5, height: 5 } },
    });
    expect(s2.items).toHaveLength(1);
    expect(s2.items[0].componentName).toBe("Two");
    expect(s2.items[0].saved).toBe(false);
  });

  it("saveItem marks saved and collapses the card; a later add keeps the saved one", () => {
    const s1 = withElement();
    const id = s1.items[0].id;
    const saved = reducer(s1, { type: "saveItem", id });
    expect(saved.items[0].saved).toBe(true);
    expect(saved.open[id]).toBe(false);
    const s2 = reducer(saved, {
      type: "addElement",
      data: { componentName: "Two", ancestry: ["Two"], selector: "#t", tagName: "DIV", text: "y", rect: { x: 0, y: 0, width: 5, height: 5 } },
    });
    // saved one survives, new draft added
    expect(s2.items).toHaveLength(2);
    expect(s2.items[0].saved).toBe(true);
    expect(s2.items[1].saved).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm exec vitest run packages/core/src/overlay/state/reducer.test.ts`
Expected: FAIL — `saved` is undefined / `saveItem` not handled.

- [ ] **Step 3: Add `saved` to the Item type and the `saveItem` action**

In `packages/core/src/overlay/state/types.ts`, add `saved: boolean;` to the `Item` interface (after `wantScreenshot`):

```ts
  comment: string;
  wantScreenshot: boolean;
  saved: boolean; // false = unsaved draft (excluded from the serialized payload); true = persisted
  cardOffset?: { x: number; y: number };
```

And add to the `Action` union (after `setCardOffset`):

```ts
  | { type: "saveItem"; id: string };
```

- [ ] **Step 4: Update the reducer**

In `packages/core/src/overlay/state/reducer.ts`:

Add a helper above `reducer` (after `dirty`):

```ts
/** Drop any existing unsaved draft (there is at most one) and its open entry. */
function dropDraft(state: OverlayState): { items: Item[]; open: Record<string, boolean> } {
  const items = state.items.filter((it) => it.saved);
  const open = { ...state.open };
  for (const it of state.items) if (!it.saved) delete open[it.id];
  return { items, open };
}
```

Replace the `addElement` case body so it drops the existing draft and creates the new item with `saved:false`:

```ts
    case "addElement": {
      const { items: kept, open } = dropDraft(state);
      const id = `a${state.nextId}`;
      const item: Item = {
        id,
        kind: "element",
        componentName: action.data.componentName,
        ancestry: [...action.data.ancestry],
        selector: action.data.selector,
        tagName: action.data.tagName,
        text: action.data.text,
        rect: { ...action.data.rect },
        comment: "",
        wantScreenshot: true,
        saved: false,
      };
      return {
        ...state,
        ...dirty(state),
        items: [...kept, item],
        open: { ...open, [id]: true },
        nextId: state.nextId + 1,
      };
    }
```

Replace the `addScreenshot` case body similarly (drop draft + `saved:false`):

```ts
    case "addScreenshot": {
      const { items: kept, open } = dropDraft(state);
      const id = `a${state.nextId}`;
      const item: Item = {
        id,
        kind: "screenshot",
        componentName: null,
        ancestry: [],
        selector: "",
        tagName: "",
        text: "",
        rect: { ...action.rect },
        pageX: action.pageX,
        pageY: action.pageY,
        comment: "",
        wantScreenshot: true,
        saved: false,
      };
      return {
        ...state,
        ...dirty(state),
        items: [...kept, item],
        open: { ...open, [id]: true },
        nextId: state.nextId + 1,
      };
    }
```

Add a `saveItem` case (before `default`):

```ts
    case "saveItem": {
      const items = state.items.map((it) => (it.id === action.id ? { ...it, saved: true } : it));
      return { ...state, ...dirty(state), items, open: { ...state.open, [action.id]: false } };
    }
```

- [ ] **Step 5: Run reducer tests, expect pass**

Run: `pnpm exec vitest run packages/core/src/overlay/state/reducer.test.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/overlay/state/types.ts packages/core/src/overlay/state/reducer.ts packages/core/src/overlay/state/reducer.test.ts
git commit -m "feat(overlay): Item.saved + saveItem; addElement/addScreenshot create drafts (TASK-30)"
```

---

### Task 2: `serialize` filters to saved

**Files:**
- Modify: `packages/core/src/overlay/state/serialize.ts`
- Test: `packages/core/src/overlay/state/serialize.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `packages/core/src/overlay/state/serialize.test.ts` (reuse its existing imports/helpers; construct items inline with the `saved` field):

```ts
import { describe, expect, it } from "vitest";
import { reducer, createInitialState } from "./reducer.js";
import { serializeState } from "./serialize.js";
import type { Rect } from "./types.js";

const vrect = (it: { rect: Rect }) => it.rect;

describe("serialize excludes drafts (TASK-30)", () => {
  it("only saved items appear in the snapshot, renumbered over the saved set", () => {
    let s = reducer(createInitialState(), {
      type: "addElement",
      data: { componentName: "A", ancestry: ["A"], selector: "#a", tagName: "DIV", text: "", rect: { x: 0, y: 0, width: 1, height: 1 } },
    });
    s = reducer(s, { type: "saveItem", id: s.items[0].id });
    // add a second, leave it as an unsaved draft
    s = reducer(s, {
      type: "addElement",
      data: { componentName: "B", ancestry: ["B"], selector: "#b", tagName: "DIV", text: "", rect: { x: 0, y: 0, width: 1, height: 1 } },
    });
    const snap = serializeState(s, vrect);
    expect(snap.items).toHaveLength(1);
    expect(snap.items[0].componentName).toBe("A");
    expect(snap.items[0].badge).toBe(1);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm exec vitest run packages/core/src/overlay/state/serialize.test.ts`
Expected: FAIL — snapshot has 2 items (drafts not yet filtered).

- [ ] **Step 3: Filter to saved in `serialize.ts`**

In `serializeState`, change `state.items.map(...)` to filter first:

```ts
    items: state.items
      .filter((it) => it.saved)
      .map((it, i) => {
        const r = vrect(it);
        return {
          id: it.id,
          badge: i + 1,
          componentName: it.componentName,
          ancestry: it.ancestry,
          selector: it.selector,
          tagName: it.tagName,
          text: it.text,
          rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          comment: it.comment,
          wantScreenshot: it.wantScreenshot,
        };
      }),
```

- [ ] **Step 4: Run, expect pass**

Run: `pnpm exec vitest run packages/core/src/overlay/state/serialize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/overlay/state/serialize.ts packages/core/src/overlay/state/serialize.test.ts
git commit -m "feat(overlay): serialize excludes unsaved drafts (TASK-30)"
```

---

### Task 3: Card — draft vs saved controls + Save button

**Files:**
- Modify: `packages/core/src/overlay/components/Card.tsx`
- Test: `packages/core/src/overlay/components/Card.test.tsx`

- [ ] **Step 1: Add failing Card tests**

Append to `packages/core/src/overlay/components/Card.test.tsx` (reuse its existing mount helper + `makeItem`-style factory; the file already mounts a `Card`. Add a `saved` field to any item factory it uses — if the helper builds items inline, include `saved`). New tests:

```ts
it("draft card shows a Save button and no minimize button (TASK-30)", () => {
  const onSave = vi.fn();
  const { container } = renderCard({ saved: false }, { onSave });
  expect(container.querySelector('button[title="save annotation"]')).not.toBeNull();
  expect(container.querySelector('button[title="minimize"]')).toBeNull();
});

it("Shift+Enter on a draft saves (TASK-30)", () => {
  const onSave = vi.fn();
  const { container } = renderCard({ saved: false }, { onSave });
  const ta = container.querySelector("textarea")!;
  ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }));
  expect(onSave).toHaveBeenCalled();
});

it("saved card shows minimize and not a Save button (TASK-30)", () => {
  const { container } = renderCard({ saved: true }, {});
  expect(container.querySelector('button[title="minimize"]')).not.toBeNull();
  expect(container.querySelector('button[title="save annotation"]')).toBeNull();
});
```

(`renderCard(itemOverrides, handlerOverrides)` — adapt to the file's existing render helper: it must pass `onSave` and an `item` with the given `saved` value. If the existing helper signature differs, extend it to accept these; keep existing tests working by defaulting `saved: true` so prior tests — which assume full controls — still see a saved card.)

- [ ] **Step 2: Run, expect failure**

Run: `pnpm exec vitest run packages/core/src/overlay/components/Card.test.tsx`
Expected: FAIL — no Save button / `onSave` not a prop.

- [ ] **Step 3: Update `Card.tsx`**

Add `onSave: () => void;` to the prop type and destructure it. Add `const isDraft = !item.saved;` near the top of the component body.

Make the **minimize** button conditional (saved only) — wrap the existing minimize `<button>`:

```tsx
        {!isDraft && (
          <button
            type="button"
            class="pp-icon"
            title="minimize"
            style={iconBtnStyle}
            onClick={(e) => {
              e.stopPropagation();
              onMinimize();
            }}
          >
            <Icon svg={ICON.min} />
          </button>
        )}
```

Make the **trash** button discard immediately for drafts, confirm for saved — replace its `onClick`:

```tsx
        <button
          type="button"
          class="pp-icon"
          title={isDraft ? "discard draft" : "delete annotation"}
          style={iconBtnStyle}
          onClick={(e) => {
            e.stopPropagation();
            if (isDraft) onDelete();
            else handleDeleteClick(e);
          }}
        >
          <Icon svg={ICON.trash} />
        </button>
```

Update the textarea placeholder + keydown (Shift+Enter and Escape):

```tsx
      <textarea
        ref={taRef}
        rows={2}
        value={item.comment}
        placeholder={isDraft ? "What should change?  (Shift+Enter to save)" : "What should change?"}
        style={taStyle}
        onInput={(e) => onComment((e.target as HTMLTextAreaElement).value)}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.shiftKey) {
            e.preventDefault();
            if (isDraft) onSave();
            else onMinimize();
          } else if (e.key === "Escape" && isDraft) {
            e.preventDefault();
            onDelete(); // discard the draft
          }
        }}
      />
```

Add the **Save button** row (draft only) after the textarea, before the delete-confirm overlay:

```tsx
      {isDraft && (
        <div style="display:flex;justify-content:flex-end;margin-top:6px">
          <button
            type="button"
            class="pp-icon pp-active"
            title="save annotation"
            style="min-width:56px;height:26px;border-radius:6px;font:600 12px system-ui"
            onClick={(e) => {
              e.stopPropagation();
              onSave();
            }}
          >
            Save
          </button>
        </div>
      )}
```

Make drafts ignore the blur-to-minimize — add at the top of `handleFocusOut`:

```tsx
  function handleFocusOut(e: FocusEvent) {
    if (isDraft) return; // drafts never minimize on blur — save or discard explicitly
    if (showConfirm || pressingBadgeRef.current === item.id) return;
    // ... rest unchanged ...
  }
```

- [ ] **Step 4: Run, expect pass**

Run: `pnpm exec vitest run packages/core/src/overlay/components/Card.test.tsx`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/overlay/components/Card.tsx packages/core/src/overlay/components/Card.test.tsx
git commit -m "feat(overlay): draft vs saved Card — Save button, no minimize/blur-min for drafts (TASK-30)"
```

---

### Task 4: OverlayRoot — wire save, pick-while-draft confirm, Copy-saves-draft

**Files:**
- Modify: `packages/core/src/overlay/components/OverlayRoot.tsx`
- Test: `packages/core/src/overlay/components/OverlayRoot.test.tsx`

- [ ] **Step 1: Add the `pendingAdd` confirm flow + helpers**

At module scope in `OverlayRoot.tsx` (above the component), define the add-action types:

```tsx
type AddElementData = {
  componentName: string | null;
  ancestry: string[];
  selector: string;
  tagName: string;
  text: string;
  rect: Rect;
};

type AddAction =
  | { type: "addElement"; data: AddElementData }
  | { type: "addScreenshot"; rect: Rect; pageX: number; pageY: number };
```

Inside the component, near the other `useState` hooks, add the pending-add state and the request helper:

```tsx
  // A new pick/screenshot is gated behind a "discard unsaved draft?" confirm ONLY when the open
  // draft has comment text; otherwise it's added immediately (the reducer drops the empty draft).
  const [pendingAdd, setPendingAdd] = useState<AddAction | null>(null);

  function requestAdd(action: AddAction) {
    const draft = state.items.find((it) => !it.saved);
    if (draft && draft.comment.trim()) {
      setPendingAdd(action);
    } else {
      dispatch(action);
    }
  }
```

- [ ] **Step 2: Route pick + screenshot through `requestAdd`**

In the `usePicker` `onPick` callback, replace the `dispatch({ type: "addElement", data: {...} })` with building the data and calling `requestAdd`:

```tsx
    onPick: (data: unknown) => {
      const d = data as Partial<AddElementData> | undefined;
      requestAdd({
        type: "addElement",
        data: {
          componentName: d?.componentName ?? null,
          ancestry: d?.ancestry ?? [],
          selector: d?.selector ?? "",
          tagName: d?.tagName ?? "",
          text: d?.text ?? "",
          rect: d?.rect ?? { x: 0, y: 0, width: 0, height: 0 },
        },
      });
    },
```

In the `useScreenshotRegion` `onCapture` callback, replace its `dispatch({ type: "addScreenshot", ... })` with:

```tsx
    onCapture: (rect: Rect) => {
      requestAdd({ type: "addScreenshot", rect, pageX: rect.x + window.scrollX, pageY: rect.y + window.scrollY });
      (window as unknown as Record<string, unknown>)[REGION_GLOBAL] = rect;
    },
```

- [ ] **Step 3: Render the confirm modal + wire `onSave`**

In the returned JSX, add the confirm modal (after `<MarksLayer .../>`), using the existing `ConfirmRow`:

```tsx
      {pendingAdd && (
        <div
          style={`position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35);pointer-events:auto`}
        >
          <div style="background:#222;border:1px solid #555;border-radius:10px;padding:14px;font:12px system-ui;color:#fff;display:flex;flex-direction:column;gap:10px">
            <div>Discard the unsaved annotation?</div>
            <ConfirmRow
              yesLabel="Discard & continue"
              onYes={() => {
                const action = pendingAdd;
                setPendingAdd(null);
                if (action) dispatch(action);
              }}
              onNo={() => setPendingAdd(null)}
            />
          </div>
        </div>
      )}
```

(Import `ConfirmRow` at the top: `import { ConfirmRow } from "./ConfirmRow.js";`. Use the single chosen name `pendingAdd` / `setPendingAdd`.)

In the `MarksLayer` props, add the save handler:

```tsx
        onSave={(id) => dispatch({ type: "saveItem", id })}
```

And thread `onSave` through `MarksLayer` to `Card` (add `onSave: (id: string) => void` to `MarksLayerProps`, and on the `<Card .../>` pass `onSave={() => onSave(item.id)}`).

- [ ] **Step 4: Copy saves the open draft first**

In `doCopy`, before building the snapshot, fold the open draft into a saved snapshot and dispatch its save:

```tsx
  function doCopy() {
    if (!state.items.length) return;
    const draft = state.items.find((it) => !it.saved && state.open[it.id]);
    const effectiveItems = draft
      ? state.items.map((it) => (it.id === draft.id ? { ...it, saved: true } : it))
      : state.items;
    const snapState = { ...state, items: effectiveItems, ready: true, batchId: state.batchId + 1 };
    const snap = serializeState(snapState, computeVRect);
    (window as unknown as Record<string, unknown>)[ANNOTATIONS_GLOBAL] = snap;
    const link = (window as unknown as Record<string, unknown>).__pinpointLink as
      | { send: (items: unknown) => Promise<string> }
      | undefined;
    if (link) {
      Promise.resolve(link.send(snap.items)).then((id: string) => {
        lastPromptId.current = id;
      }).catch(() => {});
    }
    if (draft) dispatch({ type: "saveItem", id: draft.id });
    dispatch({ type: "markCopied" });
    if (copyTimer.current !== undefined) clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => dispatch({ type: "clearCopied" }), 1600);
  }
```

- [ ] **Step 5: Add the failing OverlayRoot flow test**

Append to `packages/core/src/overlay/components/OverlayRoot.test.tsx` (reuse its `setup`, `openFab`, `act` helpers + the `elementFromPoint`/`__pinpointExtractSelection` stubbing pattern already used in its "copy flow" tests). Test the confirm gate:

```ts
it("picking a new element while a draft has text shows the discard confirm (TASK-30)", () => {
  // seed: open fab, activate Pick, pick an element (creates a draft), type a comment,
  // then pick a different element — a confirm modal should appear and NO second item added yet.
  // (Use the same elementFromPoint + __pinpointExtractSelection stubs as the copy-flow tests.)
  // ... arrange per existing helpers ...
  // After the second pick:
  expect(document.body.textContent).toContain("Discard the unsaved annotation?");
});
```

(Flesh this out using the file's existing stubbing helpers — seed a draft, set its `comment` via the textarea `input` event, dispatch a second pick click, assert the confirm text is present and the draft is still the only item. If happy-dom's `elementFromPoint` makes the second pick hard to drive, assert at the reducer/`requestAdd` level instead by exercising the same branch: a draft with text + an add request leaves items length 1 until confirmed.)

- [ ] **Step 6: Run OverlayRoot tests + full suite + typecheck**

Run: `pnpm exec vitest run packages/core/src/overlay/components/OverlayRoot.test.tsx`
Expected: PASS. Then `pnpm test` (full suite green) and `pnpm typecheck` (clean).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/overlay/components/OverlayRoot.tsx packages/core/src/overlay/components/OverlayRoot.test.tsx
git commit -m "feat(overlay): wire saveItem, pick-while-draft confirm, Copy-saves-draft (TASK-30)"
```

---

### Task 5: Validation + bundle + live check + decisions

**Files:**
- Modify: `docs/decisions.md`

- [ ] **Step 1: Full gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all pass; `pnpm build` regenerates `overlay-source.generated.ts` (commit it) + the bin.

- [ ] **Step 2: Commit the regenerated bundle**

```bash
git add packages/core/src/cdp/overlay-source.generated.ts
git commit -m "build(overlay): regenerate bundle with save/draft flow (TASK-30)"
```

- [ ] **Step 3: Live check on vite-plain**

Start the example + dev loop (`pnpm --dir examples/vite-plain dev` + `PIN_APP_URL=http://localhost:5174 pnpm dev:overlay`). Verify: pick → draft card with **Save** (no minimize); type + Save → collapses to badge; pick a different element with text in the draft → discard confirm; Send copies only saved annotations (paste the JSON and confirm the draft is absent).

- [ ] **Step 4: Decisions row**

Append to `docs/decisions.md` (match the table format):

> `2026-06-11` — Annotation save/draft flow (TASK-30): annotations are unsaved drafts (`Item.saved:false`) until an explicit **Save** (`saveItem`) — `serialize` filters to `saved===true`, so drafts never enter the clipboard payload. One draft at a time (`addElement`/`addScreenshot` drop the existing draft); pick-while-draft-with-text shows a discard confirm (state in `OverlayRoot`, reducer stays pure). Draft card: Save (bottom-right) + trash-discards-immediately + Escape-discards, no minimize/close, no blur-minimize; Shift+Enter saves; Save collapses to the badge. Copy saves the open draft first, then sends the saved set. Lands before TASK-27 (which reshapes the per-annotation identity); this only changed *which* items serialize.

- [ ] **Step 5: Commit**

```bash
git add docs/decisions.md
git commit -m "docs(decisions): record annotation save/draft flow (TASK-30)"
```

---

## Self-review notes

- **Spec coverage:** `saved` + `saveItem` + drop-draft (Task 1); serialize-filter (Task 2); draft/saved Card, Save button bottom-right, Shift+Enter→save, Escape/trash discard, no blur-minimize (Task 3); pick-while-draft confirm, `onSave` wiring, Copy-saves-draft (Task 4); validation + bundle + live + decisions (Task 5). Both kinds (element + screenshot) route through `requestAdd`/`saved:false`.
- **Type consistency:** `Item.saved`, action `{type:"saveItem"; id}`, `AddElementData`, `AddAction`, `pendingAdd`/`setPendingAdd`, and `onSave: (id) => void` are used consistently across reducer, serialize, Card, MarksLayer, OverlayRoot.
- **Test-helper adaptation:** Task 3/4 test steps reuse the existing test files' helpers (`Card.test.tsx`'s render helper + item factory; `OverlayRoot.test.tsx`'s `setup`/`openFab`/`act` + the `elementFromPoint`/`__pinpointExtractSelection` stubs from its copy-flow tests). The implementer must read those files first and extend the helpers (e.g. add `saved` to the item factory defaulting to `true` so prior tests still see a saved card, and thread `onSave`), not duplicate them. Where happy-dom's `elementFromPoint` can't drive a second pick, assert the confirm gate at the `requestAdd` branch level instead (draft-with-text + add ⇒ items stays length 1 until confirmed).
