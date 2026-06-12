#!/usr/bin/env node
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Driver, DriverSession } from "@pinpoint/core";
import {
  parseConfig,
  readPinpointConfig,
  resolveProfileDir,
  runSetup,
  SessionRegistry,
  startBridgeServer,
  systemClipboard,
} from "@pinpoint/core";
import { createCdpDriver, pinpointPreamble } from "@pinpoint/driver-cdp";

function buildDriver(cfg: ReturnType<typeof parseConfig>, profileDir: string): Driver {
  return createCdpDriver({ cdpUrl: cfg.cdpUrl, chromePath: cfg.chromePath, profileDir });
}

async function setup(profileMode: "home" | "repo") {
  const cwd = process.cwd();
  const cfg = parseConfig(process.env as Record<string, string | undefined>);
  const profileDir = resolveProfileDir({ cwd, home: homedir(), mode: profileMode });
  const res = await runSetup({
    cwd,
    home: homedir(),
    profileMode,
    driver: buildDriver(cfg, profileDir),
  });
  if (!res.ok) {
    console.error(`pinpoint setup: ${res.reason}\n${res.remedy}`);
    process.exit(1);
  }
  console.error(
    `pinpoint setup: driver=${res.driver} profile=${res.profileDir}\nwrote ${res.configPath}`,
  );
}

async function start() {
  const cwd = process.cwd();
  const env = parseConfig(process.env as Record<string, string | undefined>);
  const file = readPinpointConfig(cwd) ?? {};
  // Precedence: explicit env override > config file > built-in default.
  const cfg = {
    ...env,
    port: process.env.PIN_PORT ? env.port : (file.port ?? env.port),
    profileDir: process.env.PIN_CHROME_PROFILE
      ? env.profileDir
      : (file.profileDir ?? env.profileDir),
  };
  const bridgeUrl = `http://localhost:${cfg.port}`;
  const driver = buildDriver(cfg, cfg.profileDir);

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
    projectName: basename(cwd),
    projectDir: cwd,
  });
  if (process.env.PIN_DEV) {
    // Dev hot loop: watch the esbuild-built overlay IIFE and re-inject on change.
    // Default path is repo-relative to the bundled CLI (bin/pinpoint -> ../../core/dist/...).
    const here = dirname(fileURLToPath(import.meta.url));
    const overlayFile =
      process.env.PIN_OVERLAY_FILE ?? resolve(here, "../../core/dist/overlay.iife.js");
    const { startOverlayWatch } = await import("./overlay-watch.js");
    startOverlayWatch({
      page: session.page,
      filePath: overlayFile,
      preamble: pinpointPreamble(bridgeUrl, session.sessionId),
    });
  }
  console.error(`pinpoint bridge on ${bridgeUrl} · session ${session.sessionId}`);
  process.on("SIGINT", async () => {
    await session.close();
    process.exit(0);
  });
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "setup") {
    const mode = rest.includes("--profile-mode")
      ? (rest[rest.indexOf("--profile-mode") + 1] as "home" | "repo")
      : "home";
    await setup(mode === "repo" ? "repo" : "home");
    return;
  }
  await start();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
