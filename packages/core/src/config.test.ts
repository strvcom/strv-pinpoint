import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.js";

describe("parseConfig", () => {
  it("returns defaults when env is empty", () => {
    const cfg = parseConfig({});
    expect(cfg.port).toBe(7331);
    expect(cfg.cdpUrl).toBe("http://localhost:9222");
    expect(cfg.appUrl).toBe("http://localhost:5173");
  });

  it("overrides port from FF_PORT", () => {
    expect(parseConfig({ FF_PORT: "9000" }).port).toBe(9000);
  });

  it("overrides cdpUrl from FF_CDP_URL", () => {
    expect(parseConfig({ FF_CDP_URL: "http://localhost:9333" }).cdpUrl).toBe(
      "http://localhost:9333",
    );
  });

  it("overrides appUrl from FF_APP_URL", () => {
    expect(parseConfig({ FF_APP_URL: "http://localhost:5180" }).appUrl).toBe(
      "http://localhost:5180",
    );
  });

  it("reads chromePath from FF_CHROME_PATH (undefined by default)", () => {
    expect(parseConfig({}).chromePath).toBeUndefined();
    expect(parseConfig({ FF_CHROME_PATH: "/c" }).chromePath).toBe("/c");
  });

  it("defaults profileDir and overrides from FF_CHROME_PROFILE", () => {
    expect(parseConfig({}).profileDir).toMatch(/ff-chrome/);
    expect(parseConfig({ FF_CHROME_PROFILE: "/p" }).profileDir).toBe("/p");
  });
});
