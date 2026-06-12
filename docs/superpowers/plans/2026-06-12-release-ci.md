# Release CI — manual GitHub Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A manually-triggered GitHub Action that cuts a release end-to-end — validate, build, bump versions in lockstep, regenerate a user-facing changelog, commit to `main`, tag `vX.Y.Z`, and publish a GitHub Release.

**Architecture:** A thin `.github/workflows/release.yml` orchestrates; the testable logic (semver bump, conventional-commit changelog, version-field rewrite) lives in dependency-free ESM modules under `scripts/release/` that plain `node` can run in CI. Lockstep versioning off root `package.json` `version`. Companion fix: the bundled bridge binary is un-gitignored and committed so a fresh GitHub install works.

**Tech Stack:** GitHub Actions, Node 20 (built-ins only, no new deps), pnpm, Vitest, Biome, `gh` CLI.

**Spec:** `docs/superpowers/specs/2026-06-12-release-ci-design.md`

---

## File structure

- `scripts/release/lib.mjs` — pure functions: `bumpVersion`, `parseConventional`, `buildChangelogSection`, `setVersionInJson`. No I/O, fully unit-tested.
- `scripts/release/lib.test.mjs` — colocated Vitest unit tests for `lib.mjs`.
- `scripts/release/run.mjs` — orchestration: reads bump level, computes next version, writes the four version files, runs `git log`, builds + prepends the changelog, writes `RELEASE_NOTES.md`, emits outputs. Thin glue; verified by a local `--dry-run`.
- `.github/workflows/release.yml` — the manual workflow.
- `vitest.config.ts` — extend `include` to pick up `scripts/**/*.test.mjs`.
- `biome.json` — exclude the committed binary from lint/format.
- `.gitignore` — drop the `packages/claude-code/bin/pinpoint` line.
- Version sites (baseline): `package.json` (root, add `version`), `packages/core/package.json`, `packages/claude-code/package.json`, `packages/claude-code/.claude-plugin/plugin.json`.
- `README.md`, `docs/decisions.md` — publish/install docs + decision row.

---

## Task 1: Baseline version alignment + commit the bundled binary

Establishes a single `0.0.0` baseline across all version sites and makes the binary tracked, so the workflow can author the first real version and a GitHub install works.

**Files:**
- Modify: `package.json` (root) — add `"version": "0.0.0"`
- Modify: `packages/claude-code/.claude-plugin/plugin.json` — `"0.1.0"` → `"0.0.0"`
- Modify: `.gitignore` — remove the `packages/claude-code/bin/pinpoint` line
- Modify: `biome.json` — add `"!packages/claude-code/bin"` to `files.includes`
- (`packages/core/package.json`, `packages/claude-code/package.json` are already `0.0.0` — leave as-is)

- [ ] **Step 1: Add a `version` field to root `package.json`**

Insert immediately after the `"name"` line so it reads:

```json
{
  "name": "pinpoint",
  "version": "0.0.0",
  "private": true,
```

- [ ] **Step 2: Reset plugin.json to the baseline**

In `packages/claude-code/.claude-plugin/plugin.json` change `"version": "0.1.0"` to:

```json
  "version": "0.0.0",
```

- [ ] **Step 3: Un-ignore the bundled binary**

In `.gitignore`, delete these two lines (the comment and the path):

```
# built plugin bridge bundle
packages/claude-code/bin/pinpoint
```

- [ ] **Step 4: Exclude the binary from Biome**

In `biome.json`, add `"!packages/claude-code/bin"` to the `files.includes` array (after the `dist` exclusion):

```json
  "files": {
    "includes": [
      "**",
      "!**/node_modules",
      "!**/dist",
      "!packages/claude-code/bin",
      "!.reference",
      "!.claude",
      "!examples",
      "!**/*.tsbuildinfo",
      "!packages/core/src/cdp/overlay-source.generated.ts"
    ]
  },
```

- [ ] **Step 5: Build the binary**

Run: `pnpm build`
Expected: exits 0; `packages/claude-code/bin/pinpoint` exists and is executable.

- [ ] **Step 6: Verify the gate is still green with the binary tracked**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass — Biome does not lint the bundle (proves Step 4 worked).

- [ ] **Step 7: Commit**

```bash
git add package.json packages/claude-code/.claude-plugin/plugin.json .gitignore biome.json packages/claude-code/bin/pinpoint
git commit -m "build(release): align versions to 0.0.0 baseline + commit bundled bridge (TASK-32)"
```

---

## Task 2: Release lib — `bumpVersion` (TDD)

