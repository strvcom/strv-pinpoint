import { describe, expect, it } from "vitest";
import { createInitialState, reducer } from "./reducer.js";
import type { OverlayState } from "./types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const sel = {
  selector: "#x",
  tagName: "H1",
  text: "hi",
  react: { componentName: "Hero", ancestry: ["Hero"] },
};

const elementData = {
  selected: [sel],
  rect: { x: 10, y: 20, width: 100, height: 40 },
};

// ─── createInitialState ───────────────────────────────────────────────────────
describe("createInitialState", () => {
  it("returns the expected initial shape", () => {
    const s = createInitialState();
    expect(s.mode).toBeNull();
    expect(s.items).toEqual([]);
    expect(s.open).toEqual({});
    expect(s.fabOpen).toBe(false);
    expect(s.ready).toBe(false);
    expect(s.copied).toBe(false);
    expect(s.nextId).toBe(1);
    expect(s.batchId).toBe(0);
    expect(s.lastPromptId).toBeNull();
    expect(s.confirming).toBe(false);
    expect(s.fab).toEqual({ right: 16, bottom: 16 });
  });
});

// ─── Purity ───────────────────────────────────────────────────────────────────
describe("purity", () => {
  it("does not mutate the input state on addElement", () => {
    const initial = createInitialState();
    const frozen = Object.freeze({
      ...initial,
      items: Object.freeze([...initial.items]) as OverlayState["items"],
    });
    const next = reducer(frozen as OverlayState, { type: "addElement", data: elementData });
    // If frozen was mutated, this would have thrown. Verify identity.
    expect(next).not.toBe(frozen);
    expect(next.items).not.toBe(frozen.items);
    expect(frozen.items).toHaveLength(0);
  });

  it("does not mutate input state's items array on addScreenshot", () => {
    const initial = createInitialState();
    const itemsRef = initial.items;
    reducer(initial, {
      type: "addScreenshot",
      rect: { x: 0, y: 0, width: 10, height: 10 },
      pageX: 5,
      pageY: 5,
      selected: [],
    });
    expect(initial.items).toBe(itemsRef); // same reference — we never touched it
    expect(initial.items).toHaveLength(0);
  });

  it("does not mutate input state on setComment", () => {
    const s0 = createInitialState();
    const s1 = reducer(s0, { type: "addElement", data: elementData });
    const id = s1.items[0].id;
    const originalComment = s1.items[0].comment;
    reducer(s1, { type: "setComment", id, comment: "new comment" });
    expect(s1.items[0].comment).toBe(originalComment); // s1 untouched
  });
});

// ─── addElement ───────────────────────────────────────────────────────────────
describe("addElement", () => {
  it("pushes an item with the correct fields", () => {
    const s = reducer(createInitialState(), { type: "addElement", data: elementData });
    expect(s.items).toHaveLength(1);
    const item = s.items[0];
    expect(item.id).toBe("a1");
    expect(item.kind).toBe("element");
    expect(item.selected).toEqual([sel]);
    expect(item.rect).toEqual({ x: 10, y: 20, width: 100, height: 40 });
    expect(item.comment).toBe("");
  });

  it("defaults wantScreenshot to TRUE (TASK-18 #5)", () => {
    const s = reducer(createInitialState(), { type: "addElement", data: elementData });
    expect(s.items[0].wantScreenshot).toBe(true);
  });

  it("increments nextId", () => {
    const s0 = createInitialState();
    const s1 = reducer(s0, { type: "addElement", data: elementData });
    // TASK-30: save before adding a 2nd, else the unsaved draft is dropped (one draft at a time)
    const s1saved = reducer(s1, { type: "saveItem", id: s1.items[0].id });
    const s2 = reducer(s1saved, { type: "addElement", data: elementData });
    expect(s1.nextId).toBe(2);
    expect(s2.nextId).toBe(3);
    expect(s2.items[0].id).toBe("a1");
    expect(s2.items[1].id).toBe("a2");
  });

  it("opens the card (open[id]=true)", () => {
    const s = reducer(createInitialState(), { type: "addElement", data: elementData });
    expect(s.open.a1).toBe(true);
  });

  it("dirties: ready=false, copied=false", () => {
    // Start from a state where ready=true, copied=true
    const pre: OverlayState = { ...createInitialState(), ready: true, copied: true };
    const s = reducer(pre, { type: "addElement", data: elementData });
    expect(s.ready).toBe(false);
    expect(s.copied).toBe(false);
  });
});

