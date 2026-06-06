import { describe, expect, it } from "vitest";
import { FakePage } from "../cdp/fake-page.js";
import { ANNOTATIONS_PROBE } from "../cdp/overlay-script.js";
import { getAnnotationsTool } from "./get-annotations.js";

const item = (over = {}) => ({
  id: "a1",
  badge: 1,
  componentName: "Hero",
  ancestry: ["Hero"],
  selector: "#h",
  tagName: "H1",
  text: "hi",
  rect: { x: 0, y: 0, width: 10, height: 10 },
  comment: "bigger",
  wantScreenshot: false,
  ...over,
});
const ready = (items: unknown[]) => ({
  [ANNOTATIONS_PROBE]: { batchId: 1, ready: true, items },
});

describe("getAnnotationsTool", () => {
  it("guides the user when nothing is submitted", async () => {
    const r = await getAnnotationsTool({
      page: new FakePage({ evalResults: { [ANNOTATIONS_PROBE]: null } }),
    });
    expect((r.content[0] as { text: string }).text).toMatch(/send to claude/i);
  });

  it("returns a text block per item in badge order", async () => {
    const r = await getAnnotationsTool({
      page: new FakePage({
        evalResults: ready([
          item({ badge: 1, componentName: "Hero" }),
          item({ id: "a2", badge: 2, componentName: "Nav", selector: "#n" }),
        ]),
      }),
    });
    const texts = r.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { text: string }).text);
    expect(texts.join("\n")).toMatch(/Hero/);
    expect(texts.join("\n")).toMatch(/Nav/);
  });

  it("embeds an image only for wantScreenshot items", async () => {
    const page = new FakePage({
      evalResults: ready([item({ wantScreenshot: true, selector: "#h" })]),
      elementPng: { "#h": Buffer.from("PNG") },
    });
    const r = await getAnnotationsTool({ page });
    const imgs = r.content.filter((c) => c.type === "image");
    expect(imgs).toHaveLength(1);
    expect((imgs[0] as { data: string }).data).toBe(Buffer.from("PNG").toString("base64"));
  });

  it("falls back to a rect clip when no element matches", async () => {
    const page = new FakePage({
      evalResults: ready([item({ wantScreenshot: true, selector: "#missing" })]),
      elementPng: { "#missing": null },
      clipPng: Buffer.from("CLIP"),
    });
    const r = await getAnnotationsTool({ page });
    const imgs = r.content.filter((c) => c.type === "image");
    expect((imgs[0] as { data: string }).data).toBe(Buffer.from("CLIP").toString("base64"));
  });
});
