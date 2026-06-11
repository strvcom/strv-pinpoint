import { useRef } from "preact/hooks";

/**
 * Travel (in px, |dx|+|dy|) a press must exceed before it counts as a drag.
 * Below this deadzone the press is treated as a click: `onMove` never fires and
 * `onEnd(false)` is reported, so a click with slight pointer jitter toggles the
 * FAB / badge instead of nudging it (TASK-23 #2).
 */
const DRAG_THRESHOLD = 4;

/**
 * Callbacks for useDrag.
 *
 * - onMove(dx, dy): called with the delta from start, but ONLY after travel
 *                   exceeds DRAG_THRESHOLD (the deadzone). dx/dy are always
 *                   measured from the original pointerdown.
 * - onStart():      called on pointerdown.
 * - onEnd(moved):   called on pointerup; `moved` is true once the deadzone was
 *                   crossed (used to suppress the click that follows a drag).
 *
 * Port of install.ts:160-184 (FAB drag) and install.ts:467-486 (card drag).
 */
export interface DragHandlers {
  onMove: (dx: number, dy: number) => void;
  onStart?: () => void;
  onEnd?: (moved: boolean) => void;
}

/**
 * Returns a stable `pointerdown` handler that drives a pointer-drag loop.
 * Safe to attach directly to a JSX element's `onPointerDown`.
 */
export function useDrag(handlers: DragHandlers): (e: PointerEvent) => void {
  // Keep latest handlers in a ref so the returned handler is stable.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  // The returned handler itself is also stable (created once).
  const handlerRef = useRef<((e: PointerEvent) => void) | null>(null);

  if (!handlerRef.current) {
    handlerRef.current = (e: PointerEvent) => {
      const sx = e.clientX;
      const sy = e.clientY;
      let moved = false;

      handlersRef.current.onStart?.();
      e.preventDefault();

      function onMove(ev: PointerEvent) {
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        // Deadzone: stay a click until travel crosses the threshold. Once it
        // does, the press is a drag for the rest of its lifetime.
        if (!moved && Math.abs(dx) + Math.abs(dy) <= DRAG_THRESHOLD) return;
        moved = true;
        handlersRef.current.onMove(dx, dy);
      }

      function onUp() {
        document.removeEventListener("pointermove", onMove, true);
        document.removeEventListener("pointerup", onUp, true);
        handlersRef.current.onEnd?.(moved);
      }

      document.addEventListener("pointermove", onMove, true);
      document.addEventListener("pointerup", onUp, true);
    };
  }

  return handlerRef.current;
}
