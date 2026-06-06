import type { BridgePage } from "../cdp/page.js";
import type { Rect } from "../types.js";
import { REGION_PROBE } from "../cdp/overlay-script.js";

export async function readRegion(page: BridgePage): Promise<Rect | null> {
  return await page.evaluate<Rect | null>(REGION_PROBE);
}
