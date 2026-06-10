import { describe, expect, it } from "vitest";
import type { Anchor, Placement } from "./cluster.js";
import { clusterAnchors } from "./cluster.js";

// Helper: isExpanded always returns false (collapsed)
const collapsed = () => false;
// Helper: isExpanded always returns true (expanded)
const expanded = () => true;

// Helper: typed collapsed/expanded with full signature
const collapsedFull = (_cx: number, _cy: number, _multi: boolean, _ids: string[]) => false;
const expandedFull = (_cx: number, _cy: number, _multi: boolean, _ids: string[]) => true;

// ─── Single anchor ────────────────────────────────────────────────────────────
describe("single anchor", () => {
  it("produces one placement, ox=0 oy=0, multi=false, k=0", () => {
    const anchors: Anchor[] = [{ id: "a1", x: 100, y: 200 }];
    const result = clusterAnchors(anchors, collapsed);
    expect(result).toHaveLength(1);
    const p = result[0];
    expect(p.id).toBe("a1");
    expect(p.clusterX).toBe(100);
    expect(p.clusterY).toBe(200);
    expect(p.ox).toBe(0);
    expect(p.oy).toBe(0);
    expect(p.multi).toBe(false);
    expect(p.k).toBe(0);
  });

  it("multi=false even when isExpanded returns true", () => {
    const result = clusterAnchors([{ id: "x", x: 0, y: 0 }], expanded);
    expect(result[0].multi).toBe(false);
    expect(result[0].ox).toBe(0);
    expect(result[0].oy).toBe(0);
  });
});

// ─── Two anchors within 18px — collapsed ─────────────────────────────────────
describe("two anchors within 18px, collapsed", () => {
  it("forms one cluster, k=0 member has ox=oy=0, k=1 member has ox=4,oy=4", () => {
    const anchors: Anchor[] = [
      { id: "a1", x: 50, y: 50 },
      { id: "a2", x: 55, y: 55 }, // |55-50|=5 <= 18
    ];
    const result = clusterAnchors(anchors, collapsed);
    expect(result).toHaveLength(2);

    const p0 = result.find((p) => p.id === "a1") as Placement;
    const p1 = result.find((p) => p.id === "a2") as Placement;

    expect(p0.multi).toBe(true);
    expect(p1.multi).toBe(true);

    // Same cluster origin (first anchor's coordinates)
    expect(p0.clusterX).toBe(50);
    expect(p0.clusterY).toBe(50);
    expect(p1.clusterX).toBe(50);
    expect(p1.clusterY).toBe(50);

    // k=0 → ox=0, oy=0; k=1 (collapsed) → ox=4, oy=4
    expect(p0.k).toBe(0);
    expect(p0.ox).toBe(0);
    expect(p0.oy).toBe(0);

    expect(p1.k).toBe(1);
    expect(p1.ox).toBe(4);
    expect(p1.oy).toBe(4);
  });
});

// ─── Two anchors within 18px — expanded ──────────────────────────────────────
describe("two anchors within 18px, expanded", () => {
  it("k=0 ox=0,oy=0; k=1 ox=0,oy=24", () => {
    const anchors: Anchor[] = [
      { id: "a1", x: 50, y: 50 },
      { id: "a2", x: 55, y: 55 },
    ];
    const result = clusterAnchors(anchors, expanded);
    expect(result).toHaveLength(2);

    const p0 = result.find((p) => p.id === "a1") as Placement;
    const p1 = result.find((p) => p.id === "a2") as Placement;

    expect(p0.ox).toBe(0);
    expect(p0.oy).toBe(0);

    expect(p1.ox).toBe(0);
    expect(p1.oy).toBe(24);
  });
});

// ─── Two anchors >18px apart → two clusters ──────────────────────────────────
describe("two anchors more than 18px apart", () => {
  it("forms two separate clusters, both multi=false", () => {
    const anchors: Anchor[] = [
      { id: "a1", x: 0, y: 0 },
      { id: "a2", x: 100, y: 100 }, // |100-0|=100 > 18
    ];
    const result = clusterAnchors(anchors, expanded); // expanded shouldn't matter
    expect(result).toHaveLength(2);

    const p0 = result.find((p) => p.id === "a1") as Placement;
    const p1 = result.find((p) => p.id === "a2") as Placement;

    expect(p0.multi).toBe(false);
    expect(p0.clusterX).toBe(0);
    expect(p0.clusterY).toBe(0);
    expect(p0.ox).toBe(0);
    expect(p0.oy).toBe(0);
    expect(p0.k).toBe(0);

    expect(p1.multi).toBe(false);
    expect(p1.clusterX).toBe(100);
    expect(p1.clusterY).toBe(100);
    expect(p1.ox).toBe(0);
    expect(p1.oy).toBe(0);
    expect(p1.k).toBe(0);
  });

  it("exactly 19px apart in x → separate clusters", () => {
    const anchors: Anchor[] = [
      { id: "a1", x: 0, y: 0 },
      { id: "a2", x: 19, y: 0 }, // |19-0|=19 > 18
    ];
    const result = clusterAnchors(anchors, collapsed);
    expect(result[0].clusterX).toBe(0);
    expect(result[1].clusterX).toBe(19);
    expect(result[0].multi).toBe(false);
    expect(result[1].multi).toBe(false);
  });
});

// ─── Exact 18px boundary → same cluster ─────────────────────────────────────
describe("boundary: exactly 18px apart", () => {
  it("anchors exactly 18px apart in x join the same cluster", () => {
    const anchors: Anchor[] = [
      { id: "a1", x: 0, y: 0 },
      { id: "a2", x: 18, y: 0 }, // |18-0|=18 <= 18 → same cluster
    ];
    const result = clusterAnchors(anchors, collapsed);
    expect(result).toHaveLength(2);
    expect(result[0].clusterX).toBe(0);
    expect(result[1].clusterX).toBe(0); // same cluster origin
    expect(result[0].multi).toBe(true);
    expect(result[1].multi).toBe(true);
  });
});

