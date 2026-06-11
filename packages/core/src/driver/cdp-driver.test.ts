import { describe, expect, it, vi } from "vitest";
import { createCdpDriver, pinpointPreamble } from "./cdp-driver.js";

const cfg = { cdpUrl: "http://localhost:9222", profileDir: "/tmp/p" };

describe("createCdpDriver().healthCheck", () => {
  it("ok when a debug Chrome is already up", async () => {
    const d = createCdpDriver(cfg, { isCdpUp: async () => true, exists: () => false, env: {} });
    expect(await d.healthCheck()).toEqual({ ok: true });
  });

  it("ok when a Chrome binary is found", async () => {
    const d = createCdpDriver(cfg, {
      isCdpUp: async () => false,
      exists: (p) => p === "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      env: {},
    });
    expect(await d.healthCheck()).toEqual({ ok: true });
  });

  it("not ok with a remedy when nothing is found", async () => {
    const d = createCdpDriver(cfg, { isCdpUp: async () => false, exists: () => false, env: {} });
    const h = await d.healthCheck();
    expect(h.ok).toBe(false);
    if (!h.ok) {
      expect(h.reason).toMatch(/Chrome not found/i);
      expect(h.remedy).toMatch(/PIN_CHROME_PATH/);
    }
  });

  it("not ok when explicit chromePath does not exist", async () => {
    const d = createCdpDriver(
      { cdpUrl: "http://localhost:9222", profileDir: "/tmp/p", chromePath: "/no/such/chrome" },
      { isCdpUp: async () => false, exists: () => false, env: {} },
    );
    const h = await d.healthCheck();
    expect(h.ok).toBe(false);
  });

  it("exposes its name", () => {
    expect(createCdpDriver(cfg).name).toBe("cdp");
  });
});

describe("createCdpDriver().connect", () => {
  it("attaches to an up CDP endpoint, injects the overlay, returns a session", async () => {
    const injected: string[] = [];
    const fakePage = {
      injectBootstrap: async (src: string) => void injected.push(src),
    } as unknown as DriverSessionPage;
    const cdp = { send: vi.fn(async () => ({})), close: vi.fn() };

    const d = createCdpDriver(
      { cdpUrl: "http://localhost:9222", profileDir: "/tmp/p" },
      {
        isCdpUp: async () => true, // already up → no launch
        discoverPageTarget: async () => "ws://localhost:9222/devtools/page/AB",
        attach: async () => cdp,
        makePage: () => fakePage,
      },
    );

    const session = await d.connect({
      appUrl: "http://localhost:5173",
      bridgeUrl: "http://localhost:7331",
    });
    expect(cdp.send).toHaveBeenCalledWith("Page.enable");
    expect(injected[0]).toContain("__pinpointConfig");
    expect(injected[0]).toContain("http://localhost:7331");
    expect(typeof session.sessionId).toBe("string");
    await session.close();
    expect(cdp.close).toHaveBeenCalled();
  });
});

// minimal structural type for the fake (kept local to the test)
type DriverSessionPage = import("../cdp/page.js").BridgePage;

describe("pinpointPreamble", () => {
  it("builds the __pinpointConfig assignment", () => {
    expect(pinpointPreamble("http://localhost:7331", "sess-1")).toBe(
      'window.__pinpointConfig = {"bridgeUrl":"http://localhost:7331","sessionId":"sess-1"};',
    );
  });
});
