# CLAUDE.md — project guidance

## What this project is
A framework-agnostic **CDP-only bridge**: a local process that injects an overlay into a
running dev app so a developer can click an element (→ React component **identity**: name,
ancestry, selector, text, rect) or drag a region (→ partial screenshot). When the developer
clicks **Send**, the overlay writes a `pinpoint` JSON — per-element identity + comments +
saved screenshot paths — to the clipboard; the developer pastes it into a Claude Code session,
which greps the repo for the component and edits source. Delivery is the **clipboard/paste flow**:
there is no MCP server (removed in P1; see `docs/superpowers/specs/2026-06-08-plugin-clipboard-cdp-design.md`).
Claude is the agent — there is no frontman server at runtime.
The tool ships as a **Claude Code plugin** (`packages/claude-code/`): a `/pinpoint:start`
command + the `pinpoint-paste` skill + the bridge bundled (esbuild) to a zero-dep executable in
`bin/`. Local dev: `claude --plugin-dir ./packages/claude-code` (build first with `pnpm build`).
All code units (engine + per-tool integrations) live under `packages/`; everything else is dev
nuance. The engine (`packages/core`) is agent-agnostic; integrations are thin packages that depend
on it and re-package it for a specific agent harness.
Read `START_HERE.md` for the original brief and `docs/superpowers/specs/` (the **amendment**
section is authoritative) for how Phase 0 reshaped it. Phase-0 findings (why the original
frontman-overlay/source-map approach was dropped): `docs/superpowers/notes/phase0-spike-findings.md`.

## Upstream reference (read-only, not in git)
We study `frontman-ai/frontman` from a local, git-ignored clone at `./.reference/frontman`.

- **If `./.reference/frontman` is missing, re-clone it before doing reference work:**
  run `scripts/sync-reference.sh`. (It clones the pinned ref; safe to run anytime — it no-ops
  if the clone already exists.)
- The reference is **READ-ONLY**: never edit, move, or commit anything under `.reference/`.
- Start any architecture/transport question by reading `libs/frontman-client/` and
  `libs/frontman-protocol/` in the reference.

## License boundary (non-negotiable)
- We may study and depend on the **Apache-2.0** half: `libs/` (client libraries + framework
  integrations).
- We must **never copy, vendor, port, or modify** the **AGPL-3.0** server
  (`apps/frontman_server/`) into this repo. We are *replacing* that component, not reusing it.

## How we work: Superpowers
This project uses the **Superpowers** plugin. Follow its brainstorm → plan → execute discipline:
do not write implementation code before a plan exists.

- Brainstorm/refine the design: `/superpowers:brainstorm`
- Turn the approved design into a task plan: `/superpowers:write-plan`
- Execute the plan (TDD, subagents, review): `/superpowers:execute-plan`

Honor Superpowers' rules: plan first, tests before implementation, and the two-stage self-review
before declaring anything done.

### Use Superpowers by default for non-trivial work
Anything beyond a typo-level fix goes through the workflow, not ad-hoc edits:
`superpowers:brainstorming` (unclear requirements) → `superpowers:writing-plans` (stepped, checkbox
plan in `docs/superpowers/plans/YYYY-MM-DD-<name>.md`) → `superpowers:using-git-worktrees` /
feature branch → `superpowers:subagent-driven-development` (two-stage review) →
`superpowers:test-driven-development` per task → `superpowers:verification-before-completion`.
The checkboxes in the plan file are the source of truth for progress.

## Workflow
- Commit early and often — one logical change per commit; don't accumulate large diffs.
- Write tests alongside the change (TDD), not as a final step. Unit tests are colocated
  (`foo.ts` + `foo.test.ts`); the live-browser loop test is `packages/core/integration/*.integration.test.ts`.
- Run validation before calling anything done: `pnpm typecheck && pnpm lint && pnpm test` (+ `pnpm build`).
- Record non-obvious judgment calls as a one-line row in `docs/decisions.md`.

## Task Board (Backlog.md)
Coarse work streams live on a local, git-native Backlog.md board (`backlog/`). Quick view:
`pnpm backlog`. **When creating/updating/reviewing tasks, use the `managing-the-task-board` skill**
— it carries the conventions + CLI usage. One card per stream (subtask detail stays in
`docs/superpowers/plans/*.md`); flip a card to `In Progress` when you start its plan and `Done`
when it merges; name the branch `task-<n>--<topic>`.

### Anti-drift: Done requires a merge (non-negotiable)
A task branch/worktree **MUST land on `main` before its card flips to `Done`**. "Done" means
*merged*, not "the code exists somewhere." Flipping a card `Done` while its branch is still
unmerged is what stranded TASK-8 (overlay v3 lived only on `task-8--overlay-v3` for weeks while
`main` drifted through the P1 MCP removal + the packages/ refactor — see TASK-13). To prevent it:
- When a stream's work finishes, **merge `task-<n>--<topic>` into `main`** (local merge — the repo
  has no remote) *before* editing the card to `Done`. Verify on `main`: `git branch --merged main`
  should list the branch, or `git log main --oneline` should show the merge/work.
- Don't leave long-lived task branches behind `main`. If one falls behind, rebase/replay promptly
  — the longer it drifts, the more a naive merge risks reintroducing already-removed work.
- The board's status edits run from the `main` checkout; before marking `Done` there, confirm the
  branch's commits are actually present on `main`.

## Quality gates
- **Biome** (`biome.json`) is format + lint — `pnpm check` / `pnpm lint` / `pnpm format`.
- **Lefthook** pre-commit runs (parallel): backlog-boundary guard, biome on staged files, typecheck.
- **Claude agent hooks** (`.claude/settings.json`): auto-format edited files; on Stop run
  `typecheck && lint && test` so a broken build can't be claimed as done.

## Local dev (no Docker)
- Node comes from `nvm` (`$HOME/.nvm/versions/node/v22.22.2/bin`) — prepend it if `node` isn't found.
- The example app runs on **3100** (`pnpm --dir examples/nextjs exec next dev -p 3100`); 3000 is taken by Docker.
- Manual loop steps: `docs/superpowers/notes/phase1-manual-loop.md`.

## Guardrails
- Prove the MVP on **one** integration (Next.js) before generalizing.
- Keep the integration-agnostic core separate from per-framework adapters.
- No frontman server (Apache-2.0 middleware or AGPL Elixir) may be required at runtime — if a step needs it, stop and flag it.
