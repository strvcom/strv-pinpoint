import { describe, expect, it } from "vitest";
import { CONFIG_RELPATH, readPinpointConfig, writePinpointConfig } from "./pinpoint-config.js";

describe("pinpoint-config", () => {
  it("CONFIG_RELPATH is the gitignored .pinpoint location", () => {
    expect(CONFIG_RELPATH).toBe(".pinpoint/config.json");
  });

  it("returns null when no config file exists", () => {
    expect(readPinpointConfig("/repo", { exists: () => false, readFile: () => "" })).toBeNull();
  });

  it("parses an existing config", () => {
    const cfg = readPinpointConfig("/repo", {
      exists: () => true,
      readFile: () => JSON.stringify({ driver: "cdp", profileDir: "/p", port: 7331 }),
    });
    expect(cfg).toEqual({ driver: "cdp", profileDir: "/p", port: 7331 });
  });

  it("returns null on malformed JSON instead of throwing", () => {
    expect(
      readPinpointConfig("/repo", { exists: () => true, readFile: () => "{not json" }),
    ).toBeNull();
  });

  it("writes pretty JSON to <cwd>/.pinpoint/config.json", () => {
    const writes: Array<[string, string]> = [];
    writePinpointConfig(
      "/repo",
      { driver: "cdp", profileDir: "/p" },
      { mkdir: () => {}, writeFile: (p, c) => void writes.push([p, c]) },
    );
    expect(writes[0][0]).toMatch(/\/repo\/\.pinpoint\/config\.json$/);
    expect(JSON.parse(writes[0][1])).toEqual({ driver: "cdp", profileDir: "/p" });
  });
});
