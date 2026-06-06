#!/usr/bin/env node
import { parseConfig } from "./config.js";
import { connect } from "./cdp/connector.js";
import { startSseServer } from "./server/sse-server.js";

async function main() {
  const cfg = parseConfig(process.env as Record<string, string | undefined>);
  let connection;
  try {
    connection = await connect({ cdpUrl: cfg.cdpUrl, appUrl: cfg.appUrl });
  } catch (err) {
    console.error(
      `Could not connect to Chrome at ${cfg.cdpUrl}. Launch Chrome with:\n` +
        `  <chrome> --remote-debugging-port=9222 --user-data-dir=/tmp/ff-chrome ${cfg.appUrl}\n` +
        `Original error: ${(err as Error).message}`,
    );
    process.exit(1);
  }
  startSseServer(cfg.mcpPort, { page: connection.page });
  console.error(
    `frontman-flow MCP (SSE) on http://localhost:${cfg.mcpPort}/sse`,
  );
  process.on("SIGINT", async () => {
    await connection.close();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
