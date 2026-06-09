import { describe, expect, it, vi } from "vitest";
import type { Driver } from "../driver/driver.js";
import { runSetup } from "./run-setup.js";

const okDriver = (): Driver => ({
  name: "cdp",
  healthCheck: async () => ({ ok: true }),
  connect: async () => {
    throw new Error("unused");
  },
});

describe("runSetup", () => {
  it("writes config + gitignore on a healthy driver (home mode)", async () => {
    const writeConfig = vi.fn();
    const ensureGitignored = vi.fn();
    const res = await runSetup({
      cwd: "/repo",
      home: "/home/me",
      profileMode: "home",
      driver: okDriver(),
      writeConfig,
      ensureGitignored,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.profileDir).toMatch(/^\/home\/me\/\.pinpoint\/profiles\/repo-[0-9a-f]{8}$/);
      expect(writeConfig).toHaveBeenCalledWith("/repo", {
        driver: "cdp",
        profileDir: res.profileDir,
      });
    }
    expect(ensureGitignored).toHaveBeenCalledWith("/repo", ".pinpoint/");
  });

  it("repo mode still gitignores .pinpoint/ (footgun guard)", async () => {
    const ensureGitignored = vi.fn();
    const res = await runSetup({
      cwd: "/repo",
      home: "/home/me",
      profileMode: "repo",
      driver: okDriver(),
      writeConfig: vi.fn(),
      ensureGitignored,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.profileDir).toBe("/repo/.pinpoint/chrome");
    expect(ensureGitignored).toHaveBeenCalledWith("/repo", ".pinpoint/");
  });

  it("fails without writing anything when the driver is unhealthy", async () => {
    const writeConfig = vi.fn();
    const driver: Driver = {
      name: "cdp",
      healthCheck: async () => ({ ok: false, reason: "no chrome", remedy: "install it" }),
      connect: async () => {
        throw new Error("unused");
      },
    };
    const res = await runSetup({
      cwd: "/repo",
      home: "/home/me",
      profileMode: "home",
      driver,
      writeConfig,
      ensureGitignored: vi.fn(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.remedy).toBe("install it");
    expect(writeConfig).not.toHaveBeenCalled();
  });
});
