import { useEffect } from "preact/hooks";
import type { Mode, Rect } from "../state/types.js";

export interface UsePickerArgs {
  mode: Mode;
  /** The shadow-host element; hover/click events on it (or its children) are ignored. */
  hostEl: HTMLElement | null;
  /** Called with the hovered element's rect, or null to clear. */
  onHover: (rect: Rect | null) => void;
  /** Called with the extracted selection data when the user clicks a picked element. */
  onPick: (data: unknown) => void;
}

/**
 * Wires pick-mode hover and click listeners to the document.
 * Ignores the overlay's own shadow host so the overlay UI stays inert.
 * Port of install.ts:633-665.
 */
export function usePicker({ mode, hostEl, onHover, onPick }: UsePickerArgs): void {
  useEffect(() => {
    // Not picking → clear any lingering hover highlight (tool deselected, toolbar closed, or
    // switched to screenshot) and attach nothing. Without this the last hover rect stays painted
    // on screen forever (TASK-29).
    if (mode !== "pick") {
      onHover(null);
      return;
    }

    function isHostHit(el: Element | null): boolean {
      if (!el) return false;
      return el === hostEl || !!hostEl?.contains(el);
    }

    function onMouseMove(e: MouseEvent) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      // Over the overlay's own UI (toolbar/card/badge) or off any element → clear the highlight
      // rather than leaving the last page-element rect painted (TASK-29).
      if (!el || isHostHit(el)) {
        onHover(null);
        return;
      }
      onHover(el.getBoundingClientRect() as Rect);
    }

    function onClick(e: MouseEvent) {
      if (isHostHit(e.target as Element | null)) return;
      e.preventDefault();
      e.stopPropagation();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) return;
      const extract = (window as unknown as Record<string, (el: Element) => unknown>)
        .__pinpointExtractSelection;
      const data = typeof extract === "function" ? extract(el) : undefined;
      onHover(null);
      onPick(data);
    }

    // Pointer left the document/window (no element it moved into) → clear the highlight (TASK-29).
    function onMouseOut(e: MouseEvent) {
      if (!e.relatedTarget) onHover(null);
    }

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("mouseout", onMouseOut, true);

    return () => {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("mouseout", onMouseOut, true);
    };
  }, [mode, hostEl, onHover, onPick]);
}
