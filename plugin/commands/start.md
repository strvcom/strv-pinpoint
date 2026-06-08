---
description: Start the frontman-flow bridge and run the click-to-fix loop against your running dev app.
---

# Start frontman-flow

Bring up the overlay loop so the user can click elements in their dev app and have you edit the source.

## Steps

1. **Confirm the dev app URL.** Ask the user for their dev server URL if you don't know it (default `http://localhost:5173`). It must already be running.
2. **Launch the bridge in the background.** This plugin ships a `frontman-flow` executable on your PATH; it talks raw CDP and launches Chrome itself (or attaches to a debug Chrome already on `:9222`). Run it backgrounded, pointed at the app:
   ```bash
   FF_APP_URL=<app-url> frontman-flow &
   ```
   Override the browser with `FF_CHROME_PATH` and its profile dir with `FF_CHROME_PROFILE` if needed. The overlay HTTP server listens on `:7331` (`FF_PORT`).
3. **Tell the user the loop:** in the Chrome window the bridge opened, use the overlay toolbar — **Pick** an element (or **Screenshot** a region), type a comment on each card, then click **Send**. The bridge copies a `frontman-flow` JSON to their clipboard.
4. **Wait for the paste.** When the user pastes that JSON back into the chat, the `frontman-flow-paste` skill takes over and applies each comment to its component.

## Notes
- If `frontman-flow` isn't found on PATH, the plugin bundle wasn't built — run `pnpm build:plugin` (or `pnpm build`) in the frontman-flow repo.
- Don't guess edits before the user has picked + sent; wait for the pasted JSON.
