export type Mode = "pick" | "screenshot" | null;
export type Kind = "element" | "screenshot";
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Item {
  id: string;
  kind: Kind;
  componentName: string | null;
  ancestry: string[];
  selector: string;
  tagName: string;
  text: string;
  rect: Rect;
  pageX?: number;
  pageY?: number; // screenshot kind only
  comment: string;
  wantScreenshot: boolean;
  cardOffset?: { x: number; y: number }; // user-dragged card delta
}
export interface OverlayState {
  mode: Mode;
  items: Item[];
  open: Record<string, boolean>;
  fabOpen: boolean;
  ready: boolean;
  copied: boolean;
  nextId: number;
  batchId: number;
  lastPromptId: string | null;
  confirming: boolean;
  fab: { right: number; bottom: number };
}
export type Action =
  | { type: "setMode"; mode: Mode }
  | {
      type: "addElement";
      data: {
        componentName: string | null;
        ancestry: string[];
        selector: string;
        tagName: string;
        text: string;
        rect: Rect;
      };
    }
  | { type: "addScreenshot"; rect: Rect; pageX: number; pageY: number }
  | { type: "setComment"; id: string; comment: string }
  | { type: "toggleScreenshot"; id: string }
  | { type: "openCard"; id: string }
  | { type: "closeCard"; id: string }
  | { type: "deleteItem"; id: string }
  | { type: "clearAll" }
  | { type: "setFabOpen"; open: boolean }
  | { type: "setFabPos"; right: number; bottom: number }
  | { type: "markCopied" }
  | { type: "clearCopied" }
  | { type: "setConfirming"; confirming: boolean }
  | { type: "consumeRunning" };
