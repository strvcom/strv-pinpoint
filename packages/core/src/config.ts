export interface BridgeConfig {
  port: number;
  cdpUrl: string;
  appUrl: string;
}

export function parseConfig(env: Record<string, string | undefined>): BridgeConfig {
  return {
    port: env.FF_PORT ? Number(env.FF_PORT) : 7331,
    cdpUrl: env.FF_CDP_URL ?? "http://localhost:9222",
    appUrl: env.FF_APP_URL ?? "http://localhost:5173",
  };
}
