# frontman-flow — Design

> Status: approved design (brainstorm output). Next: `/superpowers:write-plan`.
> Seed brief: `START_HERE.md`. Upstream reference: `.reference/frontman` @ `v0.18.0` (read-only, git-ignored).

## Goal

Let a developer click an element (or grab a screenshot) in their **running dev app**, describe a
change in their **own Claude Code session**, and have Claude make the source edit and hot-reload it —
using frontman's browser/dev-server context layer but with **Claude Code as the agent**, not
frontman's bundled Elixir orchestrator.

**MVP definition of done:** the loop works end-to-end on **Next.js**, driven entirely by our Claude
Code, with the frontman Elixir server (`apps/frontman_server`, AGPL) **not running**.

## Key recon findings (why this design works)

Frontman's tools split into two transports, and that split shapes everything:

- **🟢 Dev-server / middleware tools — self-contained HTTP, Apache-2.0, no Elixir, no Phoenix.**
  Run in-process inside the framework dev server (`@frontman-ai/nextjs` middleware). Exposed at
  `GET /frontman/tools`, `POST /frontman/tools/call` (SSE), and
  `POST /frontman/resolve-source-location` (DOM node → `{file, line, column, component}`).
- **🔴 Browser tools + live selection — bound to a Phoenix WebSocket the Elixir server brokers.**
  `take_screenshot`, `get_dom`, computed CSS, and the currently-selected element live in the browser
  overlay (a Redux store). The Apache-2.0 client lib is tightly coupled to Phoenix; there is no
  standalone HTTP/SSE listener on the browser side.

We reach the 🟢 half over plain HTTP, and reach the 🔴 half **via CDP (going under the Phoenix wire
protocol)** rather than reimplementing the Phoenix broker.

## Decisions (locked during brainstorm)

| Decision | Choice |
|---|---|
| MVP browser-context richness | selection + screenshots (not just file+line) |
| Click-to-select gesture | reuse frontman's overlay **as-is** |
| Bridge ↔ Claude Code transport | **SSE/HTTP** MCP server (works locally and across Docker) |
| How the bridge reaches the browser | **CDP / in-page connector** (lowest risk; no Phoenix work) |
| Faithful Phoenix-broker path (Approach B) | deferred to a documented Phase-2 enhancement |
| File editing in the MVP | Claude Code's **native** `Read`/`Edit`/`Write` (see Simplifications) |
| Per-framework adapter | collapsed to **config** until a 2nd framework proves a package is needed |

## Architecture

A single Node/TypeScript process — the **bridge** — that is three connectors at once:

```
 Claude Code ──SSE/MCP──▶  ┌─────────── BRIDGE ───────────┐
 (your session,            │  • MCP server (SSE/HTTP)     │
  the real agent)          │  • CDP browser connector ────┼──CDP──▶ Chrome (dev app + frontman overlay)
                           │  • frontman HTTP client ─────┼──HTTP─▶ Next.js dev server (/frontman/*)
                           └──────────────────────────────┘
```

- **Toward Claude Code:** MCP server over SSE/HTTP using the official `@modelcontextprotocol/sdk`.
- **Toward the browser:** CDP client (Playwright `connectOverCDP`) attaching to a Chrome launched
  with `--remote-debugging-port`. The real frontman overlay runs unchanged.
- **Toward the dev server:** plain-HTTP client to frontman's self-contained middleware. No Elixir,
  no Phoenix.

## MVP tool surface (bridge → Claude Code)

| Tool | Returns | Implementation |
|---|---|---|
| `get_selection` | `{ file, line, column, component, selector, tagName, rect }` for the currently-clicked element | read frontman's resolved annotation from the page via CDP; fallback to calling `/frontman/resolve-source-location` with the element info |
| `screenshot` | image of `viewport` \| `selection` \| a CSS selector | CDP capture |

Claude edits the resolved file with its own `Read`/`Edit`/`Write`; the dev server's HMR reloads.

## Simplifications & deviations from the brief (approved)

1. **Native edits over proxied file tools.** Claude Code (local, or with the project volume-mounted
   in Docker) already has `Read`/`Edit`/`Write`. Proxying frontman's `write_file`/`edit_file` is
   redundant for the MVP. The bridge's value is the browser context Claude can't otherwise get:
   *which source file a clicked element maps to* and *what it looks like*. File-tool proxying
   (`read_file`/`edit_file` over the same MCP server) is **deferred to Phase 3** (no-filesystem
   Docker case).
