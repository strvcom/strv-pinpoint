import { useEffect } from "preact/hooks";
import type { Mode, Rect } from "../state/types.js";

export interface UseScreenshotRegionArgs {
  mode: Mode;
  /** The shadow-host element; mouse events on it (or its children) are ignored. */
  hostEl: HTMLElement | null;
  /**
   * Called with the current marquee rect while the user is dragging,
   * or null when the drag ends.
   */
  onMarquee: (rect: Rect | null) => void;
  /**
   * Called with the final captured rect when the user releases the mouse
   * and the rect is larger than 6×6.
   */
  onCapture: (rect: Rect) => void;
}

// Compute the normalised rect from a drag start point to the current event.
// Port of install.ts:668-675.
function rectOf(start: { x: number; y: number }, e: MouseEvent): Rect {
  return {
    x: Math.min(start.x, e.clientX),
    y: Math.min(start.y, e.clientY),
    width: Math.abs(e.clientX - start.x),
    height: Math.abs(e.clientY - start.y),
  };
}

/**
 * Drives the screenshot-mode marquee drag on the document.
 * Ignores the overlay shadow host.
 * Port of install.ts:667-725.
 */
export function useScreenshotRegion({
  mode,
  hostEl,
  onMarquee,
  onCapture,
}: UseScreenshotRegionArgs): void {
  useEffect(() => {
    let sdrag: { x: number; y: number } | null = null;

    function isHostHit(target: EventTarget | null): boolean {
      const el = target as Element | null;
      if (!el) return false;
      return el === hostEl || !!hostEl?.contains(el);
    }

    function onMouseDown(e: MouseEvent) {
      if (mode !== "screenshot" || isHostHit(e.target)) return;
      e.preventDefault();
      sdrag = { x: e.clientX, y: e.clientY };
    }

    function onMouseMove(e: MouseEvent) {
      if (mode !== "screenshot" || !sdrag) return;
      onMarquee(rectOf(sdrag, e));
    }

    function onMouseUp(e: MouseEvent) {
      if (mode !== "screenshot" || !sdrag) return;
      const r = rectOf(sdrag, e);
      sdrag = null;
      onMarquee(null);
      if (r.width > 6 && r.height > 6) {
        onCapture(r);
      }
    }

    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mouseup", onMouseUp, true);

    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("mouseup", onMouseUp, true);
    };
  }, [mode, hostEl, onMarquee, onCapture]);
}
