# frontman-flow

Click an element in your **running dev app**, tell your **own Claude Code session** what to change, and it edits the source and hot-reloads — no separate agent, no cloud.

frontman-flow is a small **CDP-only bridge**: an MCP server (SSE) that injects a lightweight overlay into the app running in your Chrome. You **pick** an element (→ its React component identity: name, ancestry, selector, text, bounding box) or **drag a region** (→ a partial screenshot). Your Claude Code session reads those through two MCP tools, greps the repo for the component, and makes the edit. It's framework-agnostic (proven on Next.js and Vite + React) and runs entirely locally.

> Background: this started as a bridge to *frontman*'s tools, but Phase 0 found frontman's overlay needs its own server and its source-mapping doesn't reach user source on modern Next. The shipped design instead reads React-fiber **identity** via CDP. See `docs/superpowers/specs/` (the amendment section) and `docs/decisions.md`.

## How the loop works

1. Your dev app runs in a Chrome started with remote debugging.
2. The bridge attaches over CDP and injects the overlay (a small **Pick / Region / Off** toolbar, bottom-right).
3. You click **Pick** and click an element (or **Region** and drag a box).
4. In your Claude session you say e.g. *"make the selected heading bigger."*
5. Claude calls `get_selection` → `{ componentName, ancestry, selector, text, rect }`, greps `function <componentName>` to find the file, edits it (and may call `screenshot` for visual context). Your dev server HMR-reloads.

## MCP tools

| Tool | Returns |
|---|---|
| `get_selection` | the picked element's `{ componentName, ancestry[], selector, tagName, text, rect }`, or `{ status: "none" }` |
| `screenshot` | a PNG of `viewport` \| `region` (drag-selected) \| `selection` (picked element) \| any CSS selector |

## Prerequisites

- Node ≥ 20 and `pnpm`. (On this machine Node comes from `nvm`: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`.)
- Google Chrome.

## Install & build

```bash
pnpm install
pnpm --filter @frontman-flow/core build
```

## Run

Three processes + your Claude session. The bridge defaults: MCP SSE on `:7331`, CDP on `:9222`, app on `:3000` (override with `FF_MCP_PORT` / `FF_CDP_URL` / `FF_APP_URL`).

```bash
# 1. your dev app (any framework). Example (Next.js, port 3100):
pnpm --dir examples/nextjs exec next dev -p 3100

# 2. a Chrome with remote debugging (headed, so you can click):
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 --user-data-dir=/tmp/ff-chrome http://localhost:3100

# 3. the bridge, pointed at the app:
FF_APP_URL=http://localhost:3100 node packages/core/dist/cli.js
```

Then open a Claude Code session in this repo (it picks up `.mcp.json` → the SSE server) and grant `mcp__frontman-flow__get_selection` and `mcp__frontman-flow__screenshot`. The `frontman-flow` skill (`.claude/skills/`) teaches the session the click-to-fix loop.

Or use the helper: `scripts/dev.sh http://localhost:3100` (starts Chrome + the bridge).

## Quickstarts

**Next.js** (`examples/nextjs`, port 3100 — 3000 is often taken): run the three commands above. Pick a **client-component** element for reliable identity (e.g. visit `/clienttest`); server components fall back to text/selector + screenshot.

**Vite + React** (`examples/vite-react`):
```bash
pnpm --dir examples/vite-react exec vite --port 5180 --strictPort
# Chrome → http://localhost:5180 ; then:
FF_APP_URL=http://localhost:5180 node packages/core/dist/cli.js
```
Vite + React gives the cleanest identity (no framework wrappers).

## Limitations

- Identity is best-effort: client components resolve via the React fiber chain; server components (Next RSC) via `_debugStack` and may be `null` — Claude then falls back to visible text + CSS selector + screenshot.
- `screenshot` clips the **current viewport**, so pick/drag what's on screen (don't scroll the target off-view first).
- React only for now (fiber-based identity). Other frameworks/Astro islands are future work (see the board).

## Project layout & conventions

```
packages/core/   the bridge (MCP-SSE server, CDP connector, overlay, tools)
examples/        throwaway apps (nextjs, vite-react)
backlog/         git-native task board — `pnpm backlog`
docs/            specs, plans, decisions log, phase notes
```
Conventions (superpowers workflow, task board, quality gates) are in `CLAUDE.md`. Quality is enforced by Biome + a Lefthook pre-commit + Claude agent hooks.
