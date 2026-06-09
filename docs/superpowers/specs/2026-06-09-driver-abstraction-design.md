# Design — Driver abstraction: pluggable browser-acquisition + capture, starting with CDP

**Date:** 2026-06-09
**Status:** Approved (brainstorm) → pending implementation plan
**Blocked on:** TASK-19 (overlay → testable TS modules) landing on `main`. This work does **not**
touch the overlay; it waits so the two don't collide.
**Resolves:** the dangling open item in `2026-06-08-plugin-clipboard-cdp-design.md` —
*"temp `--user-data-dir` (sterile, no logins) vs. an opt-in real profile."*

## Problem

How Pinpoint reaches the browser is hardwired to a single mechanism: the bridge launches its own
Chrome via CDP with a throwaway `--user-data-dir` (`/tmp/pp-chrome`) and injects the overlay
(`packages/core/src/cdp/connector.ts`). That one path causes three recurring frictions:

1. **No persisted session.** A throwaway profile means logging into the dev app every run.
2. **A second browser window.** A fresh Chrome pops on every run instead of working in a browser
   the developer already has open.
3. **Onboarding cost** and no path toward the developer's *real* browser — or, eventually, other
   browsers.

Two hard constraints shape the solution space:

- **Pixel-accurate region screenshots are critical** (confirmed). This rules out pure in-page
  injection (bookmarklet + `getDisplayMedia`): a per-session permission prompt and video-frame
  fidelity are unacceptable. Any mechanism must have real screenshot power — CDP's
  `Page.captureScreenshot`, or a future extension's `chrome.tabs.captureVisibleTab`.
- **The clipboard/compose flow stays.** The clipboard JSON (identity + comments + screenshot paths)
  is a value, not a workaround: the developer composes the pasted prompt with *other* images
  (designs, other systems) before sending. Delivery is out of scope here.

The unlock: **what varies between mechanisms is only the front half** — getting into the browser,
injecting the overlay, and capturing pixels. Persisting bytes to disk, the overlay UI, and the
clipboard payload are *shared* below all of them. Naming that seam is the whole design.

## What a "driver" is (and is not)

A **driver = how Pinpoint (1) acquires a browser/page, (2) injects the overlay, and (3) captures
pixel-accurate screenshots.** It is **not** how screenshots are saved — that (`bytes → file path`)
is shared bridge infrastructure, identical across drivers.

| Concern | Owner |
|---|---|
| Acquire browser/page; inject overlay; capture pixels | **Driver** (varies) |
| Persist screenshot bytes → cwd-relative path | **Shared bridge** |
| Overlay UI, picking, region drag, comments | **Shared** (in-page; owned by TASK-19) |
| Clipboard JSON shape + write | **Shared** (unchanged) |

## Goals

- **Driver interface** in `packages/core` (engine stays agent-agnostic). One uniform contract;
  the rest of the bridge depends on the interface, not on CDP.
- **CDP driver = driver #1.** Extract today's launch/attach/inject/capture logic behind the
  interface with **no behavior regression**. Ships immediately; zero new install.
- **Per-driver health check** — a function that attests the mechanism is available and returns
  actionable guidance when it is not (CDP: Chrome binary found + debug port reachable). Used by
  both `/pinpoint:setup` and `/pinpoint:start`.
- **`/pinpoint:setup` command** — run once per project: detect environment, select the driver, run
  its health check, **guide the developer through any install/setup**, and record the choice in a
  **gitignored config file**. The config exists *because* there is now a driver selection to
  persist — not before.
- **Persistent profile for the CDP driver**, replacing throwaway `/tmp/pp-chrome` → solves pain 1.
  With a persistent debug profile that stays open, subsequent runs **attach** to the same window
  (the connector already prefers an up CDP endpoint) → largely addresses pain 2 without a new
  mechanism.

## Non-goals (this stream)

- **Building the extension driver.** It is the designed-for driver #2 (developer's real browser,
  real profile, no window pop, pixel-accurate via `captureVisibleTab`) — but a separate stream.
  Documented here so the interface doesn't bake in CDP-only assumptions.
- **Touching the overlay internals** — TASK-19 owns that; we wait for it.
- **Changing the clipboard/compose flow** or delivery.
- **Multi-session discovery** and **container port-exposure** — documented as forward-looking
  constraints (below), not built here.

