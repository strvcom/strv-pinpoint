# pinpoint (Claude Code plugin)

Click an element in your running dev app, comment, **Send**, and paste into Claude — it edits the source. CDP-only, zero-dependency bridge; no MCP server.

## Use it
- `/pinpoint:start` — launches the bridge (which opens Chrome + injects the overlay) and walks you through the loop.
- Pick / Screenshot → comment → **Send** → paste the copied JSON into chat. The `pinpoint-paste` skill applies it.

## Install / develop
- **Quick dev (live edits):** from anywhere, `claude --plugin-dir /path/to/pinpoint/packages/claude-code`, then `/reload-plugins` after edits.
- **In a project:** register the repo's local marketplace in that project's `.claude/settings.json` (`extraKnownMarketplaces` + `enabledPlugins`), or `/plugin marketplace add /path/to/pinpoint` then `/plugin install pinpoint@pinpoint`.

The bridge binary (`bin/pinpoint`) is built from `@pinpoint/core` — run `pnpm build` (or `pnpm --filter @pinpoint/claude-code build`) in the repo first.
