// Public surface for the injected overlay. The overlay itself is authored as
// TS modules in packages/core/src/overlay/*.ts and bundled to a string by scripts/build-overlay.mjs.

export {
  ANNOTATIONS_GLOBAL,
  ANNOTATIONS_PROBE,
  OVERLAY_SOURCE,
  REGION_GLOBAL,
  REGION_PROBE,
  SELECTION_GLOBAL,
} from "@pinpoint/core";
