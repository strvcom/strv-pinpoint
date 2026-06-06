import { describe, it, expect } from "vitest";
import { FakePage } from "../cdp/fake-page.js";
import { REGION_PROBE } from "../cdp/overlay-script.js";
import { readRegion } from "./read-region.js";
import type { Rect } from "../types.js";

const SAMPLE_RECT: Rect = { x: 50, y: 100, width: 200, height: 150 };

describe("readRegion", () => {
  it("returns null when probe returns null", async () => {
    const page = new FakePage({ evalResults: { [REGION_PROBE]: null } });
    const result = await readRegion(page);
    expect(result).toBeNull();
    expect(page.evaluatedExpressions).toContain(REGION_PROBE);
  });

  it("returns the rect when probe returns a rect", async () => {
    const page = new FakePage({ evalResults: { [REGION_PROBE]: SAMPLE_RECT } });
    const result = await readRegion(page);
    expect(result).toEqual(SAMPLE_RECT);
    expect(page.evaluatedExpressions).toContain(REGION_PROBE);
  });
});