// ─── addScreenshot ────────────────────────────────────────────────────────────
describe("addScreenshot", () => {
  const rect = { x: 5, y: 10, width: 200, height: 150 };

  it("pushes a screenshot item with correct fields", () => {
    const s = reducer(createInitialState(), {
      type: "addScreenshot",
      rect,
      pageX: 50,
      pageY: 100,
      selected: [sel],
    });
    expect(s.items).toHaveLength(1);
    const item = s.items[0];
    expect(item.id).toBe("a1");
    expect(item.kind).toBe("screenshot");
    expect(item.selected).toEqual([sel]);
    expect(item.rect).toEqual(rect);
    expect(item.pageX).toBe(50);
    expect(item.pageY).toBe(100);
    expect(item.comment).toBe("");
    expect(item.wantScreenshot).toBe(true);
  });

  it("increments nextId and opens card", () => {
    const s = reducer(createInitialState(), {
      type: "addScreenshot",
      rect,
      pageX: 0,
      pageY: 0,
      selected: [],
    });
    expect(s.nextId).toBe(2);
    expect(s.open.a1).toBe(true);
  });

  it("dirties", () => {
    const pre: OverlayState = { ...createInitialState(), ready: true, copied: true };
    const s = reducer(pre, { type: "addScreenshot", rect, pageX: 0, pageY: 0, selected: [] });
    expect(s.ready).toBe(false);
    expect(s.copied).toBe(false);
  });
});

// ─── setComment ───────────────────────────────────────────────────────────────
describe("setComment", () => {
  it("updates the item's comment", () => {
    const s0 = reducer(createInitialState(), { type: "addElement", data: elementData });
    const id = s0.items[0].id;
    const s1 = reducer(s0, { type: "setComment", id, comment: "hello" });
    expect(s1.items[0].comment).toBe("hello");
  });

  it("dirties", () => {
    const s0 = reducer(createInitialState(), { type: "addElement", data: elementData });
    const withReady: OverlayState = { ...s0, ready: true, copied: true };
    const id = withReady.items[0].id;
    const s1 = reducer(withReady, { type: "setComment", id, comment: "x" });
    expect(s1.ready).toBe(false);
    expect(s1.copied).toBe(false);
  });

  it("is a no-op if id is missing", () => {
    const s0 = reducer(createInitialState(), { type: "addElement", data: elementData });
    const s1 = reducer(s0, { type: "setComment", id: "a999", comment: "x" });
    expect(s1.items).toEqual(s0.items);
  });
});

// ─── toggleScreenshot ─────────────────────────────────────────────────────────
describe("toggleScreenshot", () => {
  it("flips wantScreenshot", () => {
    const s0 = reducer(createInitialState(), { type: "addElement", data: elementData });
    expect(s0.items[0].wantScreenshot).toBe(true); // default true per TASK-18
    const id = s0.items[0].id;
    const s1 = reducer(s0, { type: "toggleScreenshot", id });
    expect(s1.items[0].wantScreenshot).toBe(false);
    const s2 = reducer(s1, { type: "toggleScreenshot", id });
    expect(s2.items[0].wantScreenshot).toBe(true);
  });

  it("dirties", () => {
    const s0 = reducer(createInitialState(), { type: "addElement", data: elementData });
    const withReady: OverlayState = { ...s0, ready: true, copied: true };
    const id = withReady.items[0].id;
    const s1 = reducer(withReady, { type: "toggleScreenshot", id });
    expect(s1.ready).toBe(false);
    expect(s1.copied).toBe(false);
  });
});

// ─── openCard / closeCard ────────────────────────────────────────────────────
describe("openCard / closeCard", () => {
  it("openCard sets open[id]=true", () => {
    const s0 = reducer(createInitialState(), { type: "addElement", data: elementData });
    // closeCard first
    const s1 = reducer(s0, { type: "closeCard", id: "a1" });
    expect(s1.open.a1).toBe(false);
    const s2 = reducer(s1, { type: "openCard", id: "a1" });
    expect(s2.open.a1).toBe(true);
  });

  it("closeCard sets open[id]=false", () => {
    const s0 = reducer(createInitialState(), { type: "addElement", data: elementData });
    const s1 = reducer(s0, { type: "closeCard", id: "a1" });
    expect(s1.open.a1).toBe(false);
  });

  it("openCard does NOT dirty", () => {
    const s0: OverlayState = { ...createInitialState(), ready: true, copied: true };
    const s1 = reducer(s0, { type: "openCard", id: "a1" });
    expect(s1.ready).toBe(true);
    expect(s1.copied).toBe(true);
  });

  it("closeCard does NOT dirty", () => {
    const s0: OverlayState = { ...createInitialState(), ready: true, copied: true };
    const s1 = reducer(s0, { type: "closeCard", id: "a1" });
    expect(s1.ready).toBe(true);
    expect(s1.copied).toBe(true);
  });
});

