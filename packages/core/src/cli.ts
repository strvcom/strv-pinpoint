#!/usr/bin/env node
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Connection, connect } from "./cdp/connector.js";
import { systemClipboard } from "./clipboard/write.js";
import { parseConfig } from "./config.js";
import { startBridgeServer } from "./server/bridge-server.js";
import { SessionRegistry } from "./server/sessions.js";

async function main() {
  const cfg = parseConfig(process.env as Record<string, string | undefined>);
  const bridgeUrl = `http://localhost:${cfg.mcpPort}`;
  let connection: Connection;
  try {
    connection = await connect({ cdpUrl: cfg.cdpUrl, appUrl: cfg.appUrl, bridgeUrl });
  } catch (err) {
    console.error(
      `Could not connect to Chrome at ${cfg.cdpUrl}. Launch Chrome with:\n` +
        `  <chrome> --remote-debugging-port=9222 --user-data-dir=/tmp/ff-chrome ${cfg.appUrl}\n` +
        `Original error: ${(err as Error).message}`,
    );
    process.exit(1);
  }
  startBridgeServer(cfg.mcpPort, {
    page: connection.page,
    sessions: new SessionRegistry(),
    writeClipboard: systemClipboard,
    bridgeUrl,
    tmpRoot: join(tmpdir(), "frontman-flow"),
  });
  console.error(`frontman-flow bridge on ${bridgeUrl} · session ${connection.sessionId}`);
  process.on("SIGINT", async () => {
    await connection.close();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
