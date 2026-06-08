# frontman-flow (Claude Code plugin)

Click an element in your running dev app, comment, **Send**, and paste into Claude — it edits the source. CDP-only, zero-dependency bridge; no MCP server.

## Use it
- `/frontman-flow:start` — launches the bridge (which opens Chrome + injects the overlay) and walks you through the loop.
- Pick / Screenshot → comment → **Send** → paste the copied JSON into chat. The `frontman-flow-paste` skill applies it.

## Install / develop
- **Quick dev (live edits):** from anywhere, `claude --plugin-dir /path/to/frontman-flow/packages/claude-code`, then `/reload-plugins` after edits.
- **In a project:** register the repo's local marketplace in that project's `.claude/settings.json` (`extraKnownMarketplaces` + `enabledPlugins`), or `/plugin marketplace add /path/to/frontman-flow` then `/plugin install frontman-flow@frontman-flow`.

The bridge binary (`bin/frontman-flow`) is built from `@frontman-flow/core` — run `pnpm build` (or `pnpm --filter @frontman-flow/claude-code build`) in the repo first.
