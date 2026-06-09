import { existsSync } from "node:fs";
import { findChrome, isCdpUp } from "../cdp/launch-chrome.js";
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
        if (exists(path) || config.chromePath) return { ok: true };
        return { ok: false, reason: `Chrome not found at ${path}`, remedy: REMEDY };
      } catch (e) {
        return { ok: false, reason: (e as Error).message, remedy: REMEDY };
      }
    },

    async connect(_opts: DriverConnectOptions): Promise<DriverSession> {
      throw new Error("not implemented"); // Task 3
    },
  };
}

const REMEDY =
  "Install Google Chrome or Chromium, or set PIN_CHROME_PATH to the browser binary. " +
  "Alternatively, launch a debug Chrome on the CDP port yourself.";
