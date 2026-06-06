import { describe, expect, it } from "vitest";
import { FakePage } from "../cdp/fake-page.js";
import type { RawSelection } from "../cdp/selection-probe.js";
import { SELECTION_PROBE } from "../cdp/selection-probe.js";
import { getSelectionTool } from "./get-selection.js";

const SAMPLE_RAW: RawSelection = {
  selector: "main > p",
  tagName: "P",
  text: "Hello",
  rect: { x: 0, y: 0, width: 100, height: 20 },
  componentName: "MyComponent",
  ancestry: ["MyComponent"],
};

describe("getSelectionTool", () => {
  it("returns text content with status:selected and componentName when selected", async () => {
    const page = new FakePage({ evalResults: { [SELECTION_PROBE]: SAMPLE_RAW } });
    const result = await getSelectionTool({ page });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse((result.content[0] as { type: "text"; text: string }).text);
    expect(parsed.status).toBe("selected");
    expect(parsed.componentName).toBe("MyComponent");
  });

  it("returns text content with status:none and message matching /pick/i when nothing selected", async () => {
    const page = new FakePage({ evalResults: { [SELECTION_PROBE]: null } });
    const result = await getSelectionTool({ page });
    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse((result.content[0] as { type: "text"; text: string }).text);
    expect(parsed.status).toBe("none");
    expect(parsed.message).toMatch(/pick/i);
  });
});
