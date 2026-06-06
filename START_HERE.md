# START HERE — Browser-to-Claude visual editing bridge

> Paste this file into the root of a fresh repo. It is the seed brief for the project.
> Once you've read it, the very first development action is to install **Superpowers**
> and run `/superpowers:brainstorm` (see *Development methodology* below). Do not start
> hand-coding before the brainstorm → plan step.

---

## 1. The idea in one paragraph

We want to click an element (or take a screenshot) in our **running dev app in the browser**,
type what should change, and have **our own Claude Code session** — with all of *our* skills,
subagents, hooks, and project config — make the source edit and hot-reload it. Today no
off-the-shelf tool does exactly this: frontman has the perfect browser-side context layer but
ships its *own* agent; the various browser MCPs and overlays either run a separate agent or only
hand us pixels. The plan is to **reuse frontman's context layer and replace its agent with our
Claude Code**. The end state is integration-agnostic: it should work on Next.js, Vite, Astro, and
beyond, the same way frontman's own framework plugins do.

## 2. Why this is feasible (the architectural seam)

Investigation of `frontman-ai/frontman` (pinned below) turned up the seam we need:

- The package **`@frontman-ai/frontman-client` is itself a browser-side MCP server** for AI-agent
  tool execution. It speaks standard transports — **Phoenix WebSocket channels, SSE, and
  JSON-RPC 2.0** — and also ships an **ACP (Agent Client Protocol)** implementation and a **Relay**
  that delegates tool calls down to the framework middleware.
- The MCP tools it exposes are exactly what we want: **element selection, screenshots, live DOM
  tree, computed CSS, component tree _with source-file locations_, console logs and build errors.**
- The framework integrations (`frontman-nextjs`, `frontman-vite`, `frontman-astro`,
  `frontman-wordpress`) install as dev-server middleware and resolve **source maps** so a clicked
  DOM node maps back to the right source file.
- The piece we **do not** want is the agent: `apps/frontman_server` (Elixir/Phoenix) is the
  orchestrator that currently consumes those tools. We replace it with Claude Code.

So the consumer of frontman's tools is pluggable. Our job is to make **Claude Code the MCP client**
(it is a first-class MCP client) instead of the Elixir orchestrator — and keep frontman's browser
overlay only for the *click-to-select* gesture, whose selection state flows into the MCP server via
the Relay.

> **License boundary — read before writing any code.** frontman is split-licensed:
> the client libraries + framework integrations (`libs/`) are **Apache-2.0**; the server
> (`apps/frontman_server/`) is **AGPL-3.0**. We only study/depend on the **Apache-2.0** half.
> We **never** copy, vendor, or modify the AGPL server into this repo. (This is also why the
> reference clone in §4 is kept *out* of version control — see the rationale there.)
> None of this is legal advice; if we ever productize, get a real review.

## 3. What we are building (and what "done" looks like)

A small, framework-agnostic **bridge + Claude Code skill** that:

1. Exposes frontman's browser/dev-server MCP tools to a Claude Code session as a standard MCP
   server (stdio or SSE), without the Elixir orchestrator running.
2. Lets a developer: open the app → click an element (or grab a screenshot) → switch to their
   Claude session → say "fix the selected element's spacing" → Claude calls `get_selection` /
   `screenshot` / source-map tools, edits the real source file, and HMR reloads.
3. Works across integrations. The core (transport + tool plumbing) is integration-agnostic; each
   framework gets a thin adapter, mirroring how frontman structures its own `libs/`.

**Definition of done (MVP):** the loop above works end-to-end on **one** integration (Next.js),
driven entirely by our Claude Code with our skills/config, with the Elixir server *not* running.
**Definition of done (v1):** the same loop on **Vite** (and ideally Astro) sharing one core, plus
a packaged Claude Code skill the team can install, and a documented Docker story.

## 4. First thing to do: set up the read-only reference clone

We need frontman's source on disk for the agent to read (transport details, tool schemas, the
`zed/` + ACP wiring, the Relay). We keep it as a **non-versioned, read-only reference** — never
committed — for three reasons: it keeps our repo small, it avoids any chance of committing the
AGPL server into our tree, and it lets us re-pin/refresh independently.

- Location: `./.reference/frontman` (git-ignored)
- Pinned to a known-good ref for reproducibility:
  - tag: **`v0.18.0`**  (latest at time of writing, 2026-06-04)
  - or commit: **`b00cc5c9a0c460c76adbef49093890cd7f4f185b`**

Add to `.gitignore`:

```gitignore
# Read-only upstream reference, re-cloned on demand. Never committed.
/.reference/
```

Create `scripts/sync-reference.sh` (the canonical re-clone script — the CLAUDE.md guide depends on it):

```bash
#!/usr/bin/env bash
set -euo pipefail

# Pin upstream frontman here. Bump deliberately, not casually.
FRONTMAN_REF="${FRONTMAN_REF:-v0.18.0}"
REF_DIR=".reference/frontman"

if [ -d "$REF_DIR/.git" ]; then
  echo "✓ reference clone present at $REF_DIR"
  echo "  (to refresh: rm -rf $REF_DIR && scripts/sync-reference.sh)"
  exit 0
fi

echo "→ cloning frontman@${FRONTMAN_REF} into $REF_DIR (read-only reference)…"
mkdir -p .reference
git clone --depth 1 --branch "$FRONTMAN_REF" \
  https://github.com/frontman-ai/frontman.git "$REF_DIR"

# Make it obviously read-only / not-ours.
echo "→ done. Treat $REF_DIR as READ-ONLY. Do not edit, do not commit."
```

Then: `chmod +x scripts/sync-reference.sh && scripts/sync-reference.sh`

**The most relevant paths to read inside the reference:**