// ─── deleteItem ───────────────────────────────────────────────────────────────
describe("deleteItem", () => {
  it("removes the item and deletes open[id]", () => {
    const s0 = reducer(createInitialState(), { type: "addElement", data: elementData });
    const id = s0.items[0].id;
    const s1 = reducer(s0, { type: "deleteItem", id });
    expect(s1.items).toHaveLength(0);
    expect(s1.open[id]).toBeUndefined();
  });

  it("dirties", () => {
    const s0 = reducer(createInitialState(), { type: "addElement", data: elementData });
    const withReady: OverlayState = { ...s0, ready: true, copied: true };
    const id = withReady.items[0].id;
    const s1 = reducer(withReady, { type: "deleteItem", id });
    expect(s1.ready).toBe(false);
    expect(s1.copied).toBe(false);
  });

  it("only removes the specified item", () => {
    const s0 = createInitialState();
    const s1 = reducer(s0, { type: "addElement", data: elementData });
    const s1saved = reducer(s1, { type: "saveItem", id: "a1" }); // TASK-30: keep both (one draft rule)
    const s2 = reducer(s1saved, {
      type: "addElement",
      data: { ...elementData, selected: [{ ...sel, selector: "#y" }] },
    });
    expect(s2.items).toHaveLength(2);
    const s3 = reducer(s2, { type: "deleteItem", id: "a1" });
    expect(s3.items).toHaveLength(1);
    expect(s3.items[0].id).toBe("a2");
  });
});

// ─── clearAll ─────────────────────────────────────────────────────────────────
describe("clearAll", () => {
  it("clears items, open, ready, copied; keeps nextId", () => {
    const s0 = createInitialState();
    const s1 = reducer(s0, { type: "addElement", data: elementData });
    const s2 = reducer(s1, { type: "addElement", data: elementData });
    const withCopied: OverlayState = { ...s2, ready: true, copied: true };
    const s3 = reducer(withCopied, { type: "clearAll" });
    expect(s3.items).toEqual([]);
    expect(s3.open).toEqual({});
    expect(s3.ready).toBe(false);
    expect(s3.copied).toBe(false);
    expect(s3.nextId).toBe(3); // preserved
  });
});

// ─── setFabOpen ──────────────────────────────────────────────────────────────
describe("setFabOpen", () => {
  it("sets fabOpen", () => {
    const s0 = createInitialState();
    expect(s0.fabOpen).toBe(false);
    const s1 = reducer(s0, { type: "setFabOpen", open: true });
    expect(s1.fabOpen).toBe(true);
    const s2 = reducer(s1, { type: "setFabOpen", open: false });
    expect(s2.fabOpen).toBe(false);
  });

  it("does NOT dirty", () => {
    const s0: OverlayState = { ...createInitialState(), ready: true, copied: true };
    const s1 = reducer(s0, { type: "setFabOpen", open: true });
    expect(s1.ready).toBe(true);
    expect(s1.copied).toBe(true);
  });
});

// ─── setFabPos ────────────────────────────────────────────────────────────────
describe("setFabPos", () => {
  it("sets fab right and bottom", () => {
    const s0 = createInitialState();
    const s1 = reducer(s0, { type: "setFabPos", right: 32, bottom: 64 });
    expect(s1.fab).toEqual({ right: 32, bottom: 64 });
  });

  it("does NOT dirty", () => {
    const s0: OverlayState = { ...createInitialState(), ready: true, copied: true };
    const s1 = reducer(s0, { type: "setFabPos", right: 10, bottom: 10 });
    expect(s1.ready).toBe(true);
    expect(s1.copied).toBe(true);
  });
});