// ─── Ordering / k correctness ─────────────────────────────────────────────────
describe("ordering and k correctness", () => {
  it("k values are 0-based insertion order within the cluster", () => {
    const anchors: Anchor[] = [
      { id: "a1", x: 0, y: 0 },
      { id: "a2", x: 5, y: 5 },
      { id: "a3", x: 10, y: 10 },
    ];
    const result = clusterAnchors(anchors, collapsed);
    expect(result).toHaveLength(3);

    // All three should cluster (all within 18px of the first)
    const p0 = result.find((p) => p.id === "a1") as Placement;
    const p1 = result.find((p) => p.id === "a2") as Placement;
    const p2 = result.find((p) => p.id === "a3") as Placement;

    expect(p0.k).toBe(0);
    expect(p1.k).toBe(1);
    expect(p2.k).toBe(2);

    // Collapsed offsets: k*4, k*4
    expect(p0.ox).toBe(0);
    expect(p0.oy).toBe(0);
    expect(p1.ox).toBe(4);
    expect(p1.oy).toBe(4);
    expect(p2.ox).toBe(8);
    expect(p2.oy).toBe(8);
  });

  it("k=2 expanded → oy=48", () => {
    const anchors: Anchor[] = [
      { id: "a1", x: 0, y: 0 },
      { id: "a2", x: 5, y: 5 },
      { id: "a3", x: 10, y: 10 },
    ];
    const result = clusterAnchors(anchors, expanded);
    const p2 = result.find((p) => p.id === "a3") as Placement;
    expect(p2.k).toBe(2);
    expect(p2.ox).toBe(0);
    expect(p2.oy).toBe(48);
  });

  it("returns placements in original insertion order", () => {
    const anchors: Anchor[] = [
      { id: "a1", x: 0, y: 0 },
      { id: "a2", x: 5, y: 5 },
    ];
    const result = clusterAnchors(anchors, collapsed);
    expect(result[0].id).toBe("a1");
    expect(result[1].id).toBe("a2");
  });
});

// ─── Empty input ─────────────────────────────────────────────────────────────
describe("empty input", () => {
  it("returns empty array", () => {
    expect(clusterAnchors([], collapsed)).toEqual([]);
  });
});

// ─── isExpanded callback receives correct args ────────────────────────────────
describe("isExpanded callback arguments", () => {
  it("passes clusterX, clusterY, multi, and memberIds to the callback", () => {
    const calls: Array<[number, number, boolean, string[]]> = [];
    const anchors: Anchor[] = [
      { id: "a1", x: 77, y: 88 },
      { id: "a2", x: 80, y: 90 },
    ];
    clusterAnchors(anchors, (cx, cy, anyMulti, memberIds) => {
      calls.push([cx, cy, anyMulti, memberIds]);
      return false;
    });
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(77);
    expect(calls[0][1]).toBe(88);
    expect(calls[0][2]).toBe(true);
    expect(calls[0][3]).toEqual(["a1", "a2"]);
  });

  it("memberIds contains all cluster member ids in insertion order", () => {
    const receivedIds: string[][] = [];
    const anchors: Anchor[] = [
      { id: "x1", x: 0, y: 0 },
      { id: "x2", x: 5, y: 5 },
      { id: "x3", x: 10, y: 10 },
    ];
    clusterAnchors(anchors, (_cx, _cy, _multi, ids) => {
      receivedIds.push(ids);
      return false;
    });
    expect(receivedIds).toHaveLength(1);
    expect(receivedIds[0]).toEqual(["x1", "x2", "x3"]);
  });
});

// ─── Placement.expanded field ─────────────────────────────────────────────────
describe("Placement.expanded field", () => {
  it("expanded=false for single-member cluster regardless of callback", () => {
    const result = clusterAnchors([{ id: "a1", x: 0, y: 0 }], expandedFull);
    expect(result[0].expanded).toBe(false);
  });

  it("expanded=false for multi-member cluster when callback returns false", () => {
    const anchors: Anchor[] = [
      { id: "a1", x: 0, y: 0 },
      { id: "a2", x: 5, y: 5 },
    ];
    const result = clusterAnchors(anchors, collapsedFull);
    expect(result[0].expanded).toBe(false);
    expect(result[1].expanded).toBe(false);
  });

  it("expanded=true for all members of a multi-member cluster when callback returns true", () => {
    const anchors: Anchor[] = [
      { id: "a1", x: 0, y: 0 },
      { id: "a2", x: 5, y: 5 },
    ];
    const result = clusterAnchors(anchors, expandedFull);
    expect(result[0].expanded).toBe(true);
    expect(result[1].expanded).toBe(true);
  });

  it("expanded field drives oy offset correctly", () => {
    const anchors: Anchor[] = [
      { id: "a1", x: 0, y: 0 },
      { id: "a2", x: 5, y: 5 },
    ];
    // expanded: oy = k*24
    const expResult = clusterAnchors(anchors, expandedFull);
    const p1exp = expResult.find((p) => p.id === "a2") as Placement;
    expect(p1exp.expanded).toBe(true);
    expect(p1exp.oy).toBe(24);

    // collapsed: oy = k*4
    const colResult = clusterAnchors(anchors, collapsedFull);
    const p1col = colResult.find((p) => p.id === "a2") as Placement;
    expect(p1col.expanded).toBe(false);
    expect(p1col.oy).toBe(4);
  });
});
