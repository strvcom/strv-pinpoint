import type { Page } from "playwright";
import type { BridgePage } from "./page.js";
import type { Rect } from "../types.js";

export class PlaywrightPage implements BridgePage {
  constructor(private readonly page: Page) {}

  evaluate<T>(expression: string): Promise<T> {
    return this.page.evaluate((e) => (0, eval)(e), expression) as Promise<T>;
  }

  async injectBootstrap(source: string): Promise<void> {
    await this.page.addInitScript({ content: source });
    await this.page.evaluate((src) => {
      (0, eval)(src);
    }, source);
  }

  screenshotViewport(): Promise<Buffer> {
    return this.page.screenshot({ type: "png" });
  }

  screenshotClip(rect: Rect): Promise<Buffer> {
    // Selection/region rects are VIEWPORT coordinates (getBoundingClientRect /
    // clientX,Y). Playwright's screenshot `clip` is also viewport-relative for a
    // (non-fullPage) viewport screenshot — verified empirically on a scrolled page:
    // the raw rect matches a ground-truth element screenshot, adding scrollX/Y does
    // NOT. So pass the rect through unchanged. (A region partly outside the viewport
    // would error; acceptable since the user selects within what they can see.)
    return this.page.screenshot({ type: "png", clip: rect });
  }

  async screenshotElement(selector: string): Promise<Buffer | null> {
    const loc = this.page.locator(selector).first();
    if ((await loc.count()) === 0) return null;
    return loc.screenshot({ type: "png" });
  }
}
