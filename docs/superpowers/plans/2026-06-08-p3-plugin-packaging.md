# P3 — Plugin packaging + local test harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship frontman-flow as a self-contained Claude Code plugin — a kickoff command + the paste skill + a single bundled JS bridge in `bin/` — plus a repo-local marketplace and an `examples/vite-react/.claude/` harness, so `claude --plugin-dir ./plugin` (anywhere) or `cd examples/vite-react && claude` runs the whole loop.

**Architecture:** A plugin at `plugin/` bundles `.claude-plugin/plugin.json`, a `commands/start.md` kickoff, `skills/frontman-flow-paste/`, and `bin/frontman-flow` (the bridge bundled to one dependency-free `.mjs` via esbuild, on the Bash `PATH` while the plugin is active). The bridge talks raw CDP and launches Chrome (P2). Local dev/test uses `--plugin-dir`; the in-repo harness uses a local marketplace registered in project `.claude/settings.json`.

**Tech Stack:** TypeScript ESM, Node 22, esbuild (build-time only), Vitest, Biome. Claude Code plugin format (`.claude-plugin/plugin.json`, `commands/`, `skills/`, `bin/`).

**Scope note:** Phase P3 of `docs/superpowers/specs/2026-06-08-plugin-clipboard-cdp-design.md`. P1 (clipboard-only) + P2 (raw CDP) are merged. The **rename** (frontman-flow → new name) remains a separate task (TASK-11) — this plan keeps the `frontman-flow` name throughout.

**Verification limit:** Whether Claude actually loads the plugin and the command triggers correctly is an **interactive** check only the user can fully run (no nested `claude` session here). This plan verifies everything mechanically — valid JSON, the bundle builds, the bundled bridge smoke-launches Chrome + injects + writes the clipboard (same harness as P2's live test), `bin` is executable — and hands off exact manual steps.

---

## File Structure

**Pre-req fix (true zero-deps):**
- `packages/core/src/clipboard/write.ts` — replace `clipboardy` with a `child_process` shell-out (`+ write.test.ts`).
- root `package.json` — remove the `clipboardy` dependency.

**Plugin (new, under `plugin/`):**
- `plugin/.claude-plugin/plugin.json` — manifest (`name: "frontman-flow"`).
- `plugin/commands/start.md` — `/frontman-flow:start` kickoff: launch the bridge, guide the loop.
- `plugin/skills/frontman-flow-paste/SKILL.md` — the paste/apply skill (moved from `.claude/skills/`).
- `plugin/bin/frontman-flow` — the bundled, executable bridge (esbuild output; git-ignored, built on demand). A committed `plugin/bin/.gitkeep` keeps the dir.
- `plugin/README.md` — what the plugin is + the install/dev loop.

**Local marketplace (new):**
- `.claude-plugin/marketplace.json` (repo root) — lists the `frontman-flow` plugin at `./plugin`.

**In-repo harness (new):**
- `examples/vite-react/.claude/settings.json` — registers the local marketplace + enables the plugin + allows Bash.

**Build wiring:**
- root `package.json` — add `esbuild` devDep + a `build:plugin` script; have `build` also build the plugin bundle.
- `.gitignore` — ignore `plugin/bin/frontman-flow` (built artifact).

**Retired:**
- `.claude/skills/frontman-flow/` — the obsolete MCP-driving skill (its guidance is superseded by the paste skill).
- `.claude/skills/frontman-flow-paste/` — moved into the plugin (the repo dogfoods the plugin via root `.claude/settings.json`).

**Modified:** `README.md`, `CLAUDE.md`, `docs/decisions.md`, root `.claude/settings.json` (dogfood the plugin).

---

## Task 1: Replace `clipboardy` with a built-in clipboard shell-out (true zero-deps)

**Files:** Modify `packages/core/src/clipboard/write.ts`; create `write.test.ts`; modify root `package.json`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/clipboard/write.test.ts
import { describe, expect, it, vi } from "vitest";
import { clipboardCommand, writeWith } from "./write.js";

describe("clipboardCommand", () => {
  it("uses pbcopy on macOS", () => {
    expect(clipboardCommand("darwin")).toEqual({ cmd: "pbcopy", args: [] });
  });
  it("uses clip on Windows", () => {
    expect(clipboardCommand("win32").cmd).toBe("clip");
  });
  it("uses an X11 tool on Linux", () => {
    expect(["xclip", "xsel"]).toContain(clipboardCommand("linux").cmd);
  });
});

describe("writeWith", () => {
  it("spawns the platform command and writes text to stdin", async () => {
    const writes: string[] = [];
    let ended = false;
    const fakeSpawn = vi.fn(() => ({
      stdin: { write: (s: string) => writes.push(s), end: () => { ended = true; } },
      on: (ev: string, cb: (code: number) => void) => { if (ev === "close") cb(0); },
    }));
    await writeWith("hello", "darwin", fakeSpawn as never);
    expect(fakeSpawn).toHaveBeenCalledWith("pbcopy", []);
    expect(writes.join("")).toBe("hello");
    expect(ended).toBe(true);
  });

  it("rejects on a non-zero exit", async () => {
    const fakeSpawn = vi.fn(() => ({
      stdin: { write: () => {}, end: () => {} },
      on: (ev: string, cb: (code: number) => void) => { if (ev === "close") cb(1); },
    }));
    await expect(writeWith("x", "linux", fakeSpawn as never)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** Run: `pnpm test 2>&1 | grep -A3 -E "clipboardCommand|writeWith"`

- [ ] **Step 3: Implement `write.ts`**

```typescript
import { type ChildProcess, spawn } from "node:child_process";

export type ClipboardWriter = (text: string) => Promise<void>;
type SpawnLike = (cmd: string, args: string[]) => ChildProcess;

/** The OS clipboard-write command for a given platform. */
export function clipboardCommand(platform: NodeJS.Platform): { cmd: string; args: string[] } {
  if (platform === "darwin") return { cmd: "pbcopy", args: [] };
  if (platform === "win32") return { cmd: "clip", args: [] };
  // Linux/other: prefer xclip, fall back to xsel.
  return { cmd: "xclip", args: ["-selection", "clipboard"] };
}

export function writeWith(
  text: string,
  platform: NodeJS.Platform,
  spawnImpl: SpawnLike = spawn,
): Promise<void> {
  const { cmd, args } = clipboardCommand(platform);
  return new Promise((resolve, reject) => {
    const child = spawnImpl(cmd, args);
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`)),
    );
    child.stdin?.write(text);
    child.stdin?.end();
  });
}

