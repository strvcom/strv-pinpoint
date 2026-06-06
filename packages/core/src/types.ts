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
