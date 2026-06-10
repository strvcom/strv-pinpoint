import { useEffect, useReducer, useRef, useState } from "preact/hooks";
import { ANNOTATIONS_GLOBAL, REGION_GLOBAL, SELECTION_GLOBAL } from "../globals.js";
import { useDrag } from "../hooks/useDrag.js";
import { useEscape } from "../hooks/useEscape.js";
import { usePicker } from "../hooks/usePicker.js";
import type { NodeRegistry } from "../hooks/usePositioning.js";
import { computeVRect, usePositioning } from "../hooks/usePositioning.js";
import { useScreenshotRegion } from "../hooks/useScreenshotRegion.js";
import { createInitialState, reducer } from "../state/reducer.js";
import { latestSelection, serializeState } from "../state/serialize.js";
import type { Rect } from "../state/types.js";
import { HoverLayer } from "./HoverLayer.js";
import { MarksLayer } from "./MarksLayer.js";
import { MarqueeLayer } from "./MarqueeLayer.js";
import { Toolbar } from "./Toolbar.js";

export function OverlayRoot({ hostEl }: { hostEl: HTMLElement | null }) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);

  // ─── Stable refs for the positioning hook ─────────────────────────────────
  const itemsRef = useRef(state.items);
  const openRef = useRef(state.open);
  itemsRef.current = state.items;
  openRef.current = state.open;

  const mouseRef = useRef<{ x: number; y: number } | null>(null);

  // ─── Node registry ────────────────────────────────────────────────────────
  const registry = useRef<NodeRegistry>(new Map()).current;

  function registerNode(id: string, part: "box" | "badge" | "card" | "hb", el: HTMLElement | null) {
    const r = registry.get(id) ?? {};
    (r as Record<string, HTMLElement | null>)[part] = el;
    registry.set(id, r);
  }

  // ─── Positioning hook ─────────────────────────────────────────────────────
  const { reposition } = usePositioning({
    itemsRef,
    openRef,
    mouseRef,
    fabOpen: state.fabOpen,
    registry,
  });

  // ─── Hover / marquee local state ──────────────────────────────────────────
  const [hoverRect, setHoverRect] = useState<Rect | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<Rect | null>(null);

  // ─── Picker hook ──────────────────────────────────────────────────────────
  usePicker({
    mode: state.mode,
    hostEl,
    onHover: setHoverRect,
    onPick: (data: unknown) => {
      const d = data as
        | {
            componentName?: string | null;
            ancestry?: string[];
            selector?: string;
            tagName?: string;
            text?: string;
            rect?: Rect;
          }
        | undefined;
      dispatch({
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
      // Mode stays "pick" after each pick — matching install.ts:659-665 behavior.
    },
  });

  // ─── Screenshot region hook ───────────────────────────────────────────────
  useScreenshotRegion({
    mode: state.mode,
    hostEl,
    onMarquee: setMarqueeRect,
    onCapture: (rect: Rect) => {
      dispatch({
        type: "addScreenshot",
        rect,
        pageX: rect.x + window.scrollX,
        pageY: rect.y + window.scrollY,
      });
      (window as unknown as Record<string, unknown>)[REGION_GLOBAL] = rect;
    },
  });

  // ─── Escape hook ──────────────────────────────────────────────────────────
  useEscape(() => dispatch({ type: "setMode", mode: null }));

  // ─── Serialize effect ─────────────────────────────────────────────────────
  // Writes the window globals whenever state changes (state is a new object each dispatch).
  useEffect(() => {
    const snap = serializeState(state, computeVRect);
    (window as unknown as Record<string, unknown>)[ANNOTATIONS_GLOBAL] = snap;
    (window as unknown as Record<string, unknown>)[SELECTION_GLOBAL] = latestSelection(snap);
  }, [state]);

  // ─── Reposition on structural change ──────────────────────────────────────
  // The positioning rAF loop only fires on scroll/resize/mousemove. install.ts also
  // called positionAll() after every mutation (draw()), so badges/cards are placed
  // immediately on pick/open/close/delete/clear and when the FAB opens — not only
  // after the next mouse move. Refs (itemsRef/openRef) are synced in the render body
  // above, and card/badge nodes are registered during commit, so reposition() (next
  // rAF) sees the current items + DOM nodes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reposition is stable; we re-run on structural changes only.
  useEffect(() => {
    reposition();
  }, [state.items, state.open, state.fabOpen]);

  // ─── Copy flow ────────────────────────────────────────────────────────────
  const copyTimer = useRef<number | undefined>(undefined);
  const lastPromptId = useRef<string | null>(null);

  function doCopy() {
    if (!state.items.length) return;
    dispatch({ type: "markCopied" });
    // Inline snapshot with ready=true and bumped batchId (belt-and-suspenders before
    // the effect fires — the effect will also write the globals after re-render).
    const snapState = { ...state, ready: true, batchId: state.batchId + 1 };
    const snap = serializeState(snapState, computeVRect);
    (window as unknown as Record<string, unknown>)[ANNOTATIONS_GLOBAL] = snap;
    const link = (window as unknown as Record<string, unknown>).__pinpointLink as
      | { send: (items: unknown) => Promise<string> }
      | undefined;
    if (link) {
      Promise.resolve(link.send(snap.items))
        .then((id: string) => {
          lastPromptId.current = id;
        })
        .catch(() => {});
    }
    if (copyTimer.current !== undefined) clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => {
      dispatch({ type: "clearCopied" });
    }, 1600);
  }

  // ─── Link running-status subscription ────────────────────────────────────
  useEffect(() => {
    const link = (window as unknown as Record<string, unknown>).__pinpointLink as
      | { init: (cb: (promptId: unknown, status: string) => void) => void }
      | undefined;
    if (!link) return;
    link.init((promptId: unknown, status: string) => {
      if (status === "running" && promptId === lastPromptId.current) {
        dispatch({ type: "consumeRunning" });
      }
    });
  }, []);

  // ─── pressingBadgeRef — live ref for Card focus-out guard (CRITICAL #1) ──
  const pressingBadgeRef = useRef<string | null>(null);

  // Clear on document pointerup (capture) so the guard resets after any press.
  useEffect(() => {
    function onPointerUp() {
      pressingBadgeRef.current = null;
    }
    document.addEventListener("pointerup", onPointerUp, true);
    return () => document.removeEventListener("pointerup", onPointerUp, true);
  }, []);

  // ─── confirmingRef — mirrors state.confirming for live reads ──────────────
  const confirmingRef = useRef(state.confirming);
  confirmingRef.current = state.confirming;

  // ─── Clear-all local state ────────────────────────────────────────────────
  const [clearOpen, setClearOpen] = useState(false);

  function handleClear() {
    if (state.items.length) setClearOpen(true);
  }

  function handleConfirmClear() {
    dispatch({ type: "clearAll" });
    setClearOpen(false);
  }

  function handleCancelClear() {
    setClearOpen(false);
  }

  // ─── FAB drag (orb + handle) ─────────────────────────────────────────────
  // "dragMoved" flag: suppress the orb click right after a drag (install.ts:131-137).
  const dragMovedRef = useRef(false);

  const fabDragStartRight = useRef(state.fab.right);
  const fabDragStartBottom = useRef(state.fab.bottom);

  const orbPointerDown = useDrag({
    onStart: () => {
      dragMovedRef.current = false;
      fabDragStartRight.current = state.fab.right;
      fabDragStartBottom.current = state.fab.bottom;
    },
    onMove: (dx: number, dy: number) => {
      dragMovedRef.current = true;
      const right = Math.max(0, fabDragStartRight.current - dx);
      const bottom = Math.max(0, fabDragStartBottom.current - dy);
      dispatch({ type: "setFabPos", right, bottom });
    },
    onEnd: (_moved: boolean) => {
      // dragMovedRef is already set in onMove; the orb click handler reads it.
    },
  });

  const handlePointerDown = useDrag({
    onStart: () => {
      fabDragStartRight.current = state.fab.right;
      fabDragStartBottom.current = state.fab.bottom;
    },
    onMove: (dx: number, dy: number) => {
      const right = Math.max(0, fabDragStartRight.current - dx);
      const bottom = Math.max(0, fabDragStartBottom.current - dy);
      dispatch({ type: "setFabPos", right, bottom });
    },
  });

  function handleOrbClick() {
    if (dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }
    if (state.fabOpen) {
      dispatch({ type: "setFabOpen", open: false });
      dispatch({ type: "setMode", mode: null });
    } else {
      dispatch({ type: "setFabOpen", open: true });
      dispatch({ type: "setMode", mode: "pick" });
    }
  }

  // ─── Card drag (CRITICAL #2) ──────────────────────────────────────────────
  // Card's header emits total delta from its own pointerdown. We capture the
  // card's offset at drag-start (keyed by id, cleared on document pointerup)
  // and set item.cardOffset = base + delta each move, then reposition().
  //
  // Design choice: OverlayRoot captures drag-start base (from item.cardOffset at
  // first delta for a given id) and translates total-delta → absolute offset.
  // This faithfully matches install.ts:473-478 (ox/oy captured at pointerdown,
  // it.cardOffset = { x: ox + dx, y: oy + dy }).
  const cardDragBase = useRef<Map<string, { x: number; y: number }>>(new Map()).current;

  useEffect(() => {
    function onPointerUp() {
      cardDragBase.clear();
    }
    document.addEventListener("pointerup", onPointerUp, true);
    return () => document.removeEventListener("pointerup", onPointerUp, true);
  }, []);

  function handleCardDragDelta(id: string, dx: number, dy: number) {
    // Capture base on the FIRST delta of a new drag for this id.
    if (!cardDragBase.has(id)) {
      const item = state.items.find((it) => it.id === id);
      const base = item?.cardOffset ?? { x: 0, y: 0 };
      cardDragBase.set(id, { x: base.x, y: base.y });
    }
    const base = cardDragBase.get(id)!;
    dispatch({ type: "setCardOffset", id, x: base.x + dx, y: base.y + dy });
    reposition();
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <Toolbar
        fab={state.fab}
        fabOpen={state.fabOpen}
        mode={state.mode}
        itemCount={state.items.length}
        copied={state.copied}
        clearOpen={clearOpen}
        onOrbClick={handleOrbClick}
        onSetMode={(m) => dispatch({ type: "setMode", mode: m })}
        onClear={handleClear}
        onCopy={doCopy}
        onOrbPointerDown={orbPointerDown}
        onHandlePointerDown={handlePointerDown}
        onConfirmClear={handleConfirmClear}
        onCancelClear={handleCancelClear}
      />
      <HoverLayer rect={hoverRect} />
      <MarqueeLayer rect={marqueeRect} />
      <MarksLayer
        items={state.items}
        open={state.open}
        fabOpen={state.fabOpen}
        confirming={state.confirming}
        pressingBadgeRef={pressingBadgeRef}
        registerNode={registerNode}
        onBadgeToggle={(id) =>
          dispatch(state.open[id] ? { type: "closeCard", id } : { type: "openCard", id })
        }
        onBadgePressStart={(id) => {
          pressingBadgeRef.current = id;
        }}
        onComment={(id, v) => dispatch({ type: "setComment", id, comment: v })}
        onToggleScreenshot={(id) => dispatch({ type: "toggleScreenshot", id })}
        onMinimize={(id) => dispatch({ type: "closeCard", id })}
        onDelete={(id) => dispatch({ type: "deleteItem", id })}
        onSetConfirming={(b) => {
          confirmingRef.current = b;
          dispatch({ type: "setConfirming", confirming: b });
        }}
        onDragDelta={handleCardDragDelta}
      />
    </>
  );
}
