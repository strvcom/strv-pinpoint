import { describe, it, expect } from "vitest";
import { FakePage } from "../cdp/fake-page.js";
import { SELECTION_PROBE } from "../cdp/selection-probe.js";
import { readSelection } from "./read-selection.js";
import type { RawSelection } from "../cdp/selection-probe.js";

const SAMPLE_RAW: RawSelection = {
  selector: "div > h1",
  tagName: "H1",
  text: "Hello world",
  rect: { x: 10, y: 20, width: 300, height: 40 },
  componentName: "HeroTitle",
  ancestry: ["HeroTitle", "HeroSection"],
};

describe("readSelection", () => {
  it("returns status:none when probe returns null", async () => {
    const page = new FakePage({ evalResults: { [SELECTION_PROBE]: null } });
    const result = await readSelection(page);
    expect(result.status).toBe("none");
    if (result.status === "none") {
      expect(result.message).toMatch(/pick/i);
    }
    expect(page.evaluatedExpressions).toContain(SELECTION_PROBE);
  });

  it("returns status:selected with all fields when probe returns a RawSelection", async () => {
    const page = new FakePage({ evalResults: { [SELECTION_PROBE]: SAMPLE_RAW } });
    const result = await readSelection(page);
    expect(result.status).toBe("selected");
    if (result.status === "selected") {
      expect(result.componentName).toBe("HeroTitle");
      expect(result.ancestry).toEqual(["HeroTitle", "HeroSection"]);
      expect(result.selector).toBe("div > h1");
      expect(result.tagName).toBe("H1");
      expect(result.text).toBe("Hello world");
      expect(result.rect).toEqual({ x: 10, y: 20, width: 300, height: 40 });
    }
    expect(page.evaluatedExpressions).toContain(SELECTION_PROBE);
  });
});
