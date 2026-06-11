// Snapshot serialization, ported verbatim from install.ts:207-234.
// This is the BRIDGE CONTRACT — the shape written to window globals and
// pasted into the Claude Code session.  Do NOT change field names or ordering.

import type { Item, Kind, OverlayState, Rect, Selection } from "./types.js";

export interface SerializedItem {
  id: string;
  badge: number; // 1-based array index
  kind: Kind;
  selected: Selection[];
  rect: Rect; // live rect from vrect(), NOT item.rect
  comment: string;
  wantScreenshot: boolean;
}

export interface Snapshot {
  batchId: number;
  ready: boolean;
  items: SerializedItem[];
}

/**
 * Serialize the overlay state into the clipboard/paste contract shape.
 *
 * @param state  Current overlay state.
 * @param vrect  Returns the live viewport rect for an item (may query the DOM
 *               or fall back to stored rect — the caller decides; this module
 *               never touches the DOM).
 */
export function serializeState(state: OverlayState, vrect: (it: Item) => Rect): Snapshot {
  return {
    batchId: state.batchId,
    ready: state.ready,
    items: state.items.map((it, i) => {
      const r = vrect(it);
      return {
        id: it.id,
        badge: i + 1,
        kind: it.kind,
        selected: it.selected,
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        comment: it.comment,
        wantScreenshot: it.wantScreenshot,
      };
    }),
  };
}

/**
 * Return the last selected item from a snapshot, or null when the snapshot
 * is empty.  Mirrors install.ts:231-233.
 */
export function latestSelection(snap: Snapshot): SerializedItem | null {
  return snap.items.length ? snap.items[snap.items.length - 1] : null;
}
