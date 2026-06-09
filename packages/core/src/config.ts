import { tmpdir } from "node:os";
import { join } from "node:path";

export interface BridgeConfig {
  port: number;
  cdpUrl: string;
  appUrl: string;
  chromePath: string | undefined;
  profileDir: string;
}

export function parseConfig(env: Record<string, string | undefined>): BridgeConfig {
  return {
    port: env.PIN_PORT ? Number(env.PIN_PORT) : 7331,
    cdpUrl: env.PIN_CDP_URL ?? "http://localhost:9222",
    appUrl: env.PIN_APP_URL ?? "http://localhost:5173",
    chromePath: env.PIN_CHROME_PATH,
    profileDir: env.PIN_CHROME_PROFILE ?? join(tmpdir(), "pp-chrome"),
  };
}