export const systemClipboard: ClipboardWriter = (text) => writeWith(text, process.platform);
```

- [ ] **Step 4: Run — expect PASS.** Run: `pnpm test`

- [ ] **Step 5: Remove the `clipboardy` dependency**

In the root `package.json`, delete the `dependencies` block entirely (it held only `clipboardy`):

```json
  "dependencies": {
    "clipboardy": "^5.3.1"
  }
```
→ remove it. Then run: `pnpm install`

- [ ] **Step 6: Confirm zero deps + gates**

Run: `grep -rn "clipboardy" packages/core/src package.json` → expect no matches.
Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` → expect PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/clipboard/write.ts packages/core/src/clipboard/write.test.ts package.json pnpm-lock.yaml
git commit -m "fix(core): clipboard via child_process shell-out, drop clipboardy (P3 pre-req)"
```

---

## Task 2: Bundle the bridge to a single dependency-free executable

**Files:** Modify root `package.json` (esbuild devDep + scripts); create `plugin/bin/.gitkeep`; modify `.gitignore`.

- [ ] **Step 1: Add esbuild + build scripts**

Run: `pnpm add -D -w esbuild`

In root `package.json` `scripts`, add:

```json
    "build:plugin": "esbuild packages/core/src/cli.ts --bundle --platform=node --format=esm --target=node20 --outfile=plugin/bin/frontman-flow && chmod +x plugin/bin/frontman-flow",
```

and chain it into `build`:

```json
    "build": "pnpm -r build && pnpm build:plugin",