| Path | Why it matters |
|---|---|
| `libs/frontman-client/` | The browser-side MCP server; transports (Phoenix/SSE/JSON-RPC), `ACP`, `Relay`, `MCP__Server` |
| `libs/frontman-protocol/` | Shared MCP + Relay + Tool type schemas (the contract) |
| `libs/frontman-core/` | `Server`, `SSE`, request handlers, server tools (e.g. `ListTree`) |
| `libs/frontman-nextjs`, `…-vite`, `…-astro` | Per-framework middleware + source-map resolution (our adapter templates) |
| `zed/settings.json` + `*ACP*` modules | Template for plugging an *external* agent in via ACP (the ambitious seam) |
| `apps/frontman_server/` | **AGPL — reference only to understand what we are replacing. Never copy.** |

## 5. CLAUDE.md (paste into `CLAUDE.md` at repo root)

````markdown
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
````

## 6. Development methodology: Superpowers

We use the Superpowers plugin (obra) to make and execute the plan. Install once per machine:

```text
# inside Claude Code (requires Claude Code 2.0.13+)
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
# then quit & restart Claude Code; verify with /help
```

Workflow (the plugin also auto-activates these skills as it detects the phase):

1. `/superpowers:brainstorm` — refine this brief into a validated design (it asks questions,
   explores alternatives, and saves a design doc; in a git repo it spins up a worktree).
2. `/superpowers:write-plan` — break the design into small, testable tasks.
3. `/superpowers:execute-plan` — execute with subagents, TDD, and inter-task review.

> Tip: use a strong model (Opus) for brainstorm/plan; implementation subagents can run faster models.

## 7. Phased plan (input for `/superpowers:write-plan`)

**Phase 0 — Recon & spike (resolve the unknowns in §8).**
Read `frontman-client`/`frontman-protocol` in the reference. Stand up a frontman Next.js install in
a throwaway app and prove a *bare* MCP connection from Claude Code to frontman's browser MCP server
**without** the Elixir server. Deliverable: a one-page findings note + a working `tools/list` call.

**Phase 1 — Next.js vertical slice (MVP).**
Wire the full loop on Next.js: click element → selection in MCP → Claude (our session) calls
`get_selection`/`screenshot`/source-map tools → edits source → HMR. Driven entirely by our Claude
Code with our skills. Elixir server not running.

**Phase 2 — Generalize the core.**
Extract an integration-agnostic core (transport + tool relay + selection protocol) from the Next.js
slice. Add a **Vite** adapter against the same core; then Astro. Mirror frontman's `libs/` split.

**Phase 3 — Run inside Docker.**
Claude Code runs in our dev container; it connects to the frontman MCP endpoint over SSE/WebSocket
on a **published port** (no stdin/tmux injection needed — Claude Code is a native MCP client).
Document the compose/port setup and volume-mounted project dir.

**Phase 4 — Package & adopt.**
Ship a Claude Code **skill** documenting the click-to-fix loop so the team installs it consistently.
Write the README + per-framework quickstarts.

## 8. Open questions to nail in Phase 0 (highest risk first)

1. **External client acceptance.** Does `frontman-client`'s MCP server accept an arbitrary external
   MCP client (Claude Code), or does it assume frontman's Elixir server brokering the Phoenix
   channel? If the latter, what is the smallest Apache-2.0-only shim that exposes the tools over
   stdio/SSE to Claude Code? (Patch lives in *our* repo, not in `.reference/`.)
2. **Selection relay.** How does the browser overlay's "selected element" reach the MCP server, and
   can Claude pull it via a `get_selection`-style tool on demand?
3. **Source-map resolution.** Confirm the framework middleware returns source file + line for a
   selected node, and what tool/endpoint exposes it.
4. **Transport choice.** Phoenix channel vs SSE vs plain JSON-RPC stdio — pick the one Claude Code
   connects to most cleanly; SSE/HTTP is friendliest across the Docker boundary.
5. **ACP vs MCP.** MCP-client is the default path. Note whether the `zed/` + ACP route (frontman as
   ACP host driving Claude Code as an agent CLI) is worth it as a stretch goal.
6. **Auth/permissions.** Any token the browser MCP server expects; how Claude Code tool permissions
   (`--allowedTools mcp__…`) should be scoped.

## 9. Proposed repo layout (let the plan refine this)

```text
.
├── START_HERE.md            # this brief
├── CLAUDE.md                # agent guidance (§5)
├── .gitignore               # ignores /.reference/
├── scripts/
│   └── sync-reference.sh    # re-clones pinned frontman into .reference/ (§4)
├── .reference/              # git-ignored, read-only upstream clone
│   └── frontman/
├── packages/
│   ├── core/                # integration-agnostic: transport + tool relay + selection protocol
│   ├── adapter-nextjs/      # Phase 1
│   ├── adapter-vite/        # Phase 2
│   └── adapter-astro/       # Phase 2+
├── skill/                   # Claude Code skill packaging (Phase 4)
└── examples/                # throwaway apps for each integration
```

## 10. First commands (do these now, in order)

```bash
# 1. reference clone + gitignore + sync script (from §4)
mkdir -p scripts .reference
printf '/.reference/\n' >> .gitignore
# (create scripts/sync-reference.sh from §4, then:)
chmod +x scripts/sync-reference.sh && scripts/sync-reference.sh

# 2. save CLAUDE.md from §5

# 3. inside Claude Code: install Superpowers (§6), restart, then:
#    /superpowers:brainstorm    ← start here, using this file as the seed
```

---

*Context captured 2026-06-04. Upstream pinned at frontman `v0.18.0` (`b00cc5c`).*
*Re-pin deliberately in `scripts/sync-reference.sh` when you bump.*
