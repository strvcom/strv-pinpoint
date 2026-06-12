import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakePage } from "../driver/fake-page.js";
import { startBridgeServer } from "./bridge-server.js";
import { SessionRegistry } from "./sessions.js";

let server: ReturnType<typeof startBridgeServer>;
let base: string;

beforeAll(async () => {
  server = startBridgeServer(0, {
    page: new FakePage(),
    sessions: new SessionRegistry(),
    writeClipboard: async () => {},
    bridgeUrl: "http://localhost:0",
    tmpRoot: "/tmp/pp-health-test",
    appUrl: "http://localhost:5180",
    sessionId: "sess-123",
    projectName: "my-app",
    projectDir: "/home/user/projects/my-app",
  });
  await new Promise((r) => server.on("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

describe("bridge /health", () => {
  it("GET /health returns 200 with ok + appUrl + sessionId", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      appUrl: "http://localhost:5180",
      sessionId: "sess-123",
      project: { name: "my-app", dir: "/home/user/projects/my-app" },
    });
  });

  it("GET /health includes project identity matching deps", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project).toEqual({ name: "my-app", dir: "/home/user/projects/my-app" });
  });

  it("unknown route still returns 404", async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
  });
});
