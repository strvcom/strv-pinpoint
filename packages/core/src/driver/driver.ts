import type { BridgePage } from "../cdp/page.js";

/** Per-connection options shared by every driver (driver-agnostic). */
export interface DriverConnectOptions {
  /** The dev-app URL to open/target. */
  appUrl: string;
  /** Base URL of this bridge's HTTP server, injected into the overlay so it can call back. */
  bridgeUrl: string;
}

/** A live driver connection: the page surface the bridge captures through, plus teardown. */
export interface DriverSession {
  /** The capture/inject surface (CDP today; an extension-backed surface later). */
  page: BridgePage;
  /** The session id injected into the overlay; used for SSE + /send. */
  sessionId: string;
  close(): Promise<void>;
}

/** Result of a driver availability probe. `remedy` is shown to the developer on failure. */
export type HealthResult = { ok: true } | { ok: false; reason: string; remedy: string };

/**
 * How Pinpoint (1) acquires a browser/page, (2) injects the overlay, and (3) captures pixels.
 * NOT how screenshots are persisted — that is shared bridge infrastructure.
 */
export interface Driver {
  readonly name: string;
  /** Attest the mechanism is available before any connect attempt. */
  healthCheck(): Promise<HealthResult>;
  /** Acquire the browser/page and inject the overlay. */
  connect(opts: DriverConnectOptions): Promise<DriverSession>;
}
