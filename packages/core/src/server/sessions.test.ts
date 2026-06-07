import type { ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { SessionRegistry } from "./sessions.js";

function fakeRes() {
  const writes: string[] = [];
  return { writes, write: (s: string) => writes.push(s) } as unknown as ServerResponse & {
    writes: string[];
  };
}

describe("SessionRegistry", () => {
  it("pushes SSE-framed events to a registered session", () => {
    const reg = new SessionRegistry();
    const res = fakeRes();
    reg.register("s1", res);
    expect(reg.pushEvent("s1", { type: "status", promptId: "p1", status: "running" })).toBe(true);
    expect((res as unknown as { writes: string[] }).writes[0]).toBe(
      `data: {"type":"status","promptId":"p1","status":"running"}\n\n`,
    );
  });

  it("returns false for unknown / deregistered sessions", () => {
    const reg = new SessionRegistry();
    const res = fakeRes();
    reg.register("s1", res);
    reg.deregister("s1");
    expect(reg.pushEvent("s1", { type: "status" })).toBe(false);
    expect(reg.pushEvent("nope", { type: "status" })).toBe(false);
  });
});
