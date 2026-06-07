import { describe, expect, it } from "vitest";
import { buildClipboardJson } from "./clipboard-payload.js";

const item = (over = {}) => ({
  id: "a1",
  badge: 1,
  componentName: "Hero",
  ancestry: ["Hero", "App"],
  selector: "#h",
  tagName: "H1",
  text: "hi",
  rect: { x: 0, y: 0, width: 1, height: 1 },
  comment: "bigger",
  wantScreenshot: false,
  ...over,
});

describe("buildClipboardJson", () => {
  it("emits the frontman-flow marker + session/prompt ids + items", () => {
    const json = buildClipboardJson({
      bridgeUrl: "http://localhost:7331",
      sessionId: "s1",
      promptId: "p1",
      items: [item({ badge: 1 }), item({ id: "a2", badge: 2, componentName: "Nav" })],
      screenshotPaths: { 1: "/tmp/anno-1.png", 2: null },
    });
    const o = JSON.parse(json);
    expect(o.source).toBe("frontman-flow");
    expect(o.version).toBe(1);
    expect(o).toMatchObject({
      bridgeUrl: "http://localhost:7331",
      sessionId: "s1",
      promptId: "p1",
    });
    expect(o.items).toHaveLength(2);
    expect(o.items[0]).toMatchObject({
      badge: 1,
      componentName: "Hero",
      comment: "bigger",
      screenshot: "/tmp/anno-1.png",
    });
    expect(o.items[1]).toMatchObject({ badge: 2, componentName: "Nav", screenshot: null });
  });
});