```

- [ ] **Step 2: Keep the bin dir tracked, ignore the artifact**

Run: `mkdir -p plugin/bin && touch plugin/bin/.gitkeep`
Append to `.gitignore`:

```
# built plugin bridge bundle
plugin/bin/frontman-flow
```

- [ ] **Step 3: Build the bundle**

Run: `pnpm build:plugin`
Expected: `plugin/bin/frontman-flow` created, executable.

- [ ] **Step 4: Smoke-run the bundle (no app needed — expect a clean connect error)**

Run: `FF_APP_URL=http://localhost:1 FF_CDP_URL=http://localhost:1 node plugin/bin/frontman-flow; echo "exit: $?"`
Expected: it runs (no module-resolution crash), then exits non-zero with the "Could not connect to Chrome" message — proving the bundle is self-contained (no missing deps).

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml .gitignore plugin/bin/.gitkeep
git commit -m "build: bundle the bridge to plugin/bin/frontman-flow via esbuild (P3)"
```

---

## Task 3: Plugin manifest, command, and paste skill

**Files:** Create `plugin/.claude-plugin/plugin.json`, `plugin/commands/start.md`, `plugin/skills/frontman-flow-paste/SKILL.md`, `plugin/README.md`.

- [ ] **Step 1: Manifest** — `plugin/.claude-plugin/plugin.json`

```json
{
  "name": "frontman-flow",
  "description": "Click an element in your running dev app, comment, Send, and paste into Claude — it edits the source. CDP-only, zero-dep bridge; no MCP server.",
  "version": "0.1.0",
  "author": { "name": "frontman-flow" }
}
```

- [ ] **Step 2: Kickoff command** — `plugin/commands/start.md`

```markdown
---
description: Start the frontman-flow bridge and run the click-to-fix loop against your running dev app.
---

# Start frontman-flow

Bring up the overlay loop so the user can click elements in their dev app and have you edit the source.

## Steps

1. **Confirm the dev app URL.** Ask the user for their dev server URL if you don't know it (default `http://localhost:5173`). It must already be running.
2. **Launch the bridge in the background.** The plugin ships a `frontman-flow` executable on your PATH; it talks raw CDP and launches Chrome itself (or attaches to a debug Chrome already on `:9222`). Run it backgrounded, pointed at the app:
   ```bash
   FF_APP_URL=<app-url> frontman-flow &
   ```
   Override the browser with `FF_CHROME_PATH` and its profile with `FF_CHROME_PROFILE` if needed. The overlay HTTP server listens on `:7331` (`FF_PORT`).
3. **Tell the user the loop:** in the Chrome window the bridge opened, use the overlay toolbar — **Pick** an element (or **Screenshot** a region), type a comment on each card, then click **Send**. The bridge copies a `frontman-flow` JSON to their clipboard.
4. **Wait for the paste.** When the user pastes that JSON back into the chat, the `frontman-flow-paste` skill takes over and applies each comment to its component.

## Notes
- If `frontman-flow` isn't found on PATH, the plugin bundle wasn't built — run `pnpm build:plugin` in the frontman-flow repo (or `pnpm build`).
- Don't guess edits before the user has picked + sent; wait for the pasted JSON.
```

- [ ] **Step 3: Move the paste skill into the plugin**

Run: `mkdir -p plugin/skills/frontman-flow-paste && git mv .claude/skills/frontman-flow-paste/SKILL.md plugin/skills/frontman-flow-paste/SKILL.md`

(The skill content is already correct for the clipboard flow — no edits needed. Verify it still reads sensibly after the move.)

- [ ] **Step 4: Plugin README** — `plugin/README.md`

```markdown
# frontman-flow (Claude Code plugin)

Click an element in your running dev app, comment, **Send**, and paste into Claude — it edits the source. CDP-only, zero-dependency bridge; no MCP server.

## Use it
- `/frontman-flow:start` — launches the bridge (which opens Chrome + injects the overlay) and walks you through the loop.
- Pick / Screenshot → comment → **Send** → paste the copied JSON into chat. The `frontman-flow-paste` skill applies it.

## Install / develop
- **Quick dev (live edits):** from anywhere, `claude --plugin-dir /path/to/frontman-flow/plugin`, then `/reload-plugins` after edits.
- **In a project:** register the repo's local marketplace in that project's `.claude/settings.json` (`extraKnownMarketplaces` + `enabledPlugins`), or `/plugin marketplace add /path/to/frontman-flow` then `/plugin install frontman-flow@frontman-flow`.

