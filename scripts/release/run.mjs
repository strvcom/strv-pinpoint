#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { buildChangelogSection, bumpVersion, setVersionInJson } from "./lib.mjs";

const VERSION_FILES = [
  "package.json",
  "packages/core/package.json",
  "packages/claude-code/package.json",
  "packages/claude-code/.claude-plugin/plugin.json",
];
const CHANGELOG = "CHANGELOG.md";
const NOTES = "RELEASE_NOTES.md";
const TITLE = "# Changelog";

const level = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!["patch", "minor", "major"].includes(level)) {
  console.error("usage: run.mjs <patch|minor|major> [--dry-run]");
  process.exit(1);
}

const current = JSON.parse(readFileSync("package.json", "utf8")).version;
const next = bumpVersion(current, level);
const tag = `v${next}`;

let prevTag = "";
try {
  prevTag = execFileSync("git", ["describe", "--tags", "--abbrev=0", "--match", "v*"], {
    encoding: "utf8",
  }).trim();
} catch {
  prevTag = "";
}
const isFirstRelease = prevTag === "";

const subjects = isFirstRelease
  ? []
  : execFileSync("git", ["log", `${prevTag}..HEAD`, "--no-merges", "--format=%s"], {
      encoding: "utf8",
    })
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

const date = new Date().toISOString().slice(0, 10);
const section = buildChangelogSection({ version: next, date, subjects, isFirstRelease });

if (dryRun) {
  console.log(
    `current=${current} next=${next} tag=${tag} prevTag=${prevTag || "(none)"} firstRelease=${isFirstRelease}`,
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

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${next}\ntag=${tag}\n`);
}
console.log(tag);
