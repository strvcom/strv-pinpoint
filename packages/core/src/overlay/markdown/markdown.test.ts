import { describe, expect, it } from "vitest";
import { roundTripMarkdown } from "./markdown.js";

const round = (md: string) => roundTripMarkdown(md).trim();

describe("markdown round-trip (TASK-31, Lexical)", () => {
  it("preserves a bullet list", () => {
    expect(round("- a\n- b")).toBe("- a\n- b");
  });

  it("preserves an ordered list", () => {
    expect(round("1. x\n2. y")).toBe("1. x\n2. y");
  });

  it("preserves bold, italic, strikethrough, inline code", () => {
    expect(round("**b**")).toBe("**b**");
    expect(round("*i*")).toBe("*i*");
    expect(round("~~s~~")).toBe("~~s~~");
    expect(round("`c`")).toBe("`c`");
  });

  it("preserves a fenced code block", () => {
    expect(round("```\nconst x = 1;\n```")).toBe("```\nconst x = 1;\n```");
  });

  it("degrades a heading to literal text (no heading node)", () => {
    expect(round("# h")).toBe("# h");
  });

  it("round-trip is idempotent", () => {
    for (const md of ["- a\n- b", "1. x", "**b** and *i*", "`c`", "plain text"]) {
      const once = roundTripMarkdown(md);
      expect(roundTripMarkdown(once)).toBe(once);
    }
  });

  it("empty input yields empty output", () => {
    expect(round("")).toBe("");
  });
});
