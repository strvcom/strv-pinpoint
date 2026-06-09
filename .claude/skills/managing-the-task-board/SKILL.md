---
name: managing-the-task-board
description: Use when creating, updating, moving, or reviewing tasks on the project's Backlog.md board (the backlog/ folder) — adding a work stream, changing a task's status, linking a plan/spec, or checking what is open / in progress / done.
---

# Managing the Task Board

## Overview

Project work streams are tracked on a local, git-native **Backlog.md** board: markdown task files in `backlog/`, no external service. Keep it **coarse** — one card per stream/epic, not per in-feature subtask. Subtask detail lives in the matching `docs/superpowers/plans/*.md`, which the card links to.

## Critical rule

Operate the board **only through the `backlog` CLI** (`npx backlog.md@latest …`). **Never hand-edit, rename, move, or delete files under `backlog/`** — the CLI owns IDs, frontmatter, status, and git commits. Use `--plain` for clean, parseable output when reading. (`pnpm backlog` opens the board.)

## Statuses

`To Do` → `In Progress` → `Done` (defined in `backlog/config.yml`). The canonical board lives on `main`; `check_active_branches` is on, so task state rolls up across branches.

## Quick reference

| Goal | Command |
|---|---|
| See the board | `npx backlog.md board` (terminal) · `npx backlog.md browser` (web UI) |
| List / filter | `npx backlog.md task list --plain` · add `-s "In Progress"` |
| Read one task | `npx backlog.md task <id> --plain` |
| Create a stream | `npx backlog.md task create "Title" -s "To Do" -l <label> -d "what's next" --ref <plan-or-spec-path>` |
| Move / edit | `npx backlog.md task edit <id> -s "In Progress"` (also `-d`, `-l`, `--ac`, `--plan`, `--notes`) |
| Check acceptance criterion | `npx backlog.md task edit <id> --check-ac <index>` |

Run any subcommand with `--help` for the full flag list.

## Conventions

- **One card per stream**; link its driving plan/spec with `--ref`.
- Put **what's next** in the task `description`, not a list of micro-steps.
- Don't open cards for trivial in-feature work — that belongs in the plan file's checkboxes.

## Lifecycle (agents do this too)

Move the card's status as the stream moves — this is part of the work, not an afterthought:

- **Starting** a stream (the moment you begin its plan via `superpowers:writing-plans`) → set `In Progress`:
  `npx backlog.md task edit task-<n> -s "In Progress"`
- **Merged / shipped** → set `Done`.

Run status edits from the **`main` checkout** (the board is canonical there).

### `Done` requires a merge (anti-drift — non-negotiable)

A card flips to `Done` **only after its branch has landed on `main`**. "Done" means *merged*, not
"the code exists on a branch." Flipping `Done` while `task-<n>--<topic>` is unmerged strands the
work and lets `main` drift past it — exactly what happened to TASK-8 (overlay v3 sat unmerged while
`main` moved through the P1 MCP removal + packages/ refactor; TASK-13 had to replay it). Before
editing a card to `Done`:

1. Merge `task-<n>--<topic>` into `main` (local merge — no remote).
2. From the `main` checkout, **verify the commits are present**: `git branch --merged main` lists
   the branch (or `git log main --oneline` shows the work). Only then run
   `npx backlog.md task edit task-<n> -s "Done"`.

If a branch has fallen behind `main`, rebase/replay it promptly — the longer it drifts, the more a
naive merge risks reintroducing already-removed work.

## Branch / worktree naming

One card ↔ one branch. Name the branch (and a worktree, if you use one) `task-<n>--<short-topic>` so the mapping is obvious. This project has no Docker/devcontainer setup and defaults to a feature branch in the main checkout:

```
git checkout -b task-3--vite-adapter        # feature branch in place (default)
# or, if you want isolation:
git worktree add -b task-3--vite-adapter ../pinpoint-task-3 main
```

## Relationship to superpowers & repo docs

The board is only an **index of streams + their status** — it does not replace the doc system. Keep responsibilities split, and confine Backlog.md to `backlog/tasks/`:

| Concern | Lives in |
|---|---|
| Stream exists / status (open · in progress · done) | `backlog/tasks/` (this board) |
| Design / spec | `docs/superpowers/specs/` |
| Stepped plan + subtask checkboxes (in-feature source of truth) | `docs/superpowers/plans/` |
| Decisions log | `docs/decisions.md` (single running file) |
| Product / architecture docs | `docs/` |

A card maps to **one** superpowers spec/plan effort; link it with `--ref <plan-or-spec-path>`. Do **not** use Backlog.md's `backlog/docs/`, `backlog/decisions/`, or `backlog/milestones/` — they would fragment knowledge that already lives in `docs/`. A pre-commit guard (`scripts/guard-backlog-boundary.sh`) enforces this.

## Common mistakes

- Hand-editing `backlog/*.md` → corrupts IDs/git. Always use the CLI.
- Creating granular subtasks → bloats the board. Keep it coarse; subtasks live in the plan file.
- Writing decisions/specs into `backlog/` → use `docs/decisions.md` and `docs/superpowers/` instead.
