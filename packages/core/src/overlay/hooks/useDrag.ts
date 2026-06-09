import { useRef } from "preact/hooks";

/**
 * Callbacks for useDrag.
 *
 * - onMove(dx, dy): called on every pointermove with the delta from start.
 * - onStart():      called on pointerdown.
 * - onEnd(moved):   called on pointerup; `moved` is true when the pointer
 *                   travelled more than 3px (used to suppress click).
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
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
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
