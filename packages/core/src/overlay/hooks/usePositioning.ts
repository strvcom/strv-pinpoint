import { useEffect, useRef } from "preact/hooks";
import { clusterAnchors } from "../state/cluster.js";
import type { Item, Rect } from "../state/types.js";

// ─── Registry contract ────────────────────────────────────────────────────────
// OverlayRoot (Task 13) creates the registry and passes it down.

export interface NodeRefs {
  box?: HTMLElement | null;
  badge?: HTMLElement | null;
  card?: HTMLElement | null;
  hb?: HTMLElement | null;
}

/** Keyed by item id. */
export type NodeRegistry = Map<string, NodeRefs>;

// ─── Z constant (matches install.ts) ─────────────────────────────────────────
const Z = 2147483640;

// ─── Pure helper: compute the viewport rect for a single item ─────────────────
// Port of install.ts:194-206.
// Exported so it can be unit-tested in a Node environment.

export function computeVRect(item: Item): Rect {
  if (item.kind === "screenshot") {
    return {
      x: item.pageX! - (typeof window !== "undefined" ? window.scrollX : 0),
      y: item.pageY! - (typeof window !== "undefined" ? window.scrollY : 0),
      width: item.rect.width,
      height: item.rect.height,
    };
  }
  const selector = item.selected[0]?.selector;
  const el = selector ? document.querySelector(selector) : null;
  if (el) return el.getBoundingClientRect() as Rect;
  return item.rect;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UsePositioningArgs {
  itemsRef: { current: Item[] };
  openRef: { current: Record<string, boolean> };
  mouseRef: { current: { x: number; y: number } | null };
  fabOpen: boolean;
  registry: NodeRegistry;
}

/**
 * Sets up scroll/resize/mousemove listeners + an rAF-throttled `positionAll`
 * that writes computed positions directly to the DOM nodes held in `registry`.
 * Port of install.ts:529-594 (positionAll) and install.ts:610-631 (listener setup).
 *
 * Returns a stable `reposition()` function that schedules an rAF-throttled
 * re-position — useful for card-drag updates in OverlayRoot.
 */
export function usePositioning(args: UsePositioningArgs): { reposition: () => void } {
  const { itemsRef, openRef, mouseRef, fabOpen, registry } = args;

  // Keep a stable ref to the latest fabOpen so the mousemove guard can read it
  // without re-subscribing.
  const fabOpenRef = useRef(fabOpen);
  fabOpenRef.current = fabOpen;

  // scheduleRepositionRef lets us expose a stable `reposition()` to callers
  // (e.g. OverlayRoot for card-drag) without recreating the function on each render.
  const scheduleRepositionRef = useRef<() => void>(() => {});

  useEffect(() => {
    let raf: number | null = null;

    function positionAll() {
      if (!fabOpenRef.current) return;

      const items = itemsRef.current;

      const anchors = items.map((it) => {
        const r = computeVRect(it);
        return { id: it.id, x: r.x, y: Math.max(0, r.y - 18) };
      });

      const isExpanded = (
        cx: number,
        cy: number,
        _multi: boolean,
        memberIds: string[],
      ): boolean => {
        const m = mouseRef.current;
        const near = !!m && Math.abs(m.x - cx) < 90 && Math.abs(m.y - cy) < 90;
        const anyOpen = memberIds.some((id) => openRef.current[id]);
        return near || anyOpen;
      };

      const placements = clusterAnchors(anchors, isExpanded);

      for (const p of placements) {
        const refs = registry.get(p.id);
        if (!refs) continue;

        const item = items.find((it) => it.id === p.id);
        if (!item) continue;

        const r = computeVRect(item);
        const n = items.findIndex((it) => it.id === p.id) + 1;
        const cardOffset = item.cardOffset ?? { x: 0, y: 0 };

        if (refs.box) {
          refs.box.style.left = `${r.x}px`;
          refs.box.style.top = `${r.y}px`;
          refs.box.style.width = `${r.width}px`;
          refs.box.style.height = `${r.height}px`;
        }

        if (refs.badge) {
          refs.badge.textContent = String(n);
          refs.badge.style.left = `${p.clusterX}px`;
          refs.badge.style.top = `${p.clusterY}px`;
          refs.badge.style.transform = `translate(${p.ox}px, ${p.oy}px)`;
          refs.badge.style.zIndex = String(Z + p.k + (p.expanded ? 6 : 0));
        }

        if (refs.card) {
          refs.card.style.left = `${p.clusterX + p.ox + 22 + cardOffset.x}px`;
          refs.card.style.top = `${p.clusterY + p.oy + cardOffset.y}px`;
          if (refs.hb) refs.hb.textContent = String(n);
        }
      }
    }

    function scheduleReposition() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        positionAll();
      });
    }

    // Expose via ref so the stable wrapper below can delegate to the current closure.
    scheduleRepositionRef.current = scheduleReposition;

    function onScroll() {
      scheduleReposition();
    }

    function onResize() {
      scheduleReposition();
    }

    function onMouseMove(e: MouseEvent) {
      if (!fabOpenRef.current || !itemsRef.current.length) return;
      mouseRef.current = { x: e.clientX, y: e.clientY };
      scheduleReposition();
    }

    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    document.addEventListener("mousemove", onMouseMove, true);

    // Run once immediately so the initial render positions everything.
    positionAll();

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("mousemove", onMouseMove, true);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [fabOpen]); // re-subscribe when fabOpen changes; refs are stable

  // Stable wrapper — always delegates to the current scheduleReposition closure.
  const repositionRef = useRef(() => scheduleRepositionRef.current());
  return { reposition: repositionRef.current };
}