**Files:**
- Create: `scripts/release/lib.mjs`
- Create: `scripts/release/lib.test.mjs`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Make Vitest discover `scripts/` tests**

In `vitest.config.ts`, extend `include`:

```ts
    include: [
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx",
      "scripts/**/*.test.mjs",
    ],
```

- [ ] **Step 2: Write the failing test**

Create `scripts/release/lib.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { bumpVersion } from "./lib.mjs";

describe("bumpVersion", () => {
  it("bumps patch", () => expect(bumpVersion("1.2.3", "patch")).toBe("1.2.4"));
  it("bumps minor and zeroes patch", () => expect(bumpVersion("1.2.3", "minor")).toBe("1.3.0"));
  it("bumps major and zeroes minor+patch", () => expect(bumpVersion("1.2.3", "major")).toBe("2.0.0"));
  it("first release: 0.0.0 minor -> 0.1.0", () => expect(bumpVersion("0.0.0", "minor")).toBe("0.1.0"));
  it("rejects a bad version", () => expect(() => bumpVersion("1.2", "patch")).toThrow());
  it("rejects a bad level", () => expect(() => bumpVersion("1.2.3", "huge")).toThrow());
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- scripts/release/lib.test.mjs`
Expected: FAIL — cannot resolve `./lib.mjs` / `bumpVersion is not a function`.

- [ ] **Step 4: Write minimal implementation**

Create `scripts/release/lib.mjs`:

```js
/** Bump a semver string by level. @param {string} current @param {"patch"|"minor"|"major"} level */
export function bumpVersion(current, level) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!m) throw new Error(`invalid semver: ${current}`);
  const [major, minor, patch] = m.slice(1).map(Number);
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  if (level === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`invalid bump level: ${level}`);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- scripts/release/lib.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/release/lib.mjs scripts/release/lib.test.mjs vitest.config.ts
git commit -m "feat(release): bumpVersion helper + vitest scripts/ coverage (TASK-32)"
```

---

## Task 3: Release lib — `parseConventional` + `buildChangelogSection` (TDD)

**Files:**
- Modify: `scripts/release/lib.mjs`
- Modify: `scripts/release/lib.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `scripts/release/lib.test.mjs`:

```js
import { buildChangelogSection, parseConventional } from "./lib.mjs";

