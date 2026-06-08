import { describe, expect, it } from "vitest";
import { CdpConnection } from "./cdp-connection.js";

// Minimal fake of the WHATWG WebSocket the connection depends on.
class FakeWS {
  static last: FakeWS;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  sent: string[] = [];
  constructor(public url: string) {
    FakeWS.last = this;
    queueMicrotask(() => this.onopen?.());
  }
  send(s: string) {
    this.sent.push(s);
  }
  close() {}
  reply(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
}

describe("CdpConnection", () => {
  it("correlates a response to its request id", async () => {
    const cdp = await CdpConnection.attach("ws://x", { WebSocketImpl: FakeWS as never });
    const p = cdp.send("Page.enable");
    const sent = JSON.parse(FakeWS.last.sent[0]);
    expect(sent.method).toBe("Page.enable");
    FakeWS.last.reply({ id: sent.id, result: { ok: 1 } });
    expect(await p).toEqual({ ok: 1 });
  });

  it("rejects on a protocol error and ignores events", async () => {
    const cdp = await CdpConnection.attach("ws://x", { WebSocketImpl: FakeWS as never });
    FakeWS.last.reply({ method: "Page.loadEventFired", params: {} }); // event: no id, ignored
    const p = cdp.send("Bad.method");
    const id = JSON.parse(FakeWS.last.sent.at(-1) as string).id;
    FakeWS.last.reply({ id, error: { message: "boom" } });
    await expect(p).rejects.toThrow("boom");
  });
});
