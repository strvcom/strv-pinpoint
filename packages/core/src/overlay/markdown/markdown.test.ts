import { describe, expect, it } from "vitest";
import { parseMarkdown, serializeMarkdown } from "./markdown.js";

describe("markdown round-trip (TASK-31)", () => {
  it("parses a bullet list into a bullet_list node with the items", () => {
    const doc = parseMarkdown("- a\n- b");
    expect(doc.firstChild?.type.name).toBe("bullet_list");
    expect(doc.firstChild?.childCount).toBe(2);
    expect(doc.firstChild?.child(0).textContent).toBe("a");
    expect(doc.firstChild?.child(1).textContent).toBe("b");
  });

  it("parses an ordered list into an ordered_list node", () => {
    const doc = parseMarkdown("1. x\n2. y");
    expect(doc.firstChild?.type.name).toBe("ordered_list");
    expect(doc.firstChild?.childCount).toBe(2);
    expect(doc.textContent).toBe("xy");
  });

  it("serialization is idempotent (stable markdown)", () => {
    for (const md of ["- a\n- b", "1. x\n2. y", "hello world"]) {
      const once = serializeMarkdown(parseMarkdown(md));
      const twice = serializeMarkdown(parseMarkdown(once));
      expect(twice).toBe(once);
    }
  });

  it("a heading is NOT a heading node — stays literal paragraph text", () => {
    const doc = parseMarkdown("# h");
    expect(doc.firstChild?.type.name).toBe("paragraph");
    expect(doc.textContent).toBe("# h");
    // The schema has no heading node at all.
    expect(mdSchemaHasHeading()).toBe(false);
  });

  it("a plain paragraph round-trips to the same text", () => {
    expect(serializeMarkdown(parseMarkdown("hello world")).trim()).toBe("hello world");
  });

  it("empty input yields empty output", () => {
    expect(serializeMarkdown(parseMarkdown("")).trim()).toBe("");
  });
});

import { mdSchema } from "./schema.js";

function mdSchemaHasHeading(): boolean {
  return Object.keys(mdSchema.nodes).includes("heading");
}
