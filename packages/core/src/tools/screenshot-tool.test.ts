import { describe, expect, it } from "vitest";
import { FakePage } from "../cdp/fake-page.js";
import { REGION_PROBE } from "../cdp/overlay-script.js";
import type { RawSelection } from "../cdp/selection-probe.js";
import { SELECTION_PROBE } from "../cdp/selection-probe.js";
import type { Rect } from "../types.js";
import { screenshotTool } from "./screenshot-tool.js";

const VIEWPORT_PNG = Buffer.from("vp-data");
const CLIP_PNG = Buffer.from("clip-data");
const ELEMENT_PNG = Buffer.from("elem-data");

const SAMPLE_SELECTION: RawSelection = {
  selector: "div > span",
  tagName: "SPAN",
  text: "test",
  rect: { x: 1, y: 2, width: 50, height: 20 } as Rect,
  componentName: "TestComp",
  ancestry: ["TestComp"],
};

const SAMPLE_REGION: Rect = { x: 10, y: 20, width: 200, height: 100 };

describe("screenshotTool", () => {
  describe("viewport", () => {
    it("returns image content for viewport target", async () => {
      const page = new FakePage({ viewportPng: VIEWPORT_PNG });
      const result = await screenshotTool({ page }, { target: "viewport" });
      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("image");
      const img = result.content[0] as { type: "image"; data: string; mimeType: string };
      expect(img.data).toBe(VIEWPORT_PNG.toString("base64"));
      expect(img.mimeType).toBe("image/png");
    });
  });

  describe("selector", () => {
    it("returns image content for a CSS selector", async () => {
      const page = new FakePage({ elementPng: { "#hero": ELEMENT_PNG } });
      const result = await screenshotTool({ page }, { target: "#hero" });
      expect(result.isError).toBeFalsy();
      const img = result.content[0] as { type: "image"; data: string; mimeType: string };
      expect(img.data).toBe(ELEMENT_PNG.toString("base64"));
      expect(page.elementSelectors).toContain("#hero");
    });

    it("returns error when selector matches no element", async () => {
      const page = new FakePage({ elementPng: { "#hero": null } });
      const result = await screenshotTool({ page }, { target: "#hero" });
      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toMatch(/selector/i);
    });
  });

  describe("selection", () => {
    it("returns image content when an element is selected", async () => {
      const page = new FakePage({
        evalResults: { [SELECTION_PROBE]: SAMPLE_SELECTION },
        clipPng: CLIP_PNG,
      });
      const result = await screenshotTool({ page }, { target: "selection" });
      expect(result.isError).toBeFalsy();
      const img = result.content[0] as { type: "image"; data: string; mimeType: string };
      expect(img.data).toBe(CLIP_PNG.toString("base64"));
      expect(page.clips).toEqual([SAMPLE_SELECTION.rect]);
    });

    it("returns error when no element is selected", async () => {
      const page = new FakePage({ evalResults: { [SELECTION_PROBE]: null } });
      const result = await screenshotTool({ page }, { target: "selection" });
      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toMatch(/pick/i);
    });
  });

  describe("region", () => {
    it("returns image content when a region is set", async () => {
      const page = new FakePage({
        evalResults: { [REGION_PROBE]: SAMPLE_REGION },
        clipPng: CLIP_PNG,
      });
      const result = await screenshotTool({ page }, { target: "region" });
      expect(result.isError).toBeFalsy();
      const img = result.content[0] as { type: "image"; data: string; mimeType: string };
      expect(img.data).toBe(CLIP_PNG.toString("base64"));
      expect(page.clips).toEqual([SAMPLE_REGION]);
    });

    it("returns error when no region is set", async () => {
      const page = new FakePage({ evalResults: { [REGION_PROBE]: null } });
      const result = await screenshotTool({ page }, { target: "region" });
      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toMatch(/region/i);
    });
  });
});
