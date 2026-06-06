import type { Rect } from "../types.js";
import type { BridgePage } from "./page.js";

export interface FakePageOptions {
  /** Keyed by the evaluated expression string; "*" is a catch-all fallback. */
  evalResults?: Record<string, unknown>;
  viewportPng?: Buffer;
  clipPng?: Buffer;
  /** Keyed by selector. */
  elementPng?: Record<string, Buffer | null>;
}

export class FakePage implements BridgePage {
  readonly evaluatedExpressions: string[] = [];
  readonly injectedSources: string[] = [];
  readonly clips: Rect[] = [];
  readonly elementSelectors: string[] = [];

  constructor(private readonly opts: FakePageOptions = {}) {}

  async evaluate<T>(expression: string): Promise<T> {
    this.evaluatedExpressions.push(expression);
    const map = this.opts.evalResults ?? {};
    if (expression in map) return map[expression] as T;
    if ("*" in map) return map["*"] as T;
    return null as T;
  }

  async injectBootstrap(source: string): Promise<void> {
    this.injectedSources.push(source);
  }

  async screenshotViewport(): Promise<Buffer> {
    return this.opts.viewportPng ?? Buffer.from("viewport-png");
  }

  async screenshotClip(rect: Rect): Promise<Buffer> {
    this.clips.push(rect);
    return this.opts.clipPng ?? Buffer.from(`clip-png:${rect.x},${rect.y},${rect.width},${rect.height}`);
  }

  async screenshotElement(selector: string): Promise<Buffer | null> {
    this.elementSelectors.push(selector);
    const map = this.opts.elementPng ?? {};
    if (selector in map) return map[selector];
    return Buffer.from(`element-png:${selector}`);
  }
}
