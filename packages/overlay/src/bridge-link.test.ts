// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { installBridgeLink } from "./bridge-link.js";

afterEach(() => {
  delete (window as any).__pinpointLink;
  delete (window as any).__pinpointConfig;
  vi.unstubAllGlobals();
});

it("installs the link global and returns a disposer that removes it", () => {
  const dispose = installBridgeLink();
  expect((window as any).__pinpointLink).toBeTruthy();
  dispose();
  expect((window as any).__pinpointLink).toBeUndefined();
});

it("closes the EventSource opened by init() when disposed", () => {
  const close = vi.fn();
  class FakeES {
    onmessage: ((e: MessageEvent) => void) | null = null;
    constructor(public url: string) {}
    close = close;
  }
  vi.stubGlobal("EventSource", FakeES as unknown as typeof EventSource);
  (window as any).__pinpointConfig = { bridgeUrl: "http://x", sessionId: "s1" };

  const dispose = installBridgeLink();
  (window as any).__pinpointLink.init(() => {});
  dispose();
  expect(close).toHaveBeenCalledTimes(1);
});
