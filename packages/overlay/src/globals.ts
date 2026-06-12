// Window-global names + CDP probe expressions shared by the injected overlay
// and any node-side reader. No DOM access here so node code can import it too.
export const REGION_GLOBAL = "__pinpointRegion";
export const ANNOTATIONS_GLOBAL = "__pinpointAnnotations";
export const SELECTION_GLOBAL = "__pinpointSelection";
export const REGION_PROBE = `window.${REGION_GLOBAL} ?? null`;
export const ANNOTATIONS_PROBE = `window.${ANNOTATIONS_GLOBAL} ?? null`;
