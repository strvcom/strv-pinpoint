import type { BridgePage } from "../driver/page.js";
import type { Rect } from "../types.js";
import type { CdpConnection } from "./cdp-connection.js";

interface EvalResult {
  result?: { value?: unknown };
  exceptionDetails?: { text?: string };
}

/** Implements the bridge's page surface using only raw CDP commands. */
export class CdpPage implements BridgePage {
  private bootstrapScriptId: string | null = null;

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
    const { identifier } = await this.cdp.send<{ identifier: string }>(
      "Page.addScriptToEvaluateOnNewDocument",
      { source },
    );
    this.bootstrapScriptId = identifier;
    await this.cdp.send("Runtime.evaluate", { expression: source });
  }

  async reinject(preamble: string, source: string): Promise<void> {
    const combined = `${preamble}\n${source}`;
    // 1. Clean unmount of the live overlay (guarded — no-op if not yet installed).
    await this.cdp.send("Runtime.evaluate", {
      expression: "window.__pinpointTeardown && window.__pinpointTeardown()",
    });
    // 2. Swap the on-new-document bootstrap so a manual reload uses the fresh code.
    if (this.bootstrapScriptId) {
      await this.cdp.send("Page.removeScriptToEvaluateOnNewDocument", {
        identifier: this.bootstrapScriptId,
      });
    }
    const { identifier } = await this.cdp.send<{ identifier: string }>(
      "Page.addScriptToEvaluateOnNewDocument",
      { source: combined },
    );
    this.bootstrapScriptId = identifier;
    // 3. Mount the fresh overlay now.
    await this.cdp.send("Runtime.evaluate", { expression: combined });
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
