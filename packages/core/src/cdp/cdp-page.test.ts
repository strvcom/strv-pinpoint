import { describe, expect, it } from "vitest";
import { CdpPage } from "./cdp-page.js";

// Fake CdpConnection: records calls, returns scripted results by method.
class FakeCdp {
  calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  constructor(private readonly results: Record<string, unknown> = {}) {}
  send<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    this.calls.push({ method, params });
    return Promise.resolve((this.results[method] ?? {}) as T);
  }
}

const pngB64 = Buffer.from("PNGDATA").toString("base64");

describe("CdpPage", () => {
  it("evaluate returns the value via Runtime.evaluate(returnByValue)", async () => {
    const cdp = new FakeCdp({
      "Runtime.evaluate": { result: { value: { componentName: "Hero" } } },
    });
    const page = new CdpPage(cdp as never);
    const v = await page.evaluate<{ componentName: string }>("window.x");
    expect(v.componentName).toBe("Hero");
    expect(cdp.calls[0].params).toMatchObject({ expression: "window.x", returnByValue: true });
  });

  it("injectBootstrap registers on new document AND evaluates once", async () => {
    const cdp = new FakeCdp();
    const page = new CdpPage(cdp as never);
    await page.injectBootstrap("OVERLAY");
    expect(cdp.calls.map((c) => c.method)).toEqual([
      "Page.addScriptToEvaluateOnNewDocument",
      "Runtime.evaluate",
    ]);
    expect(cdp.calls[0].params.source).toBe("OVERLAY");
  });

  it("screenshotClip captures a PNG with scale:1 and decodes base64", async () => {
    const cdp = new FakeCdp({ "Page.captureScreenshot": { data: pngB64 } });
    const page = new CdpPage(cdp as never);
    const buf = await page.screenshotClip({ x: 1, y: 2, width: 3, height: 4 });
    expect(buf.toString()).toBe("PNGDATA");
    expect(cdp.calls[0].params.clip).toEqual({ x: 1, y: 2, width: 3, height: 4, scale: 1 });
  });

  it("screenshotElement returns null when the element is absent", async () => {
    const cdp = new FakeCdp({ "Runtime.evaluate": { result: { value: null } } });
    const page = new CdpPage(cdp as never);
    expect(await page.screenshotElement("#missing")).toBeNull();
  });
});
