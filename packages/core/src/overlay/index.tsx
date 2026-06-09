import { render } from "preact";
import { installBridgeLink } from "./bridge-link.js";
import { OverlayRoot } from "./components/OverlayRoot.js";
import { installSelectionProbe } from "./selection-probe.js";
import { OVERLAY_CSS } from "./styles.js";

export function installOverlayApp(): void {
  if ((window as any).__pinpointOverlayInstalled || !document.body) return;
  (window as any).__pinpointOverlayInstalled = true;
  installSelectionProbe();
  installBridgeLink();
  const host = document.createElement("div");
  host.setAttribute("data-pinpoint", "1"); // C2: the single hideable host for screenshots
  host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483640";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = OVERLAY_CSS;
  root.appendChild(style);
  const mount = document.createElement("div"); // preact mount point inside the shadow root
  root.appendChild(mount);
  render(<OverlayRoot hostEl={host} />, mount);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installOverlayApp, { once: true });
} else {
  installOverlayApp();
}