describe("parseConventional", () => {
  it("parses type/scope/description", () => {
    expect(parseConventional("feat(overlay): add card")).toEqual({
      type: "feat", scope: "overlay", breaking: false, description: "add card",
    });
  });
  it("strips a trailing (TASK-N) suffix", () => {
    expect(parseConventional("fix(bridge): close stream (TASK-30)").description).toBe("close stream");
  });
  it("handles no scope and a breaking !", () => {
    expect(parseConventional("feat!: drop v1")).toEqual({
      type: "feat", scope: null, breaking: true, description: "drop v1",
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
    expect(out).not.toContain("note something"); // docs dropped
    expect(out).not.toContain("tidy"); // refactor dropped
    expect(out).not.toContain("TASK-"); // suffixes stripped
  });

  it("first release emits a single curated line, ignoring history", () => {
    const out = buildChangelogSection({ version: "0.1.0", date: "2026-06-12", subjects, isFirstRelease: true });
    expect(out).toContain("## 0.1.0 — 2026-06-12");
    expect(out).toContain("Initial public release.");
    expect(out).not.toContain("### Features");
  });

  it("notes when there are no user-facing changes", () => {
    const out = buildChangelogSection({ version: "0.2.1", date: "2026-06-12", subjects: ["docs: x", "chore: y"] });
    expect(out).toContain("_No user-facing changes._");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- scripts/release/lib.test.mjs`
Expected: FAIL — `parseConventional`/`buildChangelogSection` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `scripts/release/lib.mjs`:

```js
const TASK_SUFFIX = /\s*\(TASK-\d+\)\s*$/i;

/** Parse a conventional-commit subject; null if it doesn't match. */
export function parseConventional(subject) {
  const m = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/.exec(subject);
  if (!m) return null;
  const [, type, scope, bang, descRaw] = m;
  return {
    type: type.toLowerCase(),
    scope: scope ?? null,
    breaking: Boolean(bang),
    description: descRaw.replace(TASK_SUFFIX, "").trim(),
  };
}

const GROUPS = [
  { type: "feat", heading: "Features" },
  { type: "fix", heading: "Bug Fixes" },
  { type: "perf", heading: "Performance" },
  { type: "revert", heading: "Reverts" },
];

/** Build one CHANGELOG section (markdown, trailing newline). */
export function buildChangelogSection({ version, date, subjects = [], isFirstRelease = false }) {
  const header = `## ${version} — ${date}`;
  if (isFirstRelease) return `${header}\n\nInitial public release.\n`;

  const parsed = subjects.map(parseConventional).filter(Boolean);
  const lines = [header, ""];
  let any = false;
  for (const { type, heading } of GROUPS) {
    const entries = parsed.filter((c) => c.type === type);
    if (entries.length === 0) continue;
    any = true;
    lines.push(`### ${heading}`, "");
    for (const c of entries) lines.push(`- ${c.scope ? `**${c.scope}:** ` : ""}${c.description}`);
    lines.push("");
  }
  if (!any) lines.push("_No user-facing changes._", "");
  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- scripts/release/lib.test.mjs`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add scripts/release/lib.mjs scripts/release/lib.test.mjs
git commit -m "feat(release): conventional-commit changelog section builder (TASK-32)"
```

---

## Task 4: Release lib — `setVersionInJson` (TDD)

Rewrites only the `version` value, preserving all other formatting (no whole-file re-serialize → clean diffs).

**Files:**
- Modify: `scripts/release/lib.mjs`
- Modify: `scripts/release/lib.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `scripts/release/lib.test.mjs`:

```js
import { setVersionInJson } from "./lib.mjs";

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- scripts/release/lib.test.mjs`
Expected: FAIL — `setVersionInJson` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `scripts/release/lib.mjs`:

```js
/** Replace the top-level "version" string in JSON text, leaving all other formatting intact. */
export function setVersionInJson(jsonText, version) {
  const re = /("version"\s*:\s*")[^"]*(")/;
  if (!re.test(jsonText)) throw new Error('no "version" field found');
  return jsonText.replace(re, `$1${version}$2`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- scripts/release/lib.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/release/lib.mjs scripts/release/lib.test.mjs
git commit -m "feat(release): setVersionInJson value-only rewrite (TASK-32)"
```

---

## Task 5: Release runner orchestration

Ties the lib together with git + filesystem. Verified by a local `--dry-run`.

**Files:**
- Create: `scripts/release/run.mjs`

- [ ] **Step 1: Write the runner**

Create `scripts/release/run.mjs`:

```js
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
  console.log(`current=${current} next=${next} tag=${tag} prevTag=${prevTag || "(none)"} firstRelease=${isFirstRelease}`);
  console.log("--- RELEASE NOTES ---");
  console.log(section);
  process.exit(0);
}

for (const f of VERSION_FILES) writeFileSync(f, setVersionInJson(readFileSync(f, "utf8"), next));

const existing = existsSync(CHANGELOG) ? readFileSync(CHANGELOG, "utf8") : `${TITLE}\n`;
const body = existing.startsWith(TITLE) ? existing.slice(TITLE.length).replace(/^\n+/, "") : existing;
writeFileSync(CHANGELOG, `${TITLE}\n\n${section}${body ? `\n${body}` : ""}`);
writeFileSync(NOTES, section);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${next}\ntag=${tag}\n`);
}
console.log(tag);
```

- [ ] **Step 2: Dry-run to verify wiring (no files written)**

Run: `node scripts/release/run.mjs minor --dry-run`
Expected: prints `current=0.0.0 next=0.1.0 tag=v0.1.0 prevTag=(none) firstRelease=true` and a notes block containing `## 0.1.0 — <today>` and `Initial public release.` (first release because no tags exist yet).

- [ ] **Step 3: Confirm nothing changed**

Run: `git status --porcelain`
Expected: only the new untracked `scripts/release/run.mjs` (no modified version files, no `CHANGELOG.md`, no `RELEASE_NOTES.md`).

- [ ] **Step 4: Commit**

```bash
git add scripts/release/run.mjs
git commit -m "feat(release): release runner (bump + changelog + notes + outputs) (TASK-32)"
```

---

## Task 6: The GitHub Actions workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  workflow_dispatch:
    inputs:
      bump:
        description: Semver level to bump
        required: true
        type: choice
        options: [patch, minor, major]
        default: patch

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Validate
        run: pnpm typecheck && pnpm lint && pnpm test

      - name: Build
        run: pnpm build

      - name: Bump version + changelog
        id: release
        run: node scripts/release/run.mjs "${{ inputs.bump }}"

      - name: Commit, tag, push
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add package.json \
            packages/core/package.json \
            packages/claude-code/package.json \
            packages/claude-code/.claude-plugin/plugin.json \
            packages/claude-code/bin/pinpoint \
            CHANGELOG.md
          git commit -m "chore(release): ${{ steps.release.outputs.tag }}"
          git tag -a "${{ steps.release.outputs.tag }}" -m "${{ steps.release.outputs.tag }}"
          git push origin HEAD:main --follow-tags

      - name: GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
        run: >
          gh release create "${{ steps.release.outputs.tag }}"
          --title "${{ steps.release.outputs.tag }}"
          --notes-file RELEASE_NOTES.md
```

- [ ] **Step 2: Validate the YAML parses**

Run: `node -e "const fs=require('node:fs');const m=fs.readFileSync('.github/workflows/release.yml','utf8');if(!/workflow_dispatch/.test(m)||!/contents: write/.test(m))throw new Error('missing key fields');console.log('ok')"`
Expected: prints `ok`. (If `actionlint` is installed, also run `actionlint .github/workflows/release.yml` and expect no errors.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): manual workflow_dispatch Release workflow (TASK-32)"
```

---

## Task 7: Publish docs + decision log + full gate

**Files:**
- Modify: `README.md` (the "Install as a Claude Code plugin" section)
- Modify: `docs/decisions.md`

- [ ] **Step 1: Update the README install instructions**

In `README.md`, in the plugin-install section, add the public-marketplace path (the repo is now at `git@github.com:strvcom/strv-pinpoint.git`). Add this as the first, recommended option:

```markdown
- **From GitHub (recommended for users):**
  ```
  /plugin marketplace add strvcom/strv-pinpoint
  /plugin install pinpoint@pinpoint
  ```
  Then `/pinpoint:setup` (once) and `/pinpoint:start`. Updates: `/plugin marketplace update` + `/reload-plugins`.
```

Also mention `/pinpoint:setup` exists (the section currently omits it).

- [ ] **Step 2: Record the decision**

Append a row to `docs/decisions.md` (match the file's existing format):

```markdown
| 2026-06-12 | Release = manual GitHub Action (workflow_dispatch). Lockstep versions off root package.json; changelog keeps only feat/fix/perf/revert (TASK-N stripped); first release is a single "Initial release" entry. Bundled `bin/pinpoint` is now committed (Claude Code runs no build on install). No npm publish — distribution is the GitHub plugin marketplace. | TASK-32 |
```

(If `docs/decisions.md` uses a different column layout, follow that layout — date, decision, ref.)

- [ ] **Step 3: Run the full validation gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all green; `packages/claude-code/bin/pinpoint` present.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/decisions.md
git commit -m "docs(release): publish/install instructions + decision row (TASK-32)"
```

---

## Amendment (post-review): auto-derive the bump from commits

After the tasks above landed, the design changed: the version bump is **auto-derived from
conventional commits** rather than picked from a dropdown (the trigger stays manual). Delta on top
of the tasks above:

- **`scripts/release/lib.mjs`** — added `deriveBump(subjects)` (TDD, tests in `lib.test.mjs`):
  breaking→`major`, any `feat`→`minor`, any `fix`/`perf`/`revert`→`patch`, else `null`.
- **`scripts/release/run.mjs`** — first arg is now `auto` (default) | `patch` | `minor` | `major`:
  `auto` derives via `deriveBump` over the commit range (all history on first release); an explicit
  level overrides. A first release defaults to `minor` if derivation is `null`. When the level is
  `null` (nothing releasable, not a first release) the runner prints a skip message, emits
  `released=false`, and exits 0. On a real release it emits `released=true`/`version`/`tag`.
- **`.github/workflows/release.yml`** — `bump` input options are `[auto, patch, minor, major]`
  (default `auto`); the *Commit, tag, push* and *GitHub Release* steps are gated on
  `if: steps.release.outputs.released == 'true'`.

## Out of scope (per spec)

- `npm publish` / registry distribution.
- Independent per-package versioning + per-package changelogs.
- Auto-trigger on push/merge (manual dispatch only).
- PR-validation CI (typecheck/lint/test on PRs) — possible future stream.
- Updating CLAUDE.md's "no remote / local merge" note — the remote/FYI-PR convention is captured in agent memory; revisiting that doc is a separate concern.

## Post-merge (outside this plan, requires the repo on GitHub)

1. Merge `task-32--release-ci` → `main` via an FYI PR; confirm commits land on `main`.
2. From the GitHub Actions tab, run **Release** with `bump: auto` → derives `minor` from the commit history → produces `v0.1.0`, the first tag + Release, and a fresh `bin/pinpoint`.
3. Verify `/plugin marketplace add strvcom/strv-pinpoint` + `/plugin install pinpoint@pinpoint` works from another project.
4. Flip TASK-32 → Done (on `main`, committed) once merged.
