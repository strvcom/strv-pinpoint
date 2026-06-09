#!/usr/bin/env bash
# Launch a debug Chrome + the pinpoint bridge for an already-running dev app.
#
# Usage:  scripts/dev.sh [APP_URL]
#   APP_URL defaults to http://localhost:5173. Start your dev app separately first.
#
# Requires `node`/`pnpm` on PATH (e.g. `export PATH="$HOME/.nvm/versions/node/<v>/bin:$PATH"`).
# macOS Chrome path is the default; override with $CHROME on other systems.
set -euo pipefail

APP_URL="${1:-http://localhost:5173}"
CDP_PORT="${PIN_CDP_PORT:-9222}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PROFILE="${PIN_CHROME_PROFILE:-/tmp/pp-chrome}"

if [ ! -f packages/core/dist/cli.js ]; then
  echo "→ building @pinpoint/core…"
  pnpm --filter @pinpoint/core build
fi

if curl -fsS "http://localhost:${CDP_PORT}/json/version" >/dev/null 2>&1; then
  echo "✓ Chrome CDP already listening on ${CDP_PORT}"
else
  echo "→ launching Chrome with --remote-debugging-port=${CDP_PORT} at ${APP_URL}…"
  "$CHROME" --remote-debugging-port="${CDP_PORT}" --user-data-dir="$PROFILE" \
    --no-first-run --no-default-browser-check "$APP_URL" >/dev/null 2>&1 &
fi

echo "→ starting bridge (overlay HTTP on :${PIN_PORT:-7331}, app ${APP_URL})…"
PIN_APP_URL="$APP_URL" PIN_CDP_URL="http://localhost:${CDP_PORT}" exec node packages/core/dist/cli.js