// ─── setMode ─────────────────────────────────────────────────────────────────
describe("setMode", () => {
  it("sets mode", () => {
    const s0 = createInitialState();
    const s1 = reducer(s0, { type: "setMode", mode: "pick" });
    expect(s1.mode).toBe("pick");
    const s2 = reducer(s1, { type: "setMode", mode: null });
    expect(s2.mode).toBeNull();
  });

  it("does NOT dirty", () => {
    const s0: OverlayState = { ...createInitialState(), ready: true, copied: true };
    const s1 = reducer(s0, { type: "setMode", mode: "screenshot" });
    expect(s1.ready).toBe(true);
    expect(s1.copied).toBe(true);
  });
});

// ─── markCopied ──────────────────────────────────────────────────────────────
describe("markCopied", () => {
  it("sets ready=true, copied=true, increments batchId", () => {
    const s0 = createInitialState();
    const s1 = reducer(s0, { type: "markCopied" });
    expect(s1.ready).toBe(true);
    expect(s1.copied).toBe(true);
    expect(s1.batchId).toBe(1);
  });

  it("does NOT change items", () => {
    const s0 = reducer(createInitialState(), { type: "addElement", data: elementData });
    const itemsRef = s0.items;
    const s1 = reducer(s0, { type: "markCopied" });
    // Items should be the same (or equal) and unmodified
    expect(s1.items).toEqual(itemsRef);
  });

  it("increments batchId each time", () => {
    const s0 = createInitialState();
    const s1 = reducer(s0, { type: "markCopied" });
    const s2 = reducer(s1, { type: "markCopied" });
    expect(s2.batchId).toBe(2);
  });
});

// ─── clearCopied ─────────────────────────────────────────────────────────────
describe("clearCopied", () => {
  it("sets copied=false", () => {
    const s0: OverlayState = { ...createInitialState(), copied: true, ready: true };
    const s1 = reducer(s0, { type: "clearCopied" });
    expect(s1.copied).toBe(false);
    expect(s1.ready).toBe(true); // ready is unchanged
  });
});

// ─── setConfirming ────────────────────────────────────────────────────────────
describe("setConfirming", () => {
  it("sets confirming", () => {
    const s0 = createInitialState();
    const s1 = reducer(s0, { type: "setConfirming", confirming: true });
    expect(s1.confirming).toBe(true);
    const s2 = reducer(s1, { type: "setConfirming", confirming: false });
    expect(s2.confirming).toBe(false);
  });

  it("does NOT dirty", () => {
    const s0: OverlayState = { ...createInitialState(), ready: true, copied: true };
    const s1 = reducer(s0, { type: "setConfirming", confirming: true });
    expect(s1.ready).toBe(true);
    expect(s1.copied).toBe(true);
  });
});

// ─── consumeRunning ───────────────────────────────────────────────────────────
describe("consumeRunning", () => {
  it("clears items, open, ready, copied", () => {
    const s0 = createInitialState();
    const s1 = reducer(s0, { type: "addElement", data: elementData });
    const withCopied: OverlayState = { ...s1, ready: true, copied: true };
    const s2 = reducer(withCopied, { type: "consumeRunning" });
    expect(s2.items).toEqual([]);
    expect(s2.open).toEqual({});
    expect(s2.ready).toBe(false);
    expect(s2.copied).toBe(false);
  });
});

// ─── setCardOffset ────────────────────────────────────────────────────────────
describe("setCardOffset", () => {
  it("updates item.cardOffset without dirtying ready/copied", () => {
    const s0 = reducer(createInitialState(), { type: "addElement", data: elementData });
    const withReady: OverlayState = { ...s0, ready: true, copied: true };
    const id = withReady.items[0].id;
    const s1 = reducer(withReady, { type: "setCardOffset", id, x: 50, y: 30 });
    expect(s1.items[0].cardOffset).toEqual({ x: 50, y: 30 });
    expect(s1.ready).toBe(true);
    expect(s1.copied).toBe(true);
  });

  it("is a no-op for unknown id", () => {
    const s0 = reducer(createInitialState(), { type: "addElement", data: elementData });
    const s1 = reducer(s0, { type: "setCardOffset", id: "a999", x: 10, y: 10 });
    expect(s1.items).toEqual(s0.items);
  });

  it("is included in non-dirtying actions matrix", () => {
    const s0 = reducer(createInitialState(), { type: "addElement", data: elementData });
    const id = s0.items[0].id;
    const withReady: OverlayState = { ...s0, ready: true, copied: true };
    const s1 = reducer(withReady, { type: "setCardOffset", id, x: 5, y: 5 });
    expect(s1.ready).toBe(true);
    expect(s1.copied).toBe(true);
  });
});

