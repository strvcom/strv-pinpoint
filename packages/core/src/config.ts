export interface BridgeConfig {
  mcpPort: number;
  cdpUrl: string;
  appUrl: string;
}

export function parseConfig(env: Record<string, string | undefined>): BridgeConfig {
  return {
    mcpPort: env.FF_MCP_PORT ? Number(env.FF_MCP_PORT) : 7331,
    cdpUrl: env.FF_CDP_URL ?? "http://localhost:9222",
    appUrl: env.FF_APP_URL ?? "http://localhost:3000",
  };
}
