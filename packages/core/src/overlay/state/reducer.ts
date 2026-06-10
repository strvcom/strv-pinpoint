import type { Action, Item, OverlayState } from "./types.js";

export function createInitialState(): OverlayState {
  return {
    mode: null,
    items: [],
    open: {},
    fabOpen: false,
    ready: false,
    copied: false,
    nextId: 1,
    batchId: 0,
    lastPromptId: null,
    confirming: false,
    fab: { right: 16, bottom: 16 },
  };
}

/** Mark state as dirty (items/comments/wantScreenshot mutated). */
function dirty(_state: OverlayState): Partial<OverlayState> {
  return { ready: false, copied: false };
}

export function reducer(state: OverlayState, action: Action): OverlayState {
  switch (action.type) {
    case "setMode":
      return { ...state, mode: action.mode };

    case "addElement": {
      const id = `a${state.nextId}`;
      const item: Item = {
        id,
        kind: "element",
        componentName: action.data.componentName,
        ancestry: [...action.data.ancestry],
        selector: action.data.selector,
        tagName: action.data.tagName,
        text: action.data.text,
        rect: { ...action.data.rect },
        comment: "",
        wantScreenshot: true, // TASK-18 #5: element picks default to including a screenshot
      };
      return {
        ...state,
        ...dirty(state),
        items: [...state.items, item],
        open: { ...state.open, [id]: true },
        nextId: state.nextId + 1,
      };
    }

    case "addScreenshot": {
      const id = `a${state.nextId}`;
      const item: Item = {
        id,
        kind: "screenshot",
        componentName: null,
        ancestry: [],
        selector: "",
        tagName: "",
        text: "",
        rect: { ...action.rect },
        pageX: action.pageX,
        pageY: action.pageY,
        comment: "",
        wantScreenshot: true,
      };
      return {
        ...state,
        ...dirty(state),
        items: [...state.items, item],
        open: { ...state.open, [id]: true },
        nextId: state.nextId + 1,
      };
    }

    case "setComment": {
      const idx = state.items.findIndex((item) => item.id === action.id);
      if (idx === -1) return state; // no-op if id missing
      const updatedItems = state.items.map((item, i) =>
        i === idx ? { ...item, comment: action.comment } : item,
      );
      return { ...state, ...dirty(state), items: updatedItems };
    }

    case "toggleScreenshot": {
      const updatedItems = state.items.map((item) =>
        item.id === action.id ? { ...item, wantScreenshot: !item.wantScreenshot } : item,
      );
      return { ...state, ...dirty(state), items: updatedItems };
    }

    case "openCard":
      return { ...state, open: { ...state.open, [action.id]: true } };

    case "closeCard":
      return { ...state, open: { ...state.open, [action.id]: false } };

    case "deleteItem": {
      const updatedOpen = { ...state.open };
      delete updatedOpen[action.id];
      return {
        ...state,
        ...dirty(state),
        items: state.items.filter((item) => item.id !== action.id),
        open: updatedOpen,
      };
    }

    case "clearAll":
      return { ...state, items: [], open: {}, ready: false, copied: false };

    case "setFabOpen":
      return { ...state, fabOpen: action.open };

    case "setFabPos":
      return { ...state, fab: { right: action.right, bottom: action.bottom } };

    case "markCopied":
      return { ...state, ready: true, copied: true, batchId: state.batchId + 1 };

    case "clearCopied":
      return { ...state, copied: false };

    case "setConfirming":
      return { ...state, confirming: action.confirming };

    case "consumeRunning":
      return { ...state, items: [], open: {}, ready: false, copied: false };

    case "setCardOffset": {
      // View-only: update cardOffset without dirtying ready/copied.
      const updatedItems = state.items.map((item) =>
        item.id === action.id ? { ...item, cardOffset: { x: action.x, y: action.y } } : item,
      );
      return { ...state, items: updatedItems };
    }

    default:
      return state;
  }
}
