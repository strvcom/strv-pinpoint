---
description: Start the frontman-flow bridge and run the click-to-fix loop against your running dev app.
---

# Start frontman-flow

Bring up the overlay loop so the user can click elements in their dev app and have you edit the source. **Figure out where their dev server is from the project — don't assume a port.**

## Steps

1. **Determine the dev-server URL by inspecting the project (don't default to a port).**
   - If `FF_APP_URL` is already set in the environment, or the user gave you a URL, use that and skip detection.
   - Otherwise read `package.json` `scripts` and find the dev script (commonly `dev`, sometimes `start`/`serve`). Note the tool it runs and any explicit port flag (`-p`/`--port <n>`, `PORT=<n>`, `--host`). An explicit flag wins.
   - If there's no explicit port, infer the framework's default from the dev tool / deps:

     | Dev tool / framework | Default URL |
     |---|---|
     | Vite / SvelteKit | `http://localhost:5173` |
     | Next.js / Remix / Nuxt / react-scripts (CRA) | `http://localhost:3000` |
     | Astro | `http://localhost:4321` |
     | Angular | `http://localhost:4200` |
     | Vue CLI / webpack-dev-server | `http://localhost:8080` |

   - Check the framework config for an override: `vite.config.*` (`server.port` / `server.host` / `strictPort`), `astro.config.*`, `nuxt.config.*`, `next.config.*`, `vue.config.js`, `angular.json`. A config port beats the framework default.
   - In a monorepo, pick the package the user means (the one they're working in / asked about); if there are several runnable apps and it's unclear, **ask which app** rather than guessing.

2. **Check whether that server is already running.** Probe the resolved URL, e.g.:
   ```bash
   curl -fsS -o /dev/null -m 2 <app-url> && echo UP || echo DOWN
   ```
   - **UP** → use it; go to step 4.
   - **DOWN** → go to step 3.

3. **It's not running — surface the start command, don't assume it.** Tell the user the exact command to start their dev server (the one you found, run with their package manager — e.g. `pnpm dev`, `npm run dev`, or `pnpm --dir <pkg> dev`) and offer to start it for them in the background. Only start it once they're OK with it (or they ask you to). Then re-probe (step 2) until it's UP.

4. **Launch the bridge in the background, pointed at the resolved URL.** This plugin ships a `frontman-flow` executable on your PATH; it talks raw CDP and launches Chrome itself (or attaches to a debug Chrome already on `:9222`):
   ```bash
   FF_APP_URL=<resolved-app-url> frontman-flow &
   ```
   Override the browser with `FF_CHROME_PATH` and its profile dir with `FF_CHROME_PROFILE` if needed. The overlay HTTP server listens on `:7331` (`FF_PORT`).

5. **Tell the user the loop:** in the Chrome window the bridge opened, use the overlay toolbar — **Pick** an element (or **Screenshot** a region), type a comment on each card, then click **Send**. The bridge copies a `frontman-flow` JSON to their clipboard.

6. **Wait for the paste.** When the user pastes that JSON back into the chat, the `frontman-flow-paste` skill takes over and applies each comment to its component.

## Notes
- Always resolve a concrete URL and pass it via `FF_APP_URL` — never fall back to a built-in default silently. If you truly can't infer it, ask.
- If `frontman-flow` isn't found on PATH, the plugin bundle wasn't built — run `pnpm build` (or `pnpm --filter @frontman-flow/claude-code build`) in the frontman-flow repo.
- Don't guess edits before the user has picked + sent; wait for the pasted JSON.
