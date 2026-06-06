import { describe, expect, it } from "vitest";
import { FakePage } from "../cdp/fake-page.js";
import { ANNOTATIONS_PROBE } from "../cdp/overlay-script.js";
import { readAnnotations } from "./read-annotations.js";

const batch = (over = {}) => ({
  batchId: 1,
  ready: true,
  items: [
    {
      id: "a1",
      badge: 1,
      componentName: "Hero",
      ancestry: ["Hero"],
      selector: "h1",
      tagName: "H1",
      text: "hi",
      rect: { x: 0, y: 0, width: 1, height: 1 },
      comment: "bigger",
      wantScreenshot: false,
    },
  ],
  ...over,
});

describe("readAnnotations", () => {
  it("returns null when absent", async () => {
    expect(
      await readAnnotations(new FakePage({ evalResults: { [ANNOTATIONS_PROBE]: null } })),
    ).toBeNull();
  });
  it("returns null when not ready", async () => {
    expect(
      await readAnnotations(
        new FakePage({ evalResults: { [ANNOTATIONS_PROBE]: batch({ ready: false }) } }),
      ),
    ).toBeNull();
  });
  it("returns null when ready but empty", async () => {
    expect(
      await readAnnotations(
        new FakePage({ evalResults: { [ANNOTATIONS_PROBE]: batch({ items: [] }) } }),
      ),
    ).toBeNull();
  });
  it("returns the batch when ready and non-empty", async () => {
    const b = await readAnnotations(
      new FakePage({ evalResults: { [ANNOTATIONS_PROBE]: batch() } }),
    );
    expect(b?.items[0].componentName).toBe("Hero");
    expect(b?.ready).toBe(true);
  });
});
