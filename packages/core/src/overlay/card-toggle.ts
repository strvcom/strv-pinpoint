import type { OverlayState } from "./state.js";

// Decides what a badge click should do, given current open-state.
// Mirrors current behavior exactly. (TASK-18 will change this rule — NOT here.)
export function badgeClickAction(state: OverlayState, id: string): "open" | "close" {
  return state.open[id] ? "close" : "open";
}
