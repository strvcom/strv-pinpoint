import { describe, expect, it } from "vitest";
import { buildClipboardJson } from "./clipboard-payload.js";

const item = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  badge: 1,
  kind: "element" as const,
  selected: [
    {
      selector: "#x",
      tagName: "H1",
      text: "t",
      react: { componentName: "Hero", ancestry: ["Hero"] },
    },
  ],
  rect: { x: 0, y: 0, width: 1, height: 1 },
  comment: "c",
  wantScreenshot: true,
  ...over,
});

describe("buildClipboardJson", () => {
  it("emits the pinpoint marker + session/prompt ids + items", () => {
    const json = buildClipboardJson({
      bridgeUrl: "http://localhost:7331",
      sessionId: "s1",
      promptId: "p1",
      items: [
        item({ badge: 1 }),
        item({
          id: "a2",
          badge: 2,
          selected: [
            {
              selector: "#y",
              tagName: "NAV",
              text: "nav",
              react: { componentName: "Nav", ancestry: ["Nav"] },
            },
          ],
        }),
      ],
      screenshotPaths: { 1: "/tmp/anno-1.png", 2: null },
    });
    const o = JSON.parse(json);
    expect(o.source).toBe("pinpoint");
    expect(o.version).toBe(2);
    expect(o).toMatchObject({
      bridgeUrl: "http://localhost:7331",
      sessionId: "s1",
      promptId: "p1",
    });
    expect(o.items).toHaveLength(2);
    expect(o.items[0]).toMatchObject({
      badge: 1,
      kind: "element",
      selected: [
        {
          selector: "#x",
          tagName: "H1",
          text: "t",
          react: { componentName: "Hero", ancestry: ["Hero"] },
        },
      ],
      comment: "c",
      screenshot: "/tmp/anno-1.png",
    });
    expect(o.items[0]).not.toHaveProperty("componentName");
    expect(o.items[1]).toMatchObject({ badge: 2, kind: "element", screenshot: null });
  });

  it("strips rect from items and from each selection (not needed in the copied JSON)", () => {
    const json = buildClipboardJson({
      bridgeUrl: "http://localhost:7331",
      sessionId: "s1",
      promptId: "p1",
      // The overlay's selection probe attaches a runtime `rect` to each selection even though the
      // Selection type omits it; the copied JSON must carry no rect anywhere.
      items: [
        item({
          selected: [
            {
              selector: "#x",
              tagName: "H1",
              text: "t",
              react: { componentName: "Hero", ancestry: ["Hero"] },
              rect: { x: 5, y: 6, width: 7, height: 8 },
            },
          ],
        }),
      ],
      screenshotPaths: { 1: null },
    });
    const o = JSON.parse(json);
    expect(o.items[0]).not.toHaveProperty("rect");
    expect(o.items[0].selected[0]).not.toHaveProperty("rect");
    // the rest of the selection survives
    expect(o.items[0].selected[0]).toMatchObject({ selector: "#x", tagName: "H1" });
  });
});
