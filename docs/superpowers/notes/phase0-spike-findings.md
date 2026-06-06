# Phase 0 — Spike Findings

## Environment (this machine)

- **Node** comes from `nvm` (v22.22.2 used) and is **not on the non-interactive shell PATH**. Prepend `$HOME/.nvm/versions/node/v22.22.2/bin` to PATH when running node/npm/npx/pnpm-spawned tooling. (Captured as a project note; consider an `.nvmrc`.)
- `pnpm` 10.20.0 and `bun` 1.2.2 are on PATH; npm registry reachable.
- **Port 3000 is occupied by Docker.** The example app runs on **3100**. Thread the app URL through `FF_APP_URL` (config supports this) rather than assuming 3000.
- `create-next-app` checks the *parent* of the target dir for writability — `examples/` must exist before scaffolding into `examples/nextjs`.
- Some Bash tooling (`create-next-app`, `next dev`, network installs) needs the harness sandbox disabled to spawn child processes / bind ports.

## Task 0.2 — middleware serves with the Elixir server OFF ✅

Scaffolded `examples/nextjs` with `create-next-app` → **Next.js 16.2.7** (note: Next 16 uses **`proxy.ts`**, not `middleware.ts`). Installed **`@frontman-ai/nextjs@0.6.6`** and added `examples/nextjs/proxy.ts` using `createMiddleware({ host: 'frontman.local:4000' })` (the host is a local-dev placeholder; the middleware does not connect to it, and frontman-flow drives the browser via CDP, so it need not be reachable).

Ran `next dev -p 3100` with **no Elixir/cloud server running** and probed:

| Endpoint | Method | Result |
|---|---|---|
| `/` | GET | `200` |
| `/frontman/tools` | GET | `200` — JSON tool list (`read_file`, …) |
| `/frontman/resolve-source-location` | POST | `200` — `{componentName, file, line, column}` (echoed the dummy input; a real source-mapped node would resolve) |
| `/frontman` | GET | `200` — 990-byte HTML shell containing "Frontman" |

**Conclusion:** The 🟢 HTTP half of the seam (tools + source-location resolution + overlay shell) is fully served by the Apache-2.0 middleware **with the Elixir server off**. No blocker. This validates the core MVP premise.

### Open item carried to Task 0.3 (the remaining unknown)
The overlay at `/frontman` is a 990-byte JS shell. Confirmed it *serves*, but NOT yet that its click-to-select gesture works in-browser and that the resulting selection is **readable via CDP** (the `SELECTION_PROBE` question). That is interactive and is Task 0.3.

### Follow-ups for Phase 1
- `create-next-app` added a nested `pnpm-workspace.yaml` (removed) and default `CLAUDE.md`/`AGENTS.md` inside `examples/nextjs`. Task 1.1 sets up the **root** pnpm workspace globbing `examples/*`; reconcile then.
- The example app is Next **16** (`proxy.ts`), so the Phase 1 plan's `middleware.ts` snippet does not apply here — `proxy.ts` is already in place.
