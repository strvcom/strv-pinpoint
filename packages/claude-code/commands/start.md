---
description: Start the pinpoint bridge and run the click-to-fix loop against your running dev app.
---

# Start pinpoint

Bring up the overlay loop so the user can click elements in their dev app and have you edit the source. **Figure out where their dev server is from the project — don't assume a port — and launch things so their toolchain is on PATH.**

## Make the toolchain available first (do this before any launch)

The dev server and the bridge both need the user's `node`/`pnpm` on PATH. Claude Code's shell often lacks a version-manager `node` (nvm / fnm / volta / asdf), so a bare `pnpm dev` or `pinpoint` fails with **exit 127 / "command not found"**. Don't rely on the host project's CLAUDE.md for this — handle it generically:

- Prefer launching through the user's **login shell**, which sources their rc and version manager:
  ```bash
  "${SHELL:-bash}" -lic '<command>'
  ```
- Or resolve `node` once and reuse that PATH for every launch (no hardcoded version):
  ```bash
  command -v node >/dev/null || export PATH="$(ls -d "$HOME"/.nvm/versions/node/*/bin "$HOME"/.fnm/aliases/default/bin "$HOME"/.volta/bin 2>/dev/null | tail -1):$PATH"
  node -v   # sanity check; also try `asdf which node` if still missing
  ```

If a launch ever returns **127**, it's this — fix PATH and retry, don't give up.

## Steps

1. **Determine the dev-server URL by inspecting the project (don't default to a port).**
   - If `PIN_APP_URL` is already set, or the user gave you a URL, use that and skip detection.
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
   - In a monorepo, pick the package the user means; if several runnable apps are plausible and it's unclear, **ask which app** rather than guessing.

2. **Check whether that server is already running.**
   ```bash
   curl -fsS -o /dev/null -m 2 <app-url> && echo UP || echo DOWN
   ```
   - **UP** → use it; go to step 4.
   - **DOWN** → go to step 3.

3. **It's not running — surface the start command, don't assume it.** Tell the user the exact command to start their dev server (the one you found, run with their package manager — e.g. `pnpm dev`, `npm run dev`, or `pnpm --dir <pkg> dev`) and offer to start it for them in the background. Once they're OK with it, start it **through the login shell** so their toolchain is present, then wait for the URL to answer:
   ```bash
   "${SHELL:-bash}" -lic 'pnpm dev' &        # the start command you detected
   curl --retry 60 --retry-delay 1 --retry-connrefused -fsS -o /dev/null <app-url> && echo UP
   ```

4. **Launch the bridge through the login shell, pointed at the resolved URL.** This plugin ships a `pinpoint` executable on your PATH; it talks raw CDP and launches Chrome itself (or attaches to a debug Chrome already on `:9222`):
   ```bash
   "${SHELL:-bash}" -lic 'PIN_APP_URL=<resolved-app-url> pinpoint' &
   ```
   Override the browser with `PIN_CHROME_PATH` and its profile dir with `PIN_CHROME_PROFILE` if needed. The overlay HTTP server listens on `:7331` (`PIN_PORT`).

   If the user ran `/pinpoint:setup`, the bridge reads `.pinpoint/config.json` for the driver and a
   **persistent** profile (logins persist); explicit `PIN_*` env vars still override it.

5. **Confirm the bridge is ready — poll `/health`, don't guess.** The bridge serves `GET /health → 200 { ok, appUrl, sessionId, project }` once Chrome is launched, the overlay is injected, and the server is listening. Wait for that 200 (a 404 on any other path is **not** readiness):
   ```bash
   curl --retry 30 --retry-delay 1 --retry-connrefused -fsS http://localhost:7331/health
   ```
   (Equivalently, the bridge prints `pinpoint bridge on <url> · session <id>` on stdout once ready.)

6. **Tell the user the loop:** in the Chrome window the bridge opened, use the overlay toolbar — **Pick** an element (or **Screenshot** a region), type a comment on each card, then click **Send**. The bridge copies a `pinpoint` JSON to their clipboard.

7. **Wait for the paste.** When the user pastes that JSON back into the chat, the `pinpoint-paste` skill takes over and applies each comment to its component.

## Notes
- Always resolve a concrete URL and pass it via `PIN_APP_URL` — never fall back to a built-in default silently. If you truly can't infer it, ask.
- Exit **127** on any launch = the toolchain isn't on PATH (see "Make the toolchain available first"); fix and retry.
- If `pinpoint` isn't found on PATH, the plugin bundle wasn't built — run `pnpm build` (or `pnpm --filter @pinpoint/claude-code build`) in the pinpoint repo.
- Don't guess edits before the user has picked + sent; wait for the pasted JSON.
- First time in a project? Suggest `/pinpoint:setup` once to pick the driver + a persistent profile;
  `/start` otherwise falls back to defaults (CDP, throwaway profile).
