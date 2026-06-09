import { describe, expect, it } from "vitest";
import { discoverPageTarget, findChrome } from "./launch-chrome.js";

describe("findChrome", () => {
  it("prefers PIN_CHROME_PATH", () => {
    expect(findChrome({ env: { PIN_CHROME_PATH: "/custom/chrome" }, exists: () => false })).toBe(
      "/custom/chrome",
    );
  });
  it("falls back to the first existing known path", () => {
    const p = findChrome({ env: {}, exists: (c) => c.includes("Google Chrome") });
    expect(p).toContain("Google Chrome");
  });
  it("throws when none found", () => {
    expect(() => findChrome({ env: {}, exists: () => false })).toThrow(/Chrome/);
  });
});

describe("discoverPageTarget", () => {
  const fetchImpl = (targets: unknown) =>
    (async () => ({ json: async () => targets })) as unknown as typeof fetch;

  it("picks the page target matching appUrl", async () => {
    const ws = await discoverPageTarget("http://localhost:9222", "http://localhost:5180", {
      fetchImpl: fetchImpl([
        { type: "page", url: "about:blank", webSocketDebuggerUrl: "ws://blank" },
        { type: "page", url: "http://localhost:5180/", webSocketDebuggerUrl: "ws://app" },
      ]),
    });
    expect(ws).toBe("ws://app");
  });

  it("falls back to the first page target", async () => {
    const ws = await discoverPageTarget("http://localhost:9222", "http://nope", {
      fetchImpl: fetchImpl([
        { type: "background_page", url: "x", webSocketDebuggerUrl: "ws://bg" },
        { type: "page", url: "about:blank", webSocketDebuggerUrl: "ws://first" },
      ]),
    });
    expect(ws).toBe("ws://first");
  });
});