## Architecture

```
overlay (in-page, driver-agnostic) ──asks──▶ "captureRegion(rect) → bytes"
                                                    │
shared bridge (HTTP server, long-lived) ────────────┤  persists bytes → cwd-relative path
   /session/*/events|send|ack  + screenshot persist  │  writes clipboard JSON
                                                    ▼
                              ┌─────────────── Driver (interface) ───────────────┐
                              │ cdp  (driver #1, this stream)                     │
                              │ extension (driver #2, future)                     │
                              └───────────────────────────────────────────────────┘
```

**Driver interface (bridge-side contract):**

```
interface Driver {
  readonly name: string                              // "cdp" | "extension" | ...
  healthCheck(): Promise<HealthResult>               // available? + actionable guidance
  connect(opts): Promise<DriverSession>              // acquire browser/page, inject overlay
}
interface DriverSession {
  captureRegion(clip: Rect): Promise<Uint8Array>     // pixel-accurate bytes
  close(): Promise<void>
}
type HealthResult = { ok: true } | { ok: false; reason: string; remedy: string }
```

The bridge persists what `captureRegion` returns and owns the clipboard write — unchanged. For the
CDP driver, `captureRegion` is a Node-side `Page.captureScreenshot`. The future extension driver
will capture **browser-side** (`captureVisibleTab`) and push bytes through the bridge; the bridge
mediates. That asymmetry is noted in Open Items, not solved now.

**Config file (gitignored).** Created by `/pinpoint:setup`; records at minimum the selected
`driver`, plus driver knobs (e.g. CDP profile location, port). Exact filename/format resolved in
planning (e.g. `.pinpoint/config.json` or `pinpoint.config.json`); whatever the location, setup
**guarantees** it (and any in-repo profile dir) is gitignored.

**CDP profile location.** A persistent profile must live *somewhere*, and a Chrome profile holds
cookies/tokens — committing it would leak credentials. `/pinpoint:setup` lets the developer choose,
with a safe default:

- **Default — home dir, per-project:** `~/.pinpoint/profiles/<project>` — zero repo footprint,
  nothing to gitignore, per-project logins.
- **Opt-in — repo-local:** `.pinpoint/chrome` — self-contained, but setup **must** add the
  `.gitignore` entry (the footgun guard). This is the one case the gitignore step is load-bearing.

## Health check

Each driver self-reports availability so `/pinpoint:setup` and `/pinpoint:start` can fail early with
guidance instead of a deep stack trace:

- **CDP driver:** locate the Chrome binary across known per-platform paths (honor
  `PIN_CHROME_PATH`); confirm a debug endpoint can be opened/reached. On failure, return the
  per-platform paths + the `PIN_CHROME_PATH` override as `remedy`.
- **Extension driver (future):** report installed + connected; otherwise the remedy is the install
  link / load-unpacked steps.

## `/pinpoint:setup` flow

1. Detect environment (OS, available browsers, project type — reuse `/start`'s dev-URL inference).
2. Select the driver (default to CDP for now; the menu grows as drivers land).
3. Run the chosen driver's `healthCheck()`; if not `ok`, print the `remedy` and guide the install.
4. For the CDP driver, confirm the profile location (default home-dir, opt-in repo-local).
5. Write the gitignored config; if repo-local profile, ensure the `.gitignore` entry exists.
6. Print a one-line "ready — run `/pinpoint:start`".

`/pinpoint:start` reads the config; if absent, it falls back to today's defaults (CDP, throwaway
profile) so the tool still works with zero setup — setup is an *enhancement*, not a gate.

## Forward-looking constraints (documented, not built)

These are **not** in scope, but the interface and `/health` must not foreclose them:

- **The bridge is a long-lived, host-reachable server.** This is the elegant core: a Claude session
  inside a Docker container can expose the pinpoint port to the host, and the host browser still
  reaches it. Design implication: do **not** assume same-process / same-host coupling between the
  driver and the bridge. (Binding beyond `localhost` is a security decision deferred to that work.)
- **Multi-session discovery.** Two projects in parallel = two pinpoint servers on different ports.
  The browser side should discover services by scanning a **port range** and, on multiple matches,
  let the developer **select**. Design implication now: `/health` must advertise **project
  identity** (cwd / name) alongside `sessionId` so instances are distinguishable, and nothing in
  the CDP driver should hardcode a single-port assumption that blocks a future range scan.

