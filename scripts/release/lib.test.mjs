import { describe, expect, it } from "vitest";
import { bumpVersion } from "./lib.mjs";

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
