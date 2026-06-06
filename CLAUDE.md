# CLAUDE.md — project guidance

## What this project is
A framework-agnostic bridge + Claude Code skill that exposes frontman's browser/dev-server MCP
tools (element selection, screenshots, DOM tree, computed CSS, component tree with source
locations, server logs) to a Claude Code session, so Claude — not frontman's bundled Elixir
agent — performs visual frontend edits. Target: works across Next.js, Vite, Astro.
Read `START_HERE.md` for the full brief.

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

## Guardrails
- Prove the MVP on **one** integration (Next.js) before generalizing.
- Keep the integration-agnostic core separate from per-framework adapters.
- The Elixir orchestrator must NOT be required at runtime — if a step needs it, stop and flag it.
