import { describe, expect, it } from "vitest";
import { buildChangelogSection, bumpVersion, parseConventional, setVersionInJson } from "./lib.mjs";

describe("bumpVersion", () => {
  it("bumps patch", () => expect(bumpVersion("1.2.3", "patch")).toBe("1.2.4"));
  it("bumps minor and zeroes patch", () => expect(bumpVersion("1.2.3", "minor")).toBe("1.3.0"));
  it("bumps major and zeroes minor+patch", () =>
    expect(bumpVersion("1.2.3", "major")).toBe("2.0.0"));
  it("first release: 0.0.0 minor -> 0.1.0", () =>
    expect(bumpVersion("0.0.0", "minor")).toBe("0.1.0"));
  it("rejects a bad version", () => expect(() => bumpVersion("1.2", "patch")).toThrow());
  it("rejects a bad level", () => expect(() => bumpVersion("1.2.3", "huge")).toThrow());
});

describe("parseConventional", () => {
  it("parses type/scope/description", () => {
    expect(parseConventional("feat(overlay): add card")).toEqual({
      type: "feat",
      scope: "overlay",
      breaking: false,
      description: "add card",
    });
  });
  it("strips a trailing (TASK-N) suffix", () => {
    expect(parseConventional("fix(bridge): close stream (TASK-30)").description).toBe(
      "close stream",
    );
  });
  it("handles no scope and a breaking !", () => {
    expect(parseConventional("feat!: drop v1")).toEqual({
      type: "feat",
      scope: null,
      breaking: true,
      description: "drop v1",
    });
  });
  it("returns null for non-conventional subjects", () => {
    expect(parseConventional("Merge TASK-31: whatever")).toBeNull();
  });
});

describe("buildChangelogSection", () => {
  const subjects = [
    "feat(overlay): add card (TASK-1)",
    "fix(bridge): close stream (TASK-2)",
    "docs(decisions): note something",
    "chore(board): TASK-3 Done",
    "perf(core): faster grep",
    "refactor(overlay): tidy",
  ];

  it("keeps only feat/fix/perf/revert, grouped, suffix-stripped", () => {
    const out = buildChangelogSection({ version: "0.2.0", date: "2026-06-12", subjects });
    expect(out).toContain("## 0.2.0 — 2026-06-12");
    expect(out).toContain("### Features");
    expect(out).toContain("- **overlay:** add card");
    expect(out).toContain("### Bug Fixes");
    expect(out).toContain("- **bridge:** close stream");
    expect(out).toContain("### Performance");
    expect(out).not.toContain("note something");
    expect(out).not.toContain("tidy");
    expect(out).not.toContain("TASK-");
  });

  it("first release emits a single curated line, ignoring history", () => {
    const out = buildChangelogSection({
      version: "0.1.0",
      date: "2026-06-12",
      subjects,
      isFirstRelease: true,
    });
    expect(out).toContain("## 0.1.0 — 2026-06-12");
    expect(out).toContain("Initial public release.");
    expect(out).not.toContain("### Features");
  });

  it("notes when there are no user-facing changes", () => {
    const out = buildChangelogSection({
      version: "0.2.1",
      date: "2026-06-12",
      subjects: ["docs: x", "chore: y"],
    });
    expect(out).toContain("_No user-facing changes._");
  });
});

describe("setVersionInJson", () => {
  it("replaces the version value, preserving surrounding text", () => {
    const src = '{\n  "name": "x",\n  "version": "0.0.0",\n  "private": true\n}\n';
    const out = setVersionInJson(src, "1.2.3");
    expect(out).toBe('{\n  "name": "x",\n  "version": "1.2.3",\n  "private": true\n}\n');
  });
  it("throws if there is no version field", () => {
    expect(() => setVersionInJson('{"name":"x"}', "1.0.0")).toThrow();
  });
});
