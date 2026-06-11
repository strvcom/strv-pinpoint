import { describe, expect, it } from "vitest";
import type { Selection } from "../types.js";
import { resolveTouchedSelections } from "./touched-selections.js";

type FakeEl = { id: string; rect: { x: number; y: number; width: number; height: number } };
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h });

function makeDeps(opts: { stacksByPoint: FakeEl[][]; host?: FakeEl }) {
  const points: FakeEl[][] = [...opts.stacksByPoint];
  return {
    elementsFromPoint: () =>
      (points.length > 1 ? points.shift()! : points[0]) as unknown as Element[],
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
    const card = { id: "card", rect: rect(0, 0, 100, 100) };
    const deps = makeDeps({ stacksByPoint: [[button, section, card]] });
    const out = resolveTouchedSelections(region, deps);
    expect(out.map((s) => s.selector).sort()).toEqual(["#button", "#card"]);
  });

  it("dedups the same element across multiple sample points", () => {
    const region = rect(0, 0, 100, 100);
    const a = { id: "a", rect: rect(1, 1, 5, 5) };
    const card = { id: "card", rect: rect(0, 0, 100, 100) };
    const deps = makeDeps({
      stacksByPoint: [
        [a, card],
        [a, card],
        [a, card],
      ],
    });
    const out = resolveTouchedSelections(region, deps);
    expect(out.map((s) => s.selector).sort()).toEqual(["#a", "#card"]);
  });

  it("region smaller than its leaf yields a single selection (outermost = innermost)", () => {
    const region = rect(0, 0, 10, 10);
    const big = { id: "big", rect: rect(-50, -50, 500, 500) };
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
