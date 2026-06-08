import type { Rect } from "../types.js";
import type { CdpConnection } from "./cdp-connection.js";
import type { BridgePage } from "./page.js";

interface EvalResult {
  result?: { value?: unknown };
  exceptionDetails?: { text?: string };
}

/** Implements the bridge's page surface using only raw CDP commands. */
export class CdpPage implements BridgePage {
  constructor(private readonly cdp: CdpConnection) {}

  async evaluate<T>(expression: string): Promise<T> {
    const r = await this.cdp.send<EvalResult>("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text ?? "Runtime.evaluate failed");
    return r.result?.value as T;
  }

  async injectBootstrap(source: string): Promise<void> {
    await this.cdp.send("Page.addScriptToEvaluateOnNewDocument", { source });
    await this.cdp.send("Runtime.evaluate", { expression: source });
  }

  async screenshotViewport(): Promise<Buffer> {
    const r = await this.cdp.send<{ data: string }>("Page.captureScreenshot", { format: "png" });
    return Buffer.from(r.data, "base64");
  }

  async screenshotClip(rect: Rect): Promise<Buffer> {
    // rect is VIEWPORT-relative (getBoundingClientRect). captureBeyondViewport:false keeps the
    // clip viewport-relative, matching the prior Playwright behavior (see decisions.md 2026-06-06).
    const r = await this.cdp.send<{ data: string }>("Page.captureScreenshot", {
      format: "png",
      clip: { ...rect, scale: 1 },
      captureBeyondViewport: false,
    });
    return Buffer.from(r.data, "base64");
  }

  async screenshotElement(selector: string): Promise<Buffer | null> {
    const rect = await this.evaluate<Rect | null>(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`,
    );
    if (!rect) return null;
    return this.screenshotClip(rect);
  }
}
