---
description: One-time per-project setup — pick how Pinpoint reaches the browser, verify it's available, and record a gitignored config + persistent profile.
---

# Set up pinpoint

Run this once per project. It selects the browser **driver**, verifies the mechanism is available
(a health check), and writes a gitignored `.pinpoint/config.json` plus a persistent Chrome profile
so logins survive across runs. `/pinpoint:start` reads this; without it, start falls back to
defaults (CDP driver, throwaway profile).

## Steps

1. **Ensure the toolchain is on PATH** (same as `/pinpoint:start`): prefer launching through the
   login shell `"${SHELL:-bash}" -lic '<command>'`. Exit 127 = PATH problem.

2. **Choose where the persistent Chrome profile lives.** Ask the user:
   - **home** (default) — `~/.pinpoint/profiles/<project>`: zero repo footprint, nothing to commit.
   - **repo** — `<project>/.pinpoint/chrome`: self-contained; the profile holds cookies/tokens, so
     setup will ensure `.pinpoint/` is gitignored (never commit it).

3. **Run setup** through the login shell with the chosen mode:
   ```bash
   "${SHELL:-bash}" -lic 'pinpoint setup --profile-mode home'   # or: --profile-mode repo
   ```
   It runs the CDP driver's health check first. On failure it prints an actionable remedy
   (install Chrome / set `PIN_CHROME_PATH`) and exits non-zero — relay that to the user and stop.

4. **Confirm** it printed `wrote <cwd>/.pinpoint/config.json` and that `.pinpoint/` is in
   `.gitignore`. Tell the user they can now run `/pinpoint:start`.

## Notes
- Setup is an enhancement, not a gate — `/pinpoint:start` works with zero setup using defaults.
- Re-running setup is safe and idempotent (it overwrites the config and is a no-op on `.gitignore`).
