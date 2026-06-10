import { useEffect } from "preact/hooks";

/**
 * Calls `onEscape` whenever the user presses Escape.
 * Uses capture so it fires before any bubbling handlers.
 * Port of install.ts:727-733.
 */
export function useEscape(onEscape: () => void): void {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onEscape();
    }
    document.addEventListener("keydown", handler, true);
    return () => {
      document.removeEventListener("keydown", handler, true);
    };
  }, [onEscape]);
}
