import type { Rect, Selection } from "@pinpoint/core";

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
      const x = region.x + stepX * i;
      const y = region.y + stepY * j;
      const stack = deps.elementsFromPoint(x, y).filter((el) => !deps.isHost(el));
      if (!stack.length) continue;
      const innermost = stack[0];
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
