# frontman-flow

Click an element in your **running dev app**, comment on what to change, hit **Send**, and paste into your **own Claude Code session** — it edits the source and hot-reloads. No separate agent, no cloud.

frontman-flow is a small **CDP-only bridge**: a local process that injects a lightweight overlay into the app running in your Chrome. You **pick** an element (→ its React component identity: name, ancestry, selector, text, bounding box) or **drag a region** (→ a partial screenshot), comment on each, and click **Send**. The bridge saves any screenshots and copies a `frontman-flow` JSON to your clipboard; you paste it into Claude, which greps the repo for the component and makes the edit. It's framework-agnostic (proven on Vite + React) and runs entirely locally.

> Background: this started as a bridge to *frontman*'s tools, but Phase 0 found frontman's overlay needs its own server and its source-mapping doesn't reach user source on modern Next. The shipped design instead reads React-fiber **identity** via CDP, and delivers via the clipboard (the MCP server was removed in P1). See `docs/superpowers/specs/` and `docs/decisions.md`.

## How the loop works

1. Your dev app runs in a Chrome started with remote debugging.
2. The bridge attaches over CDP and injects the overlay (a small toolbar with **Pick / Screenshot**, plus per-element comment cards).
3. You **Pick** an element (or drag a **Screenshot** region) and type a comment on each card (📷 where a screenshot helps).
4. You click **Send**. The bridge saves flagged screenshots under `.frontman-flow/…` and copies a `frontman-flow` JSON — `{ source, sessionId, promptId, items: [{ componentName, ancestry, selector, tagName, text, comment, screenshot }] }` — to your clipboard.
5. You **paste** that JSON into your Claude Code session. The `frontman-flow-paste` skill reads each item, `Read`s any referenced screenshot, greps `function <componentName>` to find the source, and applies each comment. Your dev server HMR-reloads.

There is no MCP server: delivery is the clipboard/paste flow.

## Prerequisites

- Node ≥ 20 and `pnpm`. (On this machine Node comes from `nvm`: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`.)
- Google Chrome.

## Install & build

```bash
pnpm install
pnpm --filter @frontman-flow/core build
```

## Run

Three processes + your Claude session. The bridge defaults: overlay HTTP on `:7331`, CDP on `:9222`, app on `:5173` (override with `FF_PORT` / `FF_CDP_URL` / `FF_APP_URL`).

```bash
# 1. your dev app (any framework). Example (Vite + React):
pnpm --dir examples/vite-react exec vite --port 5180 --strictPort

# 2. a Chrome with remote debugging (headed, so you can click):
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 --user-data-dir=/tmp/ff-chrome http://localhost:5180

# 3. the bridge, pointed at the app:
FF_APP_URL=http://localhost:5180 node packages/core/dist/cli.js
```

Then click in the overlay, comment, **Send**, and paste the copied JSON into a Claude Code session open in this repo — the `frontman-flow-paste` skill (`.claude/skills/`) applies it.

Or use the helper: `scripts/dev.sh http://localhost:5180` (starts Chrome + the bridge).

> Note: a one-command, plugin-packaged launch (no manual Chrome/bridge steps) is in progress — see `docs/superpowers/specs/2026-06-08-plugin-clipboard-cdp-design.md` (phases P2/P3).

## Limitations

- Identity is best-effort: client components resolve via the React fiber chain; component names can be `null` for some trees — Claude then falls back to visible text + CSS selector + screenshot.
- Region screenshots clip the **current viewport**, so pick/drag what's on screen (don't scroll the target off-view first).
- React only for now (fiber-based identity). Other frameworks/Astro islands are future work (see the board).

## Project layout & conventions

```
packages/core/   the bridge (CDP connector, overlay, clipboard payload, overlay HTTP server)
examples/        throwaway apps (vite-react)
backlog/         git-native task board — `pnpm backlog`
docs/            specs, plans, decisions log, phase notes
```
Conventions (superpowers workflow, task board, quality gates) are in `CLAUDE.md`. Quality is enforced by Biome + a Lefthook pre-commit + Claude agent hooks.
