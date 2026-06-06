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
