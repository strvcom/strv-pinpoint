import { existsSync } from "node:fs";
import { get } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakePage } from "../src/cdp/fake-page.js";
import { SessionRegistry } from "../src/server/sessions.js";
import { startSseServer } from "../src/server/sse-server.js";

const clip: string[] = [];
const page = new FakePage({ elementPng: { "#h": Buffer.from("PNG-BYTES") } });
const tmpRoot = join(tmpdir(), `ff-int-${Math.floor(Math.random() * 1e9)}`);
let server: ReturnType<typeof startSseServer>;
let base: string;

beforeAll(async () => {
  server = startSseServer(0, {
    page,
    sessions: new SessionRegistry(),
    writeClipboard: async (t) => {
      clip.push(t);
    },
    bridgeUrl: "http://localhost:0",
    tmpRoot,
  });
  await new Promise((r) => server.on("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const item = (over = {}) => ({
  id: "a",
  badge: 1,
  componentName: "Hero",
  ancestry: ["Hero"],
  selector: "#h",
  tagName: "H1",
  text: "hi",
  rect: { x: 0, y: 0, width: 4, height: 4 },
  comment: "bigger",
  wantScreenshot: false,
  ...over,
});

describe("bridge routes", () => {
  it("/send writes a frontman-flow JSON to the clipboard + saves flagged screenshots", async () => {
    const res = await fetch(`${base}/session/s1/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        items: [
          item({ badge: 1, wantScreenshot: true, selector: "#h" }),
          item({ id: "a2", badge: 2, componentName: "Nav", wantScreenshot: false }),
        ],
      }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.imageCount).toBe(1);
    const payload = JSON.parse(clip.at(-1) as string);
    expect(payload.source).toBe("frontman-flow");
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
