#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { buildChangelogSection, bumpVersion, deriveBump, setVersionInJson } from "./lib.mjs";

const VERSION_FILES = [
  "package.json",
  "packages/core/package.json",
  "packages/claude-code/package.json",
  "packages/claude-code/.claude-plugin/plugin.json",
];
const CHANGELOG = "CHANGELOG.md";
const NOTES = "RELEASE_NOTES.md";
const TITLE = "# Changelog";

// Optional first positional arg: "auto" (or omitted) derives the bump from commits;
// "patch"/"minor"/"major" forces that level.
const dryRun = process.argv.includes("--dry-run");
const override = process.argv.slice(2).find((a) => a !== "--dry-run") ?? "auto";
if (!["auto", "patch", "minor", "major"].includes(override)) {
  console.error("usage: run.mjs [auto|patch|minor|major] [--dry-run]");
  process.exit(1);
}

const out = (line) => {
  if (!dryRun && process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, line);
};

const current = JSON.parse(readFileSync("package.json", "utf8")).version;

let prevTag = "";
try {
  prevTag = execFileSync("git", ["describe", "--tags", "--abbrev=0", "--match", "v*"], {
    encoding: "utf8",
  }).trim();
} catch {
  prevTag = "";
}
const isFirstRelease = prevTag === "";

const range = isFirstRelease ? [] : [`${prevTag}..HEAD`];
const subjects = execFileSync("git", ["log", ...range, "--no-merges", "--format=%s"], {
  encoding: "utf8",
})
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

const derived = deriveBump(subjects);
// Override wins; otherwise the derived level. A first release always ships, defaulting to minor.
let level = override === "auto" ? derived : override;
if (isFirstRelease && level === null) level = "minor";

if (level === null) {
  console.log(`No releasable commits since ${prevTag || "start"} — skipping release.`);
  out("released=false\n");
  process.exit(0);
}

const next = bumpVersion(current, level);
const tag = `v${next}`;
const date = new Date().toISOString().slice(0, 10);
const section = buildChangelogSection({ version: next, date, subjects, isFirstRelease });

if (dryRun) {
  console.log(
    `override=${override} derived=${derived ?? "(none)"} level=${level} current=${current} next=${next} tag=${tag} prevTag=${prevTag || "(none)"} firstRelease=${isFirstRelease}`,
  );
  console.log("--- RELEASE NOTES ---");
  console.log(section);
  process.exit(0);
}

for (const f of VERSION_FILES) writeFileSync(f, setVersionInJson(readFileSync(f, "utf8"), next));

const existing = existsSync(CHANGELOG) ? readFileSync(CHANGELOG, "utf8") : `${TITLE}\n`;
const body = existing.startsWith(TITLE)
  ? existing.slice(TITLE.length).replace(/^\n+/, "")
  : existing;
writeFileSync(CHANGELOG, `${TITLE}\n\n${section}${body ? `\n${body}` : ""}`);
writeFileSync(NOTES, section);

out(`released=true\nversion=${next}\ntag=${tag}\n`);
console.log(tag);