// ─── Dirty invariant matrix ───────────────────────────────────────────────────
describe("dirty invariant", () => {
  it("all item-mutating actions set ready=false AND copied=false", () => {
    const dirtyFrom: OverlayState = {
      ...createInitialState(),
      ready: true,
      copied: true,
    };

    // addElement
    expect(reducer(dirtyFrom, { type: "addElement", data: elementData }).ready).toBe(false);
    expect(reducer(dirtyFrom, { type: "addElement", data: elementData }).copied).toBe(false);

    // addScreenshot
    const rect = { x: 0, y: 0, width: 1, height: 1 };
    expect(
      reducer(dirtyFrom, { type: "addScreenshot", rect, pageX: 0, pageY: 0, selected: [] }).ready,
    ).toBe(false);
    expect(
      reducer(dirtyFrom, { type: "addScreenshot", rect, pageX: 0, pageY: 0, selected: [] }).copied,
    ).toBe(false);

    // setComment — need an item first
    const withItem = reducer(createInitialState(), { type: "addElement", data: elementData });
    const withItemDirty: OverlayState = { ...withItem, ready: true, copied: true };
    const id = withItem.items[0].id;
    expect(reducer(withItemDirty, { type: "setComment", id, comment: "x" }).ready).toBe(false);
    expect(reducer(withItemDirty, { type: "setComment", id, comment: "x" }).copied).toBe(false);

    // toggleScreenshot
    expect(reducer(withItemDirty, { type: "toggleScreenshot", id }).ready).toBe(false);
    expect(reducer(withItemDirty, { type: "toggleScreenshot", id }).copied).toBe(false);

    // deleteItem
    expect(reducer(withItemDirty, { type: "deleteItem", id }).ready).toBe(false);
    expect(reducer(withItemDirty, { type: "deleteItem", id }).copied).toBe(false);
  });

  it("non-mutating actions do NOT dirty", () => {
    const cleanState: OverlayState = { ...createInitialState(), ready: true, copied: true };
    const nonDirtyActions: Parameters<typeof reducer>[1][] = [
      { type: "setMode", mode: "pick" },
      { type: "openCard", id: "x" },
      { type: "closeCard", id: "x" },
      { type: "setFabOpen", open: true },
      { type: "setFabPos", right: 10, bottom: 10 },
      { type: "setConfirming", confirming: true },
      { type: "clearCopied" },
      { type: "setCardOffset", id: "x", x: 0, y: 0 },
    ];
    for (const action of nonDirtyActions) {
      const next = reducer(cleanState, action);
      expect(next.ready, `action ${action.type} should not clear ready`).toBe(true);
    }
  });
});

describe("save/draft (TASK-30)", () => {
  function withElement() {
    return reducer(createInitialState(), {
      type: "addElement",
      data: {
        selected: [
          {
            selector: "#b",
            tagName: "BUTTON",
            text: "x",
            react: { componentName: "Btn", ancestry: ["Btn"] },
          },
        ],
        rect: { x: 0, y: 0, width: 10, height: 10 },
      },
    });
  }

  it("addElement creates an unsaved draft", () => {
    const s = withElement();
    expect(s.items).toHaveLength(1);
    expect(s.items[0].saved).toBe(false);
    expect(s.open[s.items[0].id]).toBe(true);
  });

  it("adding a second element drops the existing unsaved draft (one draft at a time)", () => {
    const s2 = reducer(withElement(), {
      type: "addElement",
      data: {
        selected: [
          {
            selector: "#t",
            tagName: "DIV",
            text: "y",
            react: { componentName: "Two", ancestry: ["Two"] },
          },
        ],
        rect: { x: 0, y: 0, width: 5, height: 5 },
      },
    });
    expect(s2.items).toHaveLength(1);
    expect(s2.items[0].selected[0].react?.componentName).toBe("Two");
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
      data: {
        componentName: "Two",
        ancestry: ["Two"],
        selector: "#t",
        tagName: "DIV",
        text: "y",
        rect: { x: 0, y: 0, width: 5, height: 5 },
      },
    });
    expect(s2.items).toHaveLength(2);
    expect(s2.items[0].saved).toBe(true);
    expect(s2.items[1].saved).toBe(false);
  });
});
