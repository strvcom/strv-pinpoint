// Public surface for the injected overlay. The overlay itself is authored as
// TS modules in ../overlay/*.ts and bundled to a string by scripts/build-overlay.mjs.

export {
  ANNOTATIONS_GLOBAL,
  ANNOTATIONS_PROBE,
  REGION_GLOBAL,
  REGION_PROBE,
  SELECTION_GLOBAL,
} from "../overlay/globals.js";
export { OVERLAY_SOURCE } from "./overlay-source.generated.js";
