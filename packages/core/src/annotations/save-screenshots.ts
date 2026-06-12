import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BridgePage } from "../driver/page.js";
import type { Annotation } from "../types.js";

// Hide/show the injected overlay (anything tagged data-pinpoint) so its badges/cards/outlines
// don't appear in captured screenshots. Evaluated in the page; a no-op for non-DOM pages.
const HIDE_OVERLAY =
  "(()=>{var s=document.getElementById('__ppHide')||document.createElement('style');s.id='__ppHide';s.textContent='[data-pinpoint]{visibility:hidden!important}';document.documentElement.appendChild(s);})()";
const SHOW_OVERLAY = "(()=>{var s=document.getElementById('__ppHide');if(s)s.remove();})()";

/** Capture a PNG for each wantScreenshot item; returns badge -> absolute path (or null). */
export async function saveScreenshots(
  page: BridgePage,
  items: Annotation[],
  dir: string,
): Promise<Record<number, string | null>> {
  const out: Record<number, string | null> = {};
  const anyShot = items.some((it) => it.wantScreenshot);
  if (anyShot) await page.evaluate(HIDE_OVERLAY);
  try {
    let dirReady = false;
    for (const it of items) {
      if (!it.wantScreenshot) {
        out[it.badge] = null;
        continue;
      }
      let png: Buffer | null = null;
      try {
        if (it.kind === "element" && it.selected[0]?.selector) {
          png = await page.screenshotElement(it.selected[0].selector);
        }
        if (!png) png = await page.screenshotClip(it.rect);
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
  } finally {
    if (anyShot) await page.evaluate(SHOW_OVERLAY);
  }
  return out;
}
