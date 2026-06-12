import { render } from "preact";
import { installBridgeLink } from "./bridge-link.js";
import { OverlayRoot } from "./components/OverlayRoot.js";
import { installSelectionProbe } from "./selection-probe.js";
import { OVERLAY_CSS } from "./styles.js";

export function installOverlayApp(): void {
  if ((window as any).__pinpointOverlayInstalled || !document.body) return;
  (window as any).__pinpointOverlayInstalled = true;
  const disposeProbe = installSelectionProbe();
  const disposeLink = installBridgeLink();
  const host = document.createElement("div");
  host.setAttribute("data-pinpoint", "1"); // C2: the single hideable host for screenshots
  // No layout styles (TASK-23 #1). Every overlay layer inside the shadow root is position:fixed and
  // anchors to the viewport on its own, so the host needs no position/inset/z-index. As a
  // zero-footprint element it can't cover the page (so it can't intercept clicks or affect page
  // scroll), which is why pointer-events:none is no longer needed. Each layer manages its own
  // pointer-events: the Toolbar sets auto (interactive); MarksLayer/Hover/Marquee set none (click-through).
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = OVERLAY_CSS;
  root.appendChild(style);
  const mount = document.createElement("div"); // preact mount point inside the shadow root
  root.appendChild(mount);
  render(<OverlayRoot hostEl={host} />, mount);

  // Dev hot-reload contract: a full, idempotent unmount. Preact render(null) runs every
  // useEffect cleanup (picker/screenshot/escape/positioning/pointerup/link.init listeners);
  // the two installer disposers handle the non-Preact globals (extractor fn + SSE EventSource).
  (window as any).__pinpointTeardown = () => {
    render(null, mount);
    host.remove();
    disposeProbe();
    disposeLink();
    delete (window as any).__pinpointOverlayInstalled;
    delete (window as any).__pinpointTeardown;
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installOverlayApp, { once: true });
} else {
  installOverlayApp();
}
