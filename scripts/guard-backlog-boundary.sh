#!/usr/bin/env bash
# Reject staged files under backlog/{decisions,docs,milestones}/.
#
# Backlog.md is confined to tasks (the board). Decisions belong in
# docs/decisions.md and specs/plans in docs/superpowers/ — see the
# managing-the-task-board skill. Keeps project knowledge from fragmenting.
set -euo pipefail

blocked="$(git diff --cached --name-only --diff-filter=ACMR \
  | grep -E '^backlog/(decisions|docs|milestones)/' || true)"

if [ -n "$blocked" ]; then
  {
    echo "✖ Backlog.md boundary violation: don't commit files under"
    echo "  backlog/{decisions,docs,milestones}/."
    echo "  → decisions belong in docs/decisions.md"
    echo "  → specs/plans belong in docs/superpowers/"
    echo "  Offending staged files:"
    echo "$blocked" | sed 's/^/      /'
  } >&2
  exit 1
fi
