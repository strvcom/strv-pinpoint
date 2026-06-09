import { describe, expect, it } from "vitest";
import { createCdpDriver } from "./cdp-driver.js";

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
