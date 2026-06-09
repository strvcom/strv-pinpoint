export interface OverlayState {
  mode: string | null;
  items: any[];
  ready: boolean;
  batchId: number;
  nextId: number;
  lastPromptId: any;
  open: Record<string, boolean>;
  fabOpen: boolean;
  fab: { right: number; bottom: number };
  mouse: any;
  confirming: boolean;
}

export function createOverlayState(): OverlayState {
  return {
    mode: null,
    items: [],
    ready: false,
    batchId: 0,
    nextId: 1,
    lastPromptId: null,
    open: {},
    fabOpen: false,
    fab: { right: 16, bottom: 16 },
    mouse: null,
    confirming: false,
  };
}
