import { existsSync } from "node:fs";
import { get } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakePage } from "../src/driver/fake-page.js";
import { startBridgeServer } from "../src/server/bridge-server.js";
import { SessionRegistry } from "../src/server/sessions.js";

const clip: string[] = [];
const page = new FakePage({ elementPng: { "#h": Buffer.from("PNG-BYTES") } });
const tmpRoot = join(tmpdir(), `pp-int-${Math.floor(Math.random() * 1e9)}`);
let server: ReturnType<typeof startBridgeServer>;
let base: string;

beforeAll(async () => {
  server = startBridgeServer(0, {
    page,
    sessions: new SessionRegistry(),
    writeClipboard: async (t) => {
      clip.push(t);
    },
    bridgeUrl: "http://localhost:0",
    tmpRoot,
    appUrl: "http://localhost:5180",
    sessionId: "test-session",
    projectName: "test",
    projectDir: "/tmp",
  });
  await new Promise((r) => server.on("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const item = (over = {}) => ({
  id: "a",
  badge: 1,
  kind: "element",
  selected: [{ selector: "#h", tagName: "H1", text: "hi", react: null }],
  rect: { x: 0, y: 0, width: 4, height: 4 },
  comment: "bigger",
  wantScreenshot: false,
  ...over,
});

describe("bridge routes", () => {
  it("/send writes a pinpoint JSON to the clipboard + saves flagged screenshots", async () => {
    const res = await fetch(`${base}/session/s1/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        items: [
          item({ badge: 1, wantScreenshot: true }),
          item({
            id: "a2",
            badge: 2,
            selected: [
              {
                selector: "#h",
                tagName: "H1",
                text: "nav",
                react: { componentName: "Nav", ancestry: ["Nav"] },
              },
            ],
            wantScreenshot: false,
          }),
        ],
      }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.imageCount).toBe(1);
    const payload = JSON.parse(clip.at(-1) as string);
    expect(payload.source).toBe("pinpoint");
    expect(payload.version).toBe(2);
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0].screenshot).toMatch(/anno-1\.png$/);
    expect(existsSync(payload.items[0].screenshot)).toBe(true);
    expect(payload.items[1].screenshot).toBeNull();
  });

  it("/ack pushes an SSE status event to the subscribed session", async () => {
    const received: string[] = [];
    await new Promise<void>((resolve) => {
      get(`${base}/session/s2/events`, (r) => {
        r.on("data", (c) => {
          received.push(c.toString());
          if (received.join("").includes('"status":"running"')) resolve();
        });
        setTimeout(() => {
          fetch(`${base}/session/s2/ack`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ promptId: "p1", status: "running" }),
          });
        }, 100);
      });
    });
    expect(received.join("")).toContain('"type":"status"');
    expect(received.join("")).toContain('"promptId":"p1"');
  });
});
