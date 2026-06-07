import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { FakePage } from "../cdp/fake-page.js";
import { saveScreenshots } from "./save-screenshots.js";

const item = (over = {}) => ({
  id: "a",
  badge: 1,
  componentName: "Hero",
  ancestry: [],
  selector: "#h",
  tagName: "H1",
  text: "",
  rect: { x: 0, y: 0, width: 4, height: 4 },
  comment: "",
  wantScreenshot: false,
  ...over,
});

const dir = join(tmpdir(), `ff-test-${Math.floor(Math.random() * 1e9)}`);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("saveScreenshots", () => {
  it("writes PNGs only for wantScreenshot items; null otherwise", async () => {
    const page = new FakePage({ elementPng: { "#h": Buffer.from("PNG") } });
    const paths = await saveScreenshots(
      page,
      [
        item({ badge: 1, wantScreenshot: true, selector: "#h" }),
        item({ badge: 2, wantScreenshot: false }),
      ],
      dir,
    );
    expect(paths[1]).toBe(join(dir, "anno-1.png"));
    expect(existsSync(paths[1] as string)).toBe(true);
    expect(paths[2]).toBeNull();
  });
});
