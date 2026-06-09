# pinpoint

Click an element in your **running dev app**, comment on what to change, hit **Send**, and paste into your **own Claude Code session** — it edits the source and hot-reloads. No separate agent, no cloud.

pinpoint is a small **CDP-only bridge**: a local process that injects a lightweight overlay into the app running in your Chrome. You **pick** an element (→ its React component identity: name, ancestry, selector, text, bounding box) or **drag a region** (→ a partial screenshot), comment on each, and click **Send**. The bridge saves any screenshots and copies a `pinpoint` JSON to your clipboard; you paste it into Claude, which greps the repo for the component and makes the edit. It's framework-agnostic (proven on Vite + React) and runs entirely locally.

> Design: pinpoint reads React-fiber **identity** via CDP (not source-maps, which don't reach user source on modern bundlers) and delivers via the clipboard (no MCP server). See `docs/superpowers/specs/` and `docs/decisions.md`.

## How the loop works

1. Your dev app runs in a Chrome started with remote debugging.
2. The bridge attaches over CDP and injects the overlay (a small toolbar with **Pick / Screenshot**, plus per-element comment cards).
3. You **Pick** an element (or drag a **Screenshot** region) and type a comment on each card (📷 where a screenshot helps).
4. You click **Send**. The bridge saves flagged screenshots under `.pinpoint/…` and copies a `pinpoint` JSON — `{ source, sessionId, promptId, items: [{ componentName, ancestry, selector, tagName, text, comment, screenshot }] }` — to your clipboard.
5. You **paste** that JSON into your Claude Code session. The `pinpoint-paste` skill reads each item, `Read`s any referenced screenshot, greps `function <componentName>` to find the source, and applies each comment. Your dev server HMR-reloads.

There is no MCP server: delivery is the clipboard/paste flow.

## Prerequisites

- Node ≥ 20 and `pnpm`. (On this machine Node comes from `nvm`: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`.)
- Google Chrome.

## Install & build

```bash
pnpm install
pnpm --filter @pinpoint/core build
```

## Run

Your dev app + the bridge + your Claude session. The bridge speaks **raw CDP** (no Playwright) and **launches Chrome itself**. Defaults: overlay HTTP on `:7331`, CDP on `:9222`, app on `:5173` (override with `PIN_PORT` / `PIN_CDP_URL` / `PIN_APP_URL`; point at a specific browser with `PIN_CHROME_PATH`, and set its profile dir with `PIN_CHROME_PROFILE`).

```bash
# 1. your dev app (any framework). Example (Vite + React):
pnpm --dir examples/vite-react exec vite --port 5180 --strictPort

# 2. the bridge, pointed at the app — it launches a debug Chrome at the app URL:
PIN_APP_URL=http://localhost:5180 node packages/core/dist/cli.js
```

If a debug Chrome is already listening on `:9222`, the bridge **attaches** to it instead of launching one (so you can reuse your own session — start it with
`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir=/tmp/ff-chrome http://localhost:5180`).

Then click in the overlay, comment, **Send**, and paste the copied JSON into a Claude Code session — the `pinpoint-paste` skill applies it.

Or use the helper: `scripts/dev.sh http://localhost:5180`.

## Install as a Claude Code plugin

The tool also ships as a self-contained Claude Code plugin (`packages/claude-code/`): a `/pinpoint:start` command, the `pinpoint-paste` skill, and the bridge bundled to a zero-dep executable in `bin/`. Build the bundle first:

```bash
pnpm build      # builds all packages, incl. packages/claude-code/bin/pinpoint
```

- **Dev loop (live edits, recommended):** from any project, `claude --plugin-dir /path/to/pinpoint/packages/claude-code`, then `/reload-plugins` after editing the plugin. The bin is on the session PATH.
- **In another project:** `/plugin marketplace add /path/to/pinpoint` then `/plugin install pinpoint@pinpoint` (a cached copy — `/plugin marketplace update` + `/reload-plugins` to refresh).
- **In this repo's example:** `cd examples/vite-react && claude` — its `.claude/settings.json` registers the repo's local marketplace and enables the plugin. Run `/pinpoint:start`.

The kickoff: `/pinpoint:start` launches the bridge (which opens Chrome + injects the overlay) and walks you through Pick → comment → **Send** → paste.

## Limitations

- Identity is best-effort: client components resolve via the React fiber chain; component names can be `null` for some trees — Claude then falls back to visible text + CSS selector + screenshot.
- Region screenshots clip the **current viewport**, so pick/drag what's on screen (don't scroll the target off-view first).
- React only for now (fiber-based identity). Other frameworks/Astro islands are future work (see the board).

## Project layout & conventions

All code units live under `packages/`; everything else is development nuance (examples, docs, config).

```
packages/core/          the agent-agnostic engine (CDP connector, overlay, clipboard payload, bridge HTTP server)
packages/claude-code/   Claude Code integration (command + skill + bundled bridge in bin/) — depends on core
examples/               throwaway apps to inspect (vite-react)
backlog/                git-native task board — `pnpm backlog`
docs/                   specs, plans, decisions log, phase notes
```
The engine has no agent coupling; a future tool (Codex, Cursor, …) is a new sibling package under `packages/` that depends on `@pinpoint/core` and re-packages it. Conventions (superpowers workflow, task board, quality gates) are in `CLAUDE.md`. Quality is enforced by Biome + a Lefthook pre-commit + Claude agent hooks.
