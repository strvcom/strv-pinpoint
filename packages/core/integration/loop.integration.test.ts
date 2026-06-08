import { existsSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Connection, connect } from "../src/cdp/connector.js";
import { startBridgeServer } from "../src/server/bridge-server.js";
import { SessionRegistry } from "../src/server/sessions.js";
import type { SelectionFound } from "../src/types.js";

/**
 * The full clipboard loop on a live page: inject overlay → build an annotation
 * from the in-page extractor → POST /send → assert the bridge wrote a
 * frontman-flow clipboard JSON and saved the flagged screenshot to disk.
 * Requires examples/vite-react on 5180 + Chrome on 9222.
 *
 *   pnpm --dir examples/vite-react exec vite --port 5180 --strictPort &
 *   <chrome> --headless=new --remote-debugging-port=9222 about:blank &
 *   pnpm --filter @frontman-flow/core exec vitest run --config vitest.integration.config.ts loop
 */
const APP_URL = process.env.FF_VITE_URL ?? "http://localhost:5180";
const CDP_URL = process.env.FF_CDP_URL ?? "http://localhost:9222";
const tmpRoot = join(tmpdir(), `ff-loop-${Math.floor(Math.random() * 1e9)}`);

let connection: Connection;
let server: ReturnType<typeof startBridgeServer>;
let base: string;
const clip: string[] = [];

beforeAll(async () => {
  connection = await connect({
    cdpUrl: CDP_URL,
    appUrl: APP_URL,
    bridgeUrl: "http://localhost:7331",
  });
  server = startBridgeServer(0, {
    page: connection.page,
    sessions: new SessionRegistry(),
    writeClipboard: async (t) => {
      clip.push(t);
    },
    bridgeUrl: "http://localhost:7331",
    tmpRoot,
  });
  await new Promise((r) => server.on("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server?.close();
  await connection?.close();
});

describe("frontman-flow clipboard loop on Vite (integration)", () => {
  it("/send writes a frontman-flow clipboard JSON + saves the flagged screenshot", async () => {
    const sel = await connection.page.evaluate<SelectionFound>(
      "window.__frontmanFlowExtractSelection(document.querySelector('#hero-heading'))",
    );
    const item = { ...sel, id: "a1", badge: 1, comment: "make it bigger", wantScreenshot: true };

    const res = await fetch(`${base}/session/s1/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [item] }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.imageCount).toBe(1);

    const payload = JSON.parse(clip.at(-1) as string);
    expect(payload.source).toBe("frontman-flow");
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].componentName).toBe("Hero");
    expect(payload.items[0].comment).toBe("make it bigger");
    expect(payload.items[0].screenshot).toMatch(/anno-1\.png$/);
    expect(existsSync(payload.items[0].screenshot)).toBe(true);
  });
});
