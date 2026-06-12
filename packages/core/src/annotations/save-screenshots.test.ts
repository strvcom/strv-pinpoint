import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { FakePage } from "../driver/fake-page.js";
import { saveScreenshots } from "./save-screenshots.js";

const item = (over: Record<string, unknown> = {}) => ({
  id: "a",
  badge: 1,
  kind: "element" as const,
  selected: [{ selector: "#h", tagName: "H1", text: "", react: null }],
  rect: { x: 0, y: 0, width: 4, height: 4 },
  comment: "",
  wantScreenshot: false,
  ...over,
});

const dir = join(tmpdir(), `pp-test-${Math.floor(Math.random() * 1e9)}`);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("saveScreenshots", () => {
  it("writes PNGs only for wantScreenshot items; null otherwise", async () => {
    const page = new FakePage({ elementPng: { "#h": Buffer.from("PNG") } });
    const paths = await saveScreenshots(
      page,
      [item({ badge: 1, wantScreenshot: true }), item({ badge: 2, wantScreenshot: false })],
      dir,
    );
    expect(paths[1]).toBe(join(dir, "anno-1.png"));
    expect(existsSync(paths[1] as string)).toBe(true);
    expect(paths[2]).toBeNull();
    // overlay is hidden during capture so it doesn't appear in the screenshot
    expect(page.evaluatedExpressions.some((e) => e.includes("__ppHide"))).toBe(true);
  });

  it("uses a rect clip for screenshot annotations (kind=screenshot)", async () => {
    const { readFileSync } = await import("node:fs");
    const page = new FakePage({ clipPng: Buffer.from("CLIP") });
    const paths = await saveScreenshots(
      page,
      [item({ badge: 3, kind: "screenshot" as const, selected: [], wantScreenshot: true })],
      dir,
    );
    expect(paths[3]).toBe(join(dir, "anno-3.png"));
    expect(readFileSync(paths[3] as string).toString()).toBe("CLIP");
    // CRITICAL: a screenshot-kind item must clip the region, never call screenshotElement
    expect(page.elementSelectors).toHaveLength(0);
  });

  it("uses screenshotElement for element annotations (kind=element)", async () => {
    const page = new FakePage({ elementPng: { "#nav": Buffer.from("ELEM") } });
    const paths = await saveScreenshots(
      page,
      [
        item({
          badge: 4,
          kind: "element" as const,
          selected: [{ selector: "#nav", tagName: "NAV", text: "", react: null }],
          wantScreenshot: true,
        }),
      ],
      dir,
    );
    expect(paths[4]).toBe(join(dir, "anno-4.png"));
    const { readFileSync } = await import("node:fs");
    expect(readFileSync(paths[4] as string).toString()).toBe("ELEM");
    // converse guard: when screenshotElement succeeds, the rect clip must NOT also be taken
    expect(page.clips).toHaveLength(0);
  });
});
