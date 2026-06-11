import { useEffect } from "preact/hooks";

/**
 * While `active`, warns the user with the browser's native unload prompt if they try to close or
 * refresh the page — so in-progress annotations aren't lost (TASK-29). Cleaned up when `active`
 * flips false or the overlay tears down.
 */
export function useUnloadGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Legacy assignment required to trigger the prompt in some browsers.
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
}
