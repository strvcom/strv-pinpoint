import { describe, it, expect } from "vitest";
import { parseConfig } from "./config.js";

describe("parseConfig", () => {
  it("returns defaults when env is empty", () => {
    const cfg = parseConfig({});
    expect(cfg.mcpPort).toBe(7331);
    expect(cfg.cdpUrl).toBe("http://localhost:9222");
    expect(cfg.appUrl).toBe("http://localhost:3000");
  });

  it("overrides mcpPort from FF_MCP_PORT", () => {
    const cfg = parseConfig({ FF_MCP_PORT: "9000" });
    expect(cfg.mcpPort).toBe(9000);
  });

  it("overrides cdpUrl from FF_CDP_URL", () => {
    const cfg = parseConfig({ FF_CDP_URL: "http://localhost:9333" });
    expect(cfg.cdpUrl).toBe("http://localhost:9333");
  });

  it("overrides appUrl from FF_APP_URL", () => {
    const cfg = parseConfig({ FF_APP_URL: "http://localhost:5173" });
    expect(cfg.appUrl).toBe("http://localhost:5173");
  });

  it("overrides all values at once", () => {
    const cfg = parseConfig({
      FF_MCP_PORT: "9000",
      FF_CDP_URL: "http://localhost:9333",
      FF_APP_URL: "http://localhost:5173",
    });
    expect(cfg.mcpPort).toBe(9000);
    expect(cfg.cdpUrl).toBe("http://localhost:9333");
    expect(cfg.appUrl).toBe("http://localhost:5173");
  });
});
