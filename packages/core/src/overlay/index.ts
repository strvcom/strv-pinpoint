import { installBridgeLink } from "./bridge-link.js";
import { installOverlay } from "./install.js";
import { installSelectionProbe } from "./selection-probe.js";

installSelectionProbe();
installBridgeLink();
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installOverlay, { once: true });
} else {
  installOverlay();
}
