import { describe, expect, it } from "vitest";
import { latestSelection, serializeState } from "./serialize.js";
import type { Item, OverlayState, Rect } from "./types.js";
import type { Snapshot } from "./serialize.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<Item> & { id: string }): Item {
  return {
    id: overrides.id,
    kind: overrides.kind ?? "element",
    componentName: "componentName" in overrides ? (overrides.componentName as string | null) : "Button",
    ancestry: overrides.ancestry ?? ["App"],
    selector: overrides.selector ?? ".btn",
    tagName: overrides.tagName ?? "button",
    text: overrides.text ?? "Click me",
    rect: overrides.rect ?? { x: 0, y: 0, width: 0, height: 0 },
    comment: overrides.comment ?? "",
    wantScreenshot: overrides.wantScreenshot ?? true,
    cardOffset: overrides.cardOffset,
  };
}

function makeState(overrides: Partial<OverlayState> = {}): OverlayState {
  return {
    mode: null,
    items: [],
    open: {},
    fabOpen: false,
    ready: false,
    copied: false,
    nextId: 1,
    batchId: 0,
    lastPromptId: null,
    confirming: false,
    fab: { right: 16, bottom: 16 },
    ...overrides,
  };
}

// vrect stub: returns a predictable rect based on item.id so we can assert
// that serializeState uses vrect output, NOT item.rect.
const vrectStub = (it: Item): Rect => ({
  x: 1000 + Number(it.id.replace("a", "")),
  y: 2000 + Number(it.id.replace("a", "")),
  width: 300,
  height: 400,
});

// ─── Golden test: 2-item state ────────────────────────────────────────────────
describe("serializeState — golden test (2 items)", () => {
  const item1 = makeItem({
    id: "a1",
    componentName: "Header",
    ancestry: ["App", "Nav"],
    selector: "#header",
    tagName: "header",
    text: "My App",
    rect: { x: 9, y: 9, width: 9, height: 9 }, // must NOT appear in output
    comment: "look at this",
    wantScreenshot: true,
  });

  const item2 = makeItem({
    id: "a2",
    componentName: "Footer",
    ancestry: ["App"],
    selector: "#footer",
    tagName: "footer",
    text: "© 2026",
    rect: { x: 8, y: 8, width: 8, height: 8 }, // must NOT appear in output
    comment: "",
    wantScreenshot: false,
  });

  const state = makeState({ batchId: 3, ready: true, items: [item1, item2] });
  const snap: Snapshot = serializeState(state, vrectStub);

  it("top-level fields match state", () => {
    expect(snap.batchId).toBe(3);
    expect(snap.ready).toBe(true);
    expect(snap.items).toHaveLength(2);
  });

  it("first item: badge=1, fields correct", () => {
    expect(snap.items[0]).toEqual({
      id: "a1",
      badge: 1,
      componentName: "Header",
      ancestry: ["App", "Nav"],
      selector: "#header",
      tagName: "header",
      text: "My App",
      rect: { x: 1001, y: 2001, width: 300, height: 400 }, // from vrect
      comment: "look at this",
      wantScreenshot: true,
    });
  });

  it("second item: badge=2, fields correct", () => {
    expect(snap.items[1]).toEqual({
      id: "a2",
      badge: 2,
      componentName: "Footer",
      ancestry: ["App"],
      selector: "#footer",
      tagName: "footer",
      text: "© 2026",
      rect: { x: 1002, y: 2002, width: 300, height: 400 }, // from vrect
      comment: "",
      wantScreenshot: false,
    });
  });

  it("rect comes from vrect, NOT item.rect", () => {
    // item1.rect is {9,9,9,9}; vrect returns {1001,2001,300,400}
    expect(snap.items[0].rect).not.toEqual(item1.rect);
    expect(snap.items[0].rect).toEqual({ x: 1001, y: 2001, width: 300, height: 400 });
  });
});

// ─── Empty state ─────────────────────────────────────────────────────────────
describe("serializeState — empty state", () => {
  it("returns empty items array with correct batchId and ready", () => {
    const state = makeState({ batchId: 7, ready: false });
    const snap = serializeState(state, vrectStub);
    expect(snap).toEqual({ batchId: 7, ready: false, items: [] });
  });
});

// ─── badge is strictly 1-based ────────────────────────────────────────────────
describe("badge is 1-based (i+1)", () => {
  it("single item has badge=1", () => {
    const state = makeState({ items: [makeItem({ id: "a1" })] });
    const snap = serializeState(state, vrectStub);
    expect(snap.items[0].badge).toBe(1);
  });

  it("three items have badges 1, 2, 3", () => {
    const state = makeState({
      items: [makeItem({ id: "a1" }), makeItem({ id: "a2" }), makeItem({ id: "a3" })],
    });
    const snap = serializeState(state, vrectStub);
    expect(snap.items.map((it) => it.badge)).toEqual([1, 2, 3]);
  });
});

// ─── latestSelection ─────────────────────────────────────────────────────────
describe("latestSelection", () => {
  it("returns null for an empty snapshot", () => {
    const snap = serializeState(makeState(), vrectStub);
    expect(latestSelection(snap)).toBeNull();
  });

  it("returns the last item", () => {
    const state = makeState({
      items: [makeItem({ id: "a1" }), makeItem({ id: "a2" })],
    });
    const snap = serializeState(state, vrectStub);
    const sel = latestSelection(snap);
    expect(sel).not.toBeNull();
    expect(sel!.id).toBe("a2");
    expect(sel!.badge).toBe(2);
  });

  it("returns the only item when there is exactly one", () => {
    const state = makeState({ items: [makeItem({ id: "a1" })] });
    const snap = serializeState(state, vrectStub);
    expect(latestSelection(snap)!.id).toBe("a1");
  });
});

// ─── Snapshot purity — vrect called once per item ────────────────────────────
describe("vrect called exactly once per item", () => {
  it("calls vrect once per item, in order", () => {
    const calls: string[] = [];
    const trackingVrect = (it: Item): Rect => {
      calls.push(it.id);
      return { x: 0, y: 0, width: 10, height: 10 };
    };
    const state = makeState({
      items: [makeItem({ id: "a1" }), makeItem({ id: "a2" }), makeItem({ id: "a3" })],
    });
    serializeState(state, trackingVrect);
    expect(calls).toEqual(["a1", "a2", "a3"]);
  });
});

// ─── componentName: null survives round-trip ──────────────────────────────────
describe("componentName null", () => {
  it("null componentName is preserved (not coerced to empty string)", () => {
    const state = makeState({
      items: [makeItem({ id: "a1", componentName: null })],
    });
    const snap = serializeState(state, vrectStub);
    expect(snap.items[0].componentName).toBeNull();
  });
});