The bridge binary (`bin/frontman-flow`) is built from `@frontman-flow/core` — run `pnpm build:plugin` in the repo first.
```

- [ ] **Step 5: Commit**

```bash
git add plugin/.claude-plugin plugin/commands plugin/skills plugin/README.md
git rm -r .claude/skills/frontman-flow-paste
git commit -m "feat(plugin): manifest + /frontman-flow:start command + paste skill (P3)"
```

---

## Task 4: Retire the obsolete MCP-driving skill

**Files:** Delete `.claude/skills/frontman-flow/`.

- [ ] **Step 1: Delete it**

Run: `git rm -r .claude/skills/frontman-flow`

(Its single-pick/batch guidance drove `mcp__frontman-flow__*` tools removed in P1; the clipboard/paste flow + the new `start` command replace it.)

- [ ] **Step 2: Commit**

```bash
git commit -m "chore: retire obsolete MCP-driving frontman-flow skill (P3)"
```

---

## Task 5: Local marketplace + in-repo harness + dogfood

**Files:** Create `.claude-plugin/marketplace.json`, `examples/vite-react/.claude/settings.json`; modify root `.claude/settings.json`.

- [ ] **Step 1: Local marketplace** — `.claude-plugin/marketplace.json` (repo root)

```json
{
  "name": "frontman-flow",
  "owner": { "name": "frontman-flow" },
  "plugins": [
    {
      "name": "frontman-flow",
      "source": "./plugin",
      "description": "frontman-flow click-to-fix overlay bridge"
    }
  ]
}
```

- [ ] **Step 2: In-repo harness** — `examples/vite-react/.claude/settings.json`

The relative marketplace path resolves from this project root (`examples/vite-react/`), so `../../` is the repo root containing `.claude-plugin/marketplace.json`.

```json
{
  "extraKnownMarketplaces": {
    "frontman-flow": {
      "source": { "source": "local", "path": "../../" }
    }
  },
  "enabledPlugins": {
    "frontman-flow@frontman-flow": true
  },
  "permissions": {
    "allow": ["Bash"]
  }
}
```

- [ ] **Step 3: Dogfood in the repo root** — add to root `.claude/settings.json`

Merge these keys into the existing root `.claude/settings.json` (so this repo's own sessions load the plugin it ships):

```json
  "extraKnownMarketplaces": {
    "frontman-flow": { "source": { "source": "local", "path": "." } }
  },
  "enabledPlugins": {
    "frontman-flow@frontman-flow": true
  }
```

(Read the file first; preserve all existing keys/hooks — add only these two.)

- [ ] **Step 4: Validate all plugin JSON parses**

Run:
```bash
for f in .claude-plugin/marketplace.json plugin/.claude-plugin/plugin.json examples/vite-react/.claude/settings.json .claude/settings.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8')); console.log('ok: $f')"; done
```
Expected: `ok:` for each.

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin examples/vite-react/.claude/settings.json .claude/settings.json
git commit -m "feat(plugin): local marketplace + vite-react harness + repo dogfood (P3)"
```

---

## Task 6: Live smoke of the bundled bridge + docs + handoff

**Files:** Modify `README.md`, `CLAUDE.md`, `docs/decisions.md`.

- [ ] **Step 1: Live smoke — the BUNDLED bin drives the loop**

Reuse the P2 live harness but through `plugin/bin/frontman-flow` (proves the bundle, not just the source). With the Vite app on 5180 and a headless Chrome on 9222 at the app URL:

