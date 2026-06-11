import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { CdpConnection } from "../cdp/cdp-connection.js";
import { CdpPage } from "../cdp/cdp-page.js";
import {
  discoverPageTarget,
  findChrome,
  isCdpUp,
  launchChrome,
  waitForCdp,
} from "../cdp/launch-chrome.js";
import { OVERLAY_SOURCE } from "../cdp/overlay-script.js";
import type { BridgePage } from "../cdp/page.js";
import type { Driver, DriverConnectOptions, DriverSession, HealthResult } from "./driver.js";

export interface CdpDriverConfig {
  cdpUrl: string;
  /** Path to the Chrome binary; auto-detected when omitted. */
  chromePath?: string;
  /** Chrome user-data-dir used when this driver launches Chrome. */
  profileDir: string;
}

export interface CdpDriverDeps {
  isCdpUp?: (baseUrl: string) => Promise<boolean>;
  exists?: (path: string) => boolean;
  env?: Record<string, string | undefined>;
  // connect seams (default to the real CDP primitives)
  discoverPageTarget?: (baseUrl: string, appUrl: string) => Promise<string>;
  attach?: (
    wsUrl: string,
  ) => Promise<{ send: <T>(m: string, p?: object) => Promise<T>; close: () => void }>;
  makePage?: (cdp: CdpConnection) => BridgePage;
}

/** The bootstrap config line injected ahead of the overlay bundle. Shared by connect() and the
 *  dev overlay watcher so the re-injected bundle keeps the same bridge URL + session id. */
export function pinpointPreamble(bridgeUrl: string, sessionId: string): string {
  return `window.__pinpointConfig = ${JSON.stringify({ bridgeUrl, sessionId })};`;
}

export function createCdpDriver(config: CdpDriverConfig, deps: CdpDriverDeps = {}): Driver {
  const cdpUp = deps.isCdpUp ?? ((u: string) => isCdpUp(u));
  const exists = deps.exists ?? existsSync;
  const env = deps.env ?? process.env;

  return {
    name: "cdp",

    async healthCheck(): Promise<HealthResult> {
      if (await cdpUp(config.cdpUrl)) return { ok: true };
      try {
        const path = config.chromePath ?? findChrome({ env, exists });
        if (exists(path)) return { ok: true };
        return { ok: false, reason: `Chrome not found at ${path}`, remedy: REMEDY };
      } catch (e) {
        return { ok: false, reason: (e as Error).message, remedy: REMEDY };
      }
    },

    async connect(opts: DriverConnectOptions): Promise<DriverSession> {
      const base = config.cdpUrl;
      let kill: (() => void) | undefined;

      // Attach to an already-running debug Chrome if present; otherwise launch one.
      if (!(await cdpUp(base))) {
        const chromePath = config.chromePath ?? findChrome({ env, exists });
        const port = Number(new URL(base).port || 9222);
        const child = launchChrome({
          chromePath,
          port,
          profileDir: config.profileDir,
          appUrl: opts.appUrl,
        });
        kill = () => child.kill();
        const launchFailed = new Promise<never>((_, reject) => {
          child.once("error", (e) =>
            reject(new Error(`Failed to launch Chrome (${chromePath}): ${(e as Error).message}`)),
          );
        });
        await Promise.race([waitForCdp(base), launchFailed]);
      }

      const discover =
        deps.discoverPageTarget ?? ((b: string, a: string) => discoverPageTarget(b, a));
      const attach = deps.attach ?? ((ws: string) => CdpConnection.attach(ws));
      const makePage = deps.makePage ?? ((c) => new CdpPage(c as CdpConnection));

      const wsUrl = await discover(base, opts.appUrl);
      const cdp = await attach(wsUrl);
      await cdp.send("Page.enable");
      const page = makePage(cdp as unknown as CdpConnection);

      const sessionId = randomUUID();
      const preamble = pinpointPreamble(opts.bridgeUrl, sessionId);
      await page.injectBootstrap(`${preamble}\n${OVERLAY_SOURCE}`);

      return {
        page,
        sessionId,
        close: async () => {
          cdp.close();
          kill?.();
        },
      };
    },
  };
}

const REMEDY =
  "Install Google Chrome or Chromium, or set PIN_CHROME_PATH to the browser binary. " +
  "Alternatively, launch a debug Chrome on the CDP port yourself.";
