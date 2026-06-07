import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BridgePage } from "../cdp/page.js";
import type { Annotation } from "../types.js";

/** Capture a PNG for each wantScreenshot item; returns badge -> absolute path (or null). */
export async function saveScreenshots(
  page: BridgePage,
  items: Annotation[],
  dir: string,
): Promise<Record<number, string | null>> {
  const out: Record<number, string | null> = {};
  let dirReady = false;
  for (const it of items) {
    if (!it.wantScreenshot) {
      out[it.badge] = null;
      continue;
    }
    let png: Buffer | null = null;
    try {
      png = (await page.screenshotElement(it.selector)) ?? (await page.screenshotClip(it.rect));
    } catch {
      png = null;
    }
    if (!png) {
      out[it.badge] = null;
      continue;
    }
    if (!dirReady) {
      await mkdir(dir, { recursive: true });
      dirReady = true;
    }
    const path = join(dir, `anno-${it.badge}.png`);
    await writeFile(path, png);
    out[it.badge] = path;
  }
  return out;
}