```bash
pnpm build:plugin
pnpm --dir examples/vite-react exec vite --port 5180 --strictPort &   # wait until ready
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9222 --user-data-dir=/tmp/ff-it http://localhost:5180 &  # wait until /json/version answers
FF_APP_URL=http://localhost:5180 FF_PORT=7333 node plugin/bin/frontman-flow &
# drive a Send via the overlay link (or reuse the integration loop). Then verify a frontman-flow
# JSON reached the clipboard (pbpaste) and a PNG was written under .frontman-flow/.
```
Expected: the bundled bridge injects the overlay and serves `:7333`; a Send produces clipboard JSON + a saved PNG. Kill the background processes after. (If headless Chrome can't launch in your environment, note it — the unit + P2 integration suites already cover the logic.)

- [ ] **Step 2: README — document the plugin + dev loop**

Add a "## Install as a Claude Code plugin" section: the `--plugin-dir ./plugin` dev loop (live edits via `/reload-plugins`); `/plugin marketplace add <repo>` + `/plugin install frontman-flow@frontman-flow` for other projects; and the `examples/vite-react` harness (`cd examples/vite-react && claude` → `/frontman-flow:start`). Note `pnpm build:plugin` builds the bundled bridge.

- [ ] **Step 3: CLAUDE.md — note the plugin packaging**

In "What this project is", add one sentence: the tool ships as a Claude Code plugin (`plugin/`) — a `/frontman-flow:start` command + the paste skill + a bundled zero-dep bridge in `bin/`; local dev via `claude --plugin-dir ./plugin`.

- [ ] **Step 4: Decisions rows**

Append to `docs/decisions.md`:

```
| 2026-06-08 | Packaging | Ship as a **Claude Code plugin** (`plugin/`): `/frontman-flow:start` command + `frontman-flow-paste` skill + the bridge bundled (esbuild) to an executable `bin/frontman-flow` on the plugin PATH. Local marketplace (`.claude-plugin/marketplace.json`) + `examples/vite-react/.claude/settings.json` harness; the repo dogfoods its own plugin. Dev loop: `claude --plugin-dir ./plugin` (live, reference not copy). | `${CLAUDE_PLUGIN_ROOT}` does NOT resolve in SKILL/command markdown, so the bridge ships in `bin/` (auto-added to PATH) instead of a path reference. Marketplace installs are cached copies; `--plugin-dir` gives live edits for development. |
| 2026-06-08 | Correction | Replaced **`clipboardy`** with a `child_process` shell-out (`pbcopy`/`clip`/`xclip`). The earlier P2 "zero runtime deps" was inaccurate — `clipboard/write.ts` imported `clipboardy`, satisfied only via the root workspace's hoisted copy (so `@frontman-flow/core` would crash standalone). Now genuinely zero-dep, which also makes the esbuild bundle self-contained. | Honest dependency accounting + a clean, dependency-free plugin bundle. |
```

- [ ] **Step 5: Full gate + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git add README.md CLAUDE.md docs/decisions.md
git commit -m "docs: Claude Code plugin packaging + dev loop; clipboardy correction (P3)"
```

- [ ] **Step 6: Manual acceptance (hand off to the user)**

Document these for the user to run (cannot be done from this session — needs an interactive `claude`):
1. `pnpm build:plugin`
2. Start the Vite app: `pnpm --dir examples/vite-react exec vite --port 5173`
3. `cd examples/vite-react && claude` → trust the folder → `/frontman-flow:start` → follow the loop (Pick → comment → Send → paste).
   - Or, from anywhere: `claude --plugin-dir /path/to/frontman-flow/plugin` then `/frontman-flow:start`.

---

## Self-Review

**Spec coverage (P3):** plugin packaging (command + skills + bundled JS) → Tasks 2–4 ✓; local marketplace + `examples/vite-react/.claude/` harness (acceptance #3/#4) → Task 5 ✓; one-command kickoff → Task 3 (`/frontman-flow:start`) ✓; zero-dep bundle (acceptance #1) → Tasks 1–2 ✓; dev/test loop (`--plugin-dir`) → Tasks 3,6 ✓.

**Placeholder scan:** Tasks 5 Step 3 and 6 Step 2 describe edits to read-then-modify existing files (root `.claude/settings.json`, `README.md`) rather than quoting them whole — acceptable for merge-into-existing config/docs; the executor reads first. All new files have full content.

**Type/name consistency:** plugin name `frontman-flow` is the namespace for `/frontman-flow:start` and the marketplace ref `frontman-flow@frontman-flow`. The bin is named `frontman-flow` (matches the command's `frontman-flow &` instruction and core's existing `bin` name). `clipboardCommand`/`writeWith`/`systemClipboard` are consistent across `write.ts` and its test and the unchanged `ClipboardWriter` type used by `bridge-server.ts`.

**Risk — interactive load unverifiable here:** mitigated by mechanical checks (JSON parse, bundle builds + smoke-runs, bin executable) + explicit manual acceptance steps. **Risk — esbuild shebang:** `cli.ts` already starts with `#!/usr/bin/env node`; esbuild preserves the entry shebang, and Task 2 Step 4 smoke-runs via `node` regardless, with `chmod +x` for direct execution. **Risk — `permissions.allow: ["Bash"]`** in the harness is broad; acceptable for a local dev harness, noted for the user.
