import { describe, expect, it } from "vitest";
import { FakePage } from "../cdp/fake-page.js";
import type { Rect } from "../types.js";
import { type CaptureDeps, capture } from "./capture.js";

const VIEWPORT_PNG = Buffer.from("viewport-data");
const CLIP_PNG = Buffer.from("clip-data");
const ELEMENT_PNG = Buffer.from("element-data");
const SAMPLE_RECT: Rect = { x: 5, y: 10, width: 100, height: 50 };

function noDeps(): CaptureDeps {
  return {
    rectOfSelection: async () => null,
    rectOfRegion: async () => null,
  };
}

describe("capture", () => {
  it("viewport: uses screenshotViewport and returns base64", async () => {
    const page = new FakePage({ viewportPng: VIEWPORT_PNG });
    const result = await capture(page, { kind: "viewport" }, noDeps());
    expect(result).not.toBeNull();
    expect(result!.mimeType).toBe("image/png");
    expect(result!.base64).toBe(VIEWPORT_PNG.toString("base64"));
  });

  it("selector: uses screenshotElement, records selector, returns base64", async () => {
    const page = new FakePage({ elementPng: { ".my-btn": ELEMENT_PNG } });
    const result = await capture(page, { kind: "selector", selector: ".my-btn" }, noDeps());
    expect(result).not.toBeNull();
    expect(result!.base64).toBe(ELEMENT_PNG.toString("base64"));
    expect(page.elementSelectors).toContain(".my-btn");
  });

  it("selector: returns null when element not found", async () => {
    const page = new FakePage({ elementPng: { ".my-btn": null } });
    const result = await capture(page, { kind: "selector", selector: ".my-btn" }, noDeps());
    expect(result).toBeNull();
  });

  it("selection: calls rectOfSelection, screenshotClip with the rect", async () => {
    const page = new FakePage({ clipPng: CLIP_PNG });
    const deps: CaptureDeps = {
      rectOfSelection: async () => SAMPLE_RECT,
      rectOfRegion: async () => null,
    };
    const result = await capture(page, { kind: "selection" }, deps);
    expect(result).not.toBeNull();
    expect(result!.base64).toBe(CLIP_PNG.toString("base64"));
    expect(page.clips).toEqual([SAMPLE_RECT]);
  });

  it("selection: returns null when rectOfSelection returns null", async () => {
    const page = new FakePage();
    const result = await capture(page, { kind: "selection" }, noDeps());
    expect(result).toBeNull();
  });

  it("region: calls rectOfRegion, screenshotClip with the rect", async () => {
    const page = new FakePage({ clipPng: CLIP_PNG });
    const deps: CaptureDeps = {
      rectOfSelection: async () => null,
      rectOfRegion: async () => SAMPLE_RECT,
    };
    const result = await capture(page, { kind: "region" }, deps);
    expect(result).not.toBeNull();
    expect(result!.base64).toBe(CLIP_PNG.toString("base64"));
    expect(page.clips).toEqual([SAMPLE_RECT]);
  });

  it("region: returns null when rectOfRegion returns null", async () => {
    const page = new FakePage();
    const result = await capture(page, { kind: "region" }, noDeps());
    expect(result).toBeNull();
  });
});
