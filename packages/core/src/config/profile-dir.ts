import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

export type ProfileMode = "home" | "repo";

/** Stable, collision-resistant per-project id: "<basename>-<8 hex of sha1(cwd)>". */
export function projectSlug(cwd: string): string {
  const hash = createHash("sha1").update(cwd).digest("hex").slice(0, 8);
  return `${basename(cwd)}-${hash}`;
}

export function resolveProfileDir(opts: { cwd: string; mode: ProfileMode; home: string }): string {
  return opts.mode === "repo"
    ? join(opts.cwd, ".pinpoint", "chrome")
    : join(opts.home, ".pinpoint", "profiles", projectSlug(opts.cwd));
}

export interface GitignoreDeps {
  readFile?: (path: string) => string;
  writeFile?: (path: string, content: string) => void;
  exists?: (path: string) => boolean;
}

/** Add `entry` to <cwd>/.gitignore if not already present (creating the file if needed). */
export function ensureGitignored(cwd: string, entry: string, deps: GitignoreDeps = {}): void {
  const path = join(cwd, ".gitignore");
  const exists = deps.exists ?? existsSync;
  const readFile = deps.readFile ?? ((p: string) => readFileSync(p, "utf8"));
  const writeFile = deps.writeFile ?? ((p: string, c: string) => writeFileSync(p, c));

  const current = exists(path) ? readFile(path) : "";
  const lines = current.split("\n").map((l) => l.trim());
  if (lines.includes(entry)) return;
  const next =
    current.length && !current.endsWith("\n") ? `${current}\n${entry}\n` : `${current}${entry}\n`;
  writeFile(path, next);
}
