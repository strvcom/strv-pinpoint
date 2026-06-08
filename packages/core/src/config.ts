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
    port: env.FF_PORT ? Number(env.FF_PORT) : 7331,
    cdpUrl: env.FF_CDP_URL ?? "http://localhost:9222",
    appUrl: env.FF_APP_URL ?? "http://localhost:5173",
    chromePath: env.FF_CHROME_PATH,
    profileDir: env.FF_CHROME_PROFILE ?? join(tmpdir(), "ff-chrome"),
  };
}
