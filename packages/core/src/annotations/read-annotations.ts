import { ANNOTATIONS_PROBE } from "../cdp/overlay-script.js";
import type { BridgePage } from "../cdp/page.js";
import type { AnnotationBatch } from "../types.js";

/** The submitted batch, or null when none / not ready / empty. */
export async function readAnnotations(page: BridgePage): Promise<AnnotationBatch | null> {
  const batch = await page.evaluate<AnnotationBatch | null>(ANNOTATIONS_PROBE);
  if (!batch || !batch.ready || !batch.items?.length) return null;
  return batch;
}
