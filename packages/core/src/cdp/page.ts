import type { Rect } from "../types.js";

/**
 * The minimal page surface the bridge needs. Implemented by the raw-CDP
 * adapter (CdpPage) in production and by FakePage in tests.
 */
export interface BridgePage {
  /** Evaluate a JS expression string in the page and return its JSON-serializable value. */
  evaluate<T>(expression: string): Promise<T>;
  /** Inject source that runs on the current page AND on every future navigation. */
  injectBootstrap(source: string): Promise<void>;
  /**
   * Dev hot-reload: tear down the live overlay, swap the on-new-document bootstrap so page
   * reloads use the fresh code, then evaluate `preamble + "\n" + source` to remount.
   */
  reinject(preamble: string, source: string): Promise<void>;
  /** PNG bytes of the current viewport. */
  screenshotViewport(): Promise<Buffer>;
  /** PNG bytes of an arbitrary viewport-relative rect (partial screenshot). */
  screenshotClip(rect: Rect): Promise<Buffer>;
  /** PNG bytes of the first element matching selector, or null if none matches. */
  screenshotElement(selector: string): Promise<Buffer | null>;
}
