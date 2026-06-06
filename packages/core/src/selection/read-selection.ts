import type { BridgePage } from "../cdp/page.js";
import { type RawSelection, SELECTION_PROBE } from "../cdp/selection-probe.js";
import type { SelectionResult } from "../types.js";

const NONE = "No element selected. Use the Pick tool in the overlay, then ask again.";

export async function readSelection(page: BridgePage): Promise<SelectionResult> {
  const raw = await page.evaluate<RawSelection | null>(SELECTION_PROBE);
  if (!raw) return { status: "none", message: NONE };
  return {
    status: "selected",
    componentName: raw.componentName,
    ancestry: raw.ancestry,
    selector: raw.selector,
    tagName: raw.tagName,
    text: raw.text,
    rect: raw.rect,
  };
}
