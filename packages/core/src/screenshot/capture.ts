import type { BridgePage } from "../cdp/page.js";
import type { CapturedImage, Rect, ScreenshotTarget } from "../types.js";

export interface CaptureDeps {
  rectOfSelection: () => Promise<Rect | null>;
  rectOfRegion: () => Promise<Rect | null>;
}

const img = (png: Buffer): CapturedImage => ({ mimeType: "image/png", base64: png.toString("base64") });

export async function capture(
  page: BridgePage,
  target: ScreenshotTarget,
  deps: CaptureDeps,
): Promise<CapturedImage | null> {
  switch (target.kind) {
    case "viewport":
      return img(await page.screenshotViewport());
    case "selector": {
      const p = await page.screenshotElement(target.selector);
      return p ? img(p) : null;
    }
    case "selection": {
      const r = await deps.rectOfSelection();
      return r ? img(await page.screenshotClip(r)) : null;
    }
    case "region": {
      const r = await deps.rectOfRegion();
      return r ? img(await page.screenshotClip(r)) : null;
    }
  }
}
