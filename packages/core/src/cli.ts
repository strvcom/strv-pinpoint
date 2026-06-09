#!/usr/bin/env node
import { tmpdir } from "node:os";
import { join } from "node:path";
import { systemClipboard } from "./clipboard/write.js";
import { parseConfig } from "./config.js";
import { createCdpDriver } from "./driver/cdp-driver.js";
import type { Driver, DriverSession } from "./driver/driver.js";
import { startBridgeServer } from "./server/bridge-server.js";
import { SessionRegistry } from "./server/sessions.js";

async function main() {
  const cfg = parseConfig(process.env as Record<string, string | undefined>);
  const bridgeUrl = `http://localhost:${cfg.port}`;

  const driver: Driver = createCdpDriver({
    cdpUrl: cfg.cdpUrl,
    chromePath: cfg.chromePath,
    profileDir: cfg.profileDir,
  });

  const health = await driver.healthCheck();
  if (!health.ok) {
    console.error(
      `pinpoint: ${driver.name} driver unavailable — ${health.reason}\n${health.remedy}`,
    );
    process.exit(1);
  }

  let session: DriverSession;
  try {
    session = await driver.connect({ appUrl: cfg.appUrl, bridgeUrl });
  } catch (err) {
    console.error(
      `Could not connect to Chrome at ${cfg.cdpUrl}. Launch Chrome with:\n` +
        `  <chrome> --remote-debugging-port=9222 --user-data-dir=${cfg.profileDir} ${cfg.appUrl}\n` +
        `Original error: ${(err as Error).message}`,
    );
    process.exit(1);
  }

  startBridgeServer(cfg.port, {
    page: session.page,
    sessions: new SessionRegistry(),
    writeClipboard: systemClipboard,
    bridgeUrl,
    tmpRoot: join(tmpdir(), "pinpoint"),
    appUrl: cfg.appUrl,
    sessionId: session.sessionId,
  });
  console.error(`pinpoint bridge on ${bridgeUrl} · session ${session.sessionId}`);
  process.on("SIGINT", async () => {
    await session.close();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
