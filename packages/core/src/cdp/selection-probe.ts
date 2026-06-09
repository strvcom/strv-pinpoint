/**
 * Phase 0 (Task 0.3) deliverable — VALIDATED against Next 16 / React 19.
 * See docs/superpowers/notes/phase0-spike-findings.md.
 *
 * pinpoint does NOT source-map a clicked element to a file. Instead it
 * extracts React-DevTools-style *identity* — the user component name, its
 * ancestry, the CSS selector, tag, visible text, and bounding rect — and lets
 * Claude grep the repo (e.g. `function ClientTest`) to locate the source. This
 * is stack-agnostic and works where fiber→source maps do not (Next Turbopack/RSC).
 *
 * In Phase 1, the selection extractor is authored in src/overlay/selection-probe.ts
 * and bundled into OVERLAY_SOURCE. It stores the latest RawSelection on
 * `window[SELECTION_GLOBAL]`; the bridge reads it via SELECTION_PROBE through CDP.
 */

export interface RawSelection {
  /** A CSS selector that uniquely targets the clicked element. */
  selector: string;
  /** Uppercase tag name, e.g. "H1". */
  tagName: string;
  /** Trimmed visible text (truncated). */
  text: string;
  /** Viewport-relative bounding box. */
  rect: { x: number; y: number; width: number; height: number };
  /** Best-guess user component name to grep for (framework names filtered out), or null. */
  componentName: string | null;
  /** User-ish component ancestry (nearest first), framework components filtered out. */
  ancestry: string[];
}

export const SELECTION_GLOBAL = "__pinpointSelection";

/** Expression evaluated in the page to read the current selection (or null). */
export const SELECTION_PROBE = `window.${SELECTION_GLOBAL} ?? null`;
