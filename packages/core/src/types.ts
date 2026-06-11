export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SelectionFound {
  status: "selected";
  /** User component to grep for, e.g. "ClientTest". Null if not identifiable. */
  componentName: string | null;
  /** Nearest-first user component chain (framework components filtered out). */
  ancestry: string[];
  /** CSS selector targeting the element. */
  selector: string;
  tagName: string;
  /** Trimmed visible text (<=120 chars). */
  text: string;
  /** Viewport-relative bounding box. */
  rect: Rect;
}

/** v2 annotation identity unit. `react` is null for plain (non-React) DOM.
 *  Extended additively by TASK-28 (source/identifiers). */
export interface Selection {
  selector: string;
  tagName: string;
  text: string;
  identifiers: {
    id?: string;
    testId?: string;
    ariaLabel?: string;
    role?: string;
    name?: string;
  };
  react: {
    componentName: string;
    ancestry: string[];
    source?: { file: string; line: number };
  } | null;
}

export interface NoSelection {
  status: "none";
  message: string;
}

export type SelectionResult = SelectionFound | NoSelection;

export type ScreenshotTarget =
  | { kind: "viewport" }
  | { kind: "region" }
  | { kind: "selection" }
  | { kind: "selector"; selector: string };

export interface CapturedImage {
  mimeType: "image/png";
  /** base64-encoded PNG bytes. */
  base64: string;
}

export interface Annotation {
  id: string;
  badge: number;
  kind: "element" | "screenshot";
  selected: Selection[];
  rect: Rect;
  comment: string;
  wantScreenshot: boolean;
}

export interface AnnotationBatch {
  batchId: number;
  ready: boolean;
  items: Annotation[];
}
