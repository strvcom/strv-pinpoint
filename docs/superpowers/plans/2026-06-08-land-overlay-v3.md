# Plan: Land overlay v3 on main (TASK-13)

## Problem
TASK-8 (overlay v3) was marked Done but never merged. The v3 UX lives only on
`task-8--overlay-v3`, which predates **P1 (MCP removal → clipboard-only)** and the
**TASK-10 packages/ refactor**. A naive merge/rebase would reintroduce the removed
MCP/SSE server. main still serves overlay **v2** (Pick/Region/Off).

## Investigation result — what to port vs. what to drop
Compared `main` ↔ `task-8--overlay-v3` file-by-file:

| File | Action | Why |
|---|---|---|
| `packages/core/src/cdp/overlay-script.ts` | **PORT (wholesale)** | v3 UX. Header imports identical to main; references only `__frontmanFlowLink` (bridge-link, clipboard model) — no MCP. |
| `packages/core/src/annotations/save-screenshots.ts` | **PORT (wholesale)** | Clipboard-safe win: hides `[data-frontman]` overlay during capture; `if (it.selector)` guard for screenshot-kind items. |
| `packages/core/src/annotations/save-screenshots.test.ts` | **PORT** | Tests above. main's `FakePage` already has `evaluatedExpressions` + `clipPng`, so it runs as-is. |
| `cli.ts` | **DROP** | Branch version uses `startSseServer`/`cfg.mcpPort` — the exact MCP regression to avoid. |
| `server/sse-server.ts` | **DROP** | MCP/SSE — removed on main in P1. |
| `cdp/playwright-page.ts` | **DROP** | Removed on main in the raw-CDP refactor (main uses `cdp-page.ts`). |
| `integration/bridge-routes.integration.test.ts` | **DROP** | Branch version imports `startSseServer` (MCP). main's clipboard version stays. |
| `README.md`, `.claude/skills/frontman-flow/SKILL.md` | **DROP** | Branch versions document the MCP tools / `.mcp.json` / `FF_MCP_PORT` (pre-P1). |
| branch docs (v3 spec/plan/notes) | **DROP** | MCP-flavored; not needed for the ACs. |

## Steps
- [ ] 1. Port the 3 files from `task-8--overlay-v3` (`git checkout <branch> -- <paths>`).
- [ ] 2. `pnpm typecheck && pnpm lint && pnpm test` — green (save-screenshots test covers the new behavior).
- [ ] 3. `pnpm build`; run bridge against `examples/vite-react` on :5173 and confirm the **v3 toolbar** (✦ FAB → Pick · Screenshot · Clear · Copy) serves from the fresh bundle. (AC#1, AC#2)
- [ ] 4. Anti-drift rule: document in `CLAUDE.md` + `managing-the-task-board` skill — a task branch MUST merge to main before its card flips Done; "Done" requires a merge. (AC#3)
- [ ] 5. Merge `task-13--land-overlay-v3` → `main`; re-verify TASK-8 reflects reality. (AC#4)
- [ ] 6. `docs/decisions.md` row; flip TASK-13 → Done from the main checkout.

## Guardrail
After the port, `grep -rn "sse-server\|startSseServer\|get-annotations\|register-tools\|mcpPort" packages/core/src` must return nothing (clipboard-only invariant holds).
