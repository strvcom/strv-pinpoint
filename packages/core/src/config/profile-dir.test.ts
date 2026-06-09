import { describe, expect, it, vi } from "vitest";
import { ensureGitignored, projectSlug, resolveProfileDir } from "./profile-dir.js";

describe("projectSlug", () => {
  it("is deterministic and includes the basename", () => {
    const a = projectSlug("/home/me/my-app");
    expect(a).toMatch(/^my-app-[0-9a-f]{8}$/);
    expect(projectSlug("/home/me/my-app")).toBe(a);
    expect(projectSlug("/elsewhere/my-app")).not.toBe(a);
  });
});

describe("resolveProfileDir", () => {
  it("home mode → ~/.pinpoint/profiles/<slug>", () => {
    const p = resolveProfileDir({ cwd: "/home/me/my-app", mode: "home", home: "/home/me" });
    expect(p).toBe(`/home/me/.pinpoint/profiles/${projectSlug("/home/me/my-app")}`);
  });
  it("repo mode → <cwd>/.pinpoint/chrome", () => {
    expect(resolveProfileDir({ cwd: "/home/me/my-app", mode: "repo", home: "/home/me" })).toBe(
      "/home/me/my-app/.pinpoint/chrome",
    );
  });
});

describe("ensureGitignored", () => {
  it("appends the entry when absent", () => {
    let written = "";
    ensureGitignored("/repo", ".pinpoint/", {
      readFile: () => "node_modules\n",
      writeFile: (_p, c) => {
        written = c;
      },
      exists: () => true,
    });
    expect(written).toContain("node_modules");
    expect(written).toContain(".pinpoint/");
  });
  it("is a no-op when already present", () => {
    const writeFile = vi.fn();
    ensureGitignored("/repo", ".pinpoint/", {
      readFile: () => "node_modules\n.pinpoint/\n",
      writeFile,
      exists: () => true,
    });
    expect(writeFile).not.toHaveBeenCalled();
  });
  it("creates .gitignore when missing", () => {
    let written = "";
    ensureGitignored("/repo", ".pinpoint/", {
      readFile: () => "",
      writeFile: (_p, c) => {
        written = c;
      },
      exists: () => false,
    });
    expect(written).toContain(".pinpoint/");
  });
});