## Data flow (CDP driver, behavior-preserving)

1. `/pinpoint:start` reads config (or defaults) → selects the CDP driver.
2. Driver `healthCheck()` → ok (else guidance).
3. Driver `connect()`: attach to an up CDP endpoint, else launch Chrome with the **persistent**
   profile + debug port + app URL; inject the overlay.
4. Overlay loads, connects `EventSource`; developer picks elements, comments, drags regions, Send.
5. For each flagged item the bridge calls `session.captureRegion(clip)`; persists bytes →
   `.pinpoint/<session>/<promptId>/<badge>.png`; builds clipboard JSON; writes the clipboard.
6. Developer pastes into Claude → paste skill applies edits → ack → overlay clears. (Unchanged.)

## Error handling

- **Driver unavailable** → surfaced by `healthCheck()` with `remedy`, before any connect attempt.
- **Chrome not found / launch fails** → per-platform paths + `PIN_CHROME_PATH` (existing behavior,
  now routed through the health check).
- **CDP connect** → bounded retry/backoff; clear timeout failure (existing).
- **Repo-local profile chosen but `.gitignore` not writable** → setup fails loudly rather than risk
  committing a credential-bearing profile.
- **Screenshot capture failure** → record `null` path for that badge, continue (existing).

## Testing

- **Unit:** the CDP driver behind the interface over a mocked `WebSocket` (connect, inject,
  `captureRegion` correlation); `healthCheck()` path resolution (mock `fs`/spawn — found vs
  missing); config read/write + gitignore-guarantee logic; setup driver-selection logic.
- **Integration (`packages/core/integration/`):** the existing Vite loop test, retargeted through
  the driver interface — asserts overlay injected, Send → expected clipboard JSON, PNGs on disk —
  proving the extraction is behavior-preserving. Add a persistent-profile case (profile dir
  reused/honored).
- **End-to-end (manual):** `/pinpoint:setup` in `examples/vite-react` (pick default profile) →
  `/pinpoint:start` → click + comment + Send → paste → edit lands → overlay clears; second run
  attaches to the same window with the session still logged in.

## Acceptance criteria

1. A `Driver` interface exists in `packages/core`; the bridge depends on the interface, not on CDP
   directly.
2. The CDP driver implements it with **no behavior regression** — the Vite integration loop passes
   unchanged in outcome.
3. Each driver exposes a `healthCheck()` returning actionable guidance on failure; `/start` and
   `/setup` both use it.
4. `/pinpoint:setup` selects a driver, runs its health check, guides any install, and writes a
   **gitignored** config; `/start` reads it and falls back to defaults when absent.
5. The CDP driver uses a **persistent** profile (default `~/.pinpoint/profiles/<project>`; opt-in
   repo-local with a guaranteed `.gitignore` entry); logins survive across runs.
6. `/health` advertises project identity (groundwork for multi-session discovery); no single-port
   assumption is baked into the driver.
7. `pnpm typecheck && pnpm lint && pnpm test` pass.

## Phasing (input to the implementation plan)

Independently shippable, separately committed:

- **P1 — Driver seam + CDP extraction.** Define the interface; move today's logic behind it; add
  the CDP `healthCheck()`. No behavior change; integration loop unchanged in outcome.
- **P2 — Setup + config + persistent profile.** `/pinpoint:setup`, the gitignored config,
  profile-location choice with the safe default + gitignore guard, persistent CDP profile, `/start`
  reads config. Advertise project identity on `/health`.

Out of this stream (future cards): the **extension driver** (driver #2), **multi-session
discovery**, **container port-exposure**.

## Open items (resolve during planning)

- **Config filename/format/location** and how `/start` discovers it.
- **Capture asymmetry** for the future extension driver (Node-side `captureScreenshot` vs
  browser-side `captureVisibleTab` pushed through the bridge) — confirm the interface accommodates
  both without rework when that driver lands.
- **Per-project namespacing** of the home-dir profile (name vs path hash) to avoid collisions.
- **Interaction with TASK-19's** rebuilt overlay bundle — confirm injection wiring still matches
  once it lands.
