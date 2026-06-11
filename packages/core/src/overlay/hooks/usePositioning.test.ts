// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Item, Rect } from "../state/types.js";
import { computeVRect } from "./usePositioning.js";

// Minimal factory for a screenshot item
function screenshotItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "s1",
    kind: "screenshot",
    selected: [],
    rect: { x: 0, y: 0, width: 100, height: 50 },
    pageX: 200,
    pageY: 400,
    comment: "",
    wantScreenshot: true,
    ...overrides,
  };
}

// Minimal factory for an element item
function elementItem(overrides: Partial<Item> & { selector?: string } = {}): Item {
  const { selector, ...rest } = overrides;
  return {
    id: "e1",
    kind: "element",
    selected: [
      {
        selector: selector ?? "#my-el",
        tagName: "div",
        text: "",
        react: { componentName: "MyComponent", ancestry: [] },
      },
    ],
    rect: { x: 10, y: 20, width: 80, height: 30 },
    comment: "",
    wantScreenshot: false,
    ...rest,
  };
}

// ─── Screenshot kind ──────────────────────────────────────────────────────────

describe("computeVRect — screenshot kind", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollX", { value: 50, configurable: true, writable: true });
    Object.defineProperty(window, "scrollY", { value: 100, configurable: true, writable: true });
  });

  afterEach(() => {
    Object.defineProperty(window, "scrollX", { value: 0, configurable: true, writable: true });
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true, writable: true });
  });

  it("computes viewport x = pageX - scrollX", () => {
    const item = screenshotItem({ pageX: 300, pageY: 500 });
    const r = computeVRect(item);
    expect(r.x).toBe(300 - 50); // 250
  });

  it("computes viewport y = pageY - scrollY", () => {
    const item = screenshotItem({ pageX: 300, pageY: 500 });
    const r = computeVRect(item);
    expect(r.y).toBe(500 - 100); // 400
  });

  it("preserves rect.width and rect.height", () => {
    const item = screenshotItem({
      pageX: 300,
      pageY: 500,
      rect: { x: 0, y: 0, width: 120, height: 60 },
    });
    const r = computeVRect(item);
    expect(r.width).toBe(120);
    expect(r.height).toBe(60);
  });

  it("works with zero scroll", () => {
    Object.defineProperty(window, "scrollX", { value: 0, configurable: true, writable: true });
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true, writable: true });
    const item = screenshotItem({ pageX: 200, pageY: 300 });
    const r = computeVRect(item);
    expect(r.x).toBe(200);
    expect(r.y).toBe(300);
  });
});

// ─── Element kind — selector match ───────────────────────────────────────────

describe("computeVRect — element kind with matching selector", () => {
  let el: HTMLDivElement;

  beforeEach(() => {
    el = document.createElement("div");
    el.id = "test-el";
    document.body.appendChild(el);
    // jsdom getBoundingClientRect returns all zeros; stub it
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      x: 10,
      y: 20,
      width: 80,
      height: 30,
      top: 20,
      left: 10,
      right: 90,
      bottom: 50,
      toJSON: () => ({}),
    } as DOMRect);
  });

  afterEach(() => {
    el.remove();
    vi.restoreAllMocks();
  });

  it("returns el.getBoundingClientRect() when selector matches", () => {
    const item = elementItem({ selector: "#test-el" });
    const r = computeVRect(item);
    expect(r.x).toBe(10);
    expect(r.y).toBe(20);
    expect(r.width).toBe(80);
    expect(r.height).toBe(30);
  });
});

// ─── Element kind — selector miss → fallback to item.rect ────────────────────

describe("computeVRect — element kind with no matching selector", () => {
  it("falls back to item.rect when selector finds nothing", () => {
    const fallback: Rect = { x: 5, y: 15, width: 200, height: 100 };
    const item = elementItem({ selector: "#does-not-exist", rect: fallback });
    const r = computeVRect(item);
    expect(r).toEqual(fallback);
  });

  it("falls back to item.rect when selector is empty string", () => {
    const fallback: Rect = { x: 1, y: 2, width: 3, height: 4 };
    const item = elementItem({ selector: "", rect: fallback });
    const r = computeVRect(item);
    expect(r).toEqual(fallback);
  });
});