2. **`adapter-nextjs` collapses into config.** Both halves are already framework-agnostic — CDP is
   browser-level, and `/frontman/*` endpoints are identical across Next.js/Vite/Astro. `packages/core`
   holds everything real; a "framework adapter" is mostly *how to install frontman's middleware* and
   *where the dev-server URL/port is*. We add a real `adapter-*` package only when a second framework
   proves we need one.

## Repo layout

```
packages/core/            # MCP-SSE server, CDP connector, frontman HTTP client, tool registry
examples/nextjs/          # throwaway Next.js app w/ frontman middleware; Elixir NOT running
skill/                    # Phase 4: packaged Claude Code skill for the click-to-fix loop
docs/superpowers/specs/   # this design
scripts/sync-reference.sh # re-clones pinned frontman into .reference/ (already created)
```

## Data flow (the loop)

1. Dev server (frontman middleware on) runs in the CDP-attached Chrome.
2. Dev clicks an element → frontman overlay resolves it to a source location and stores it in-page.
3. Dev tells their Claude session, e.g., "fix the selected element's padding."
4. Claude → `get_selection` → bridge reads the resolved annotation via CDP → `{file, line, component}`.
5. Claude → `screenshot({ target: "selection" })` → CDP element capture.
6. Claude opens the file with native `Read`/`Edit`, makes the change → HMR reloads.

## Error handling

- **No element selected** → `get_selection` returns a `"no selection"` result (not an error) so Claude
  prompts the dev to click.
- **Source unresolved** (non-component node, no source maps) → return `selector` + `rect` + screenshot
  with a note; Claude falls back to visual/selector reasoning.
- **Chrome not reachable / no debug port** → actionable error with the exact launch command.
- **`/frontman/*` returns 404** → middleware-not-installed error with the fix.
- **Elixir tripwire** → if any required capability turns out to need the AGPL server, **stop and flag**
  (per `CLAUDE.md` guardrail). The MVP must run with the Elixir server off.

## Testing (TDD)

- **Unit:** tool handlers against a faked CDP page + faked frontman HTTP. Tests colocated with source
  (`get-selection.ts` + `get-selection.test.ts`).
- **Integration:** boot `examples/nextjs` + headless Chrome, run the real loop, assert `get_selection`
  returns a true `{file, line}` from a click and `screenshot` returns image bytes.

## Phased plan (input for write-plan)

- **Phase 0 — Spike / de-risk.** Confirm (1) frontman's Next.js middleware serves the overlay +
  `resolve-source-location` with **Elixir not running**, and (2) the clicked element's resolved source
  location is **readable from the page via CDP** (find the store shape / any `window` API), with the
  `/resolve-source-location` HTTP call as the fallback. **Deliverable:** one-page findings note + a
  working `get_selection` returning a real `{file, line}` from a click.
- **Phase 1 — Next.js vertical slice (MVP).** Bridge with `get_selection` + `screenshot` over SSE,
  CDP connector, frontman HTTP client, `examples/nextjs`, Claude Code wiring. The full loop, Elixir off.
- **Phase 2 — Generalize.** Prove Vite (then Astro) reuse the same core with config-only changes;
  extract a real `adapter-*` package only if needed. Optionally add the faithful Phoenix path (B).
- **Phase 3 — Docker.** Bridge + Claude Code in a container; SSE/CDP across the boundary on published
  ports; volume-mounted project dir. File-tool proxying lands here for the no-filesystem case.
- **Phase 4 — Package & adopt.** Ship the Claude Code skill + README + per-framework quickstarts.

## Open risks (carried into Phase 0)

- Reading the overlay's selection/resolved-source state from the page may require knowing the Redux
  store shape; the `/frontman/resolve-source-location` HTTP call is the fallback if the in-page read
  is brittle.
- "Reuse the overlay as-is" assumes the overlay loads and resolves selections without the Elixir
  server; recon suggests yes, Phase 0 must confirm.
- CDP attach model: dev clicks in the CDP-driven/attached Chrome rather than an arbitrary browser tab.
