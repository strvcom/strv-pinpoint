# Release CI — manual GitHub Action (build, changelog, version bump, tag) — design

**Task:** TASK-32 · **Date:** 2026-06-12 · **Status:** approved (brainstorm)

## Goal

Give the project its first CI: a **manually triggered** GitHub Action that cuts a release
end-to-end so a public GitHub install of the plugin works and carries a real version. One run:
validates, builds, bumps versions in lockstep, regenerates a user-facing changelog, commits the lot
to `main`, tags it, and publishes a GitHub Release.

This is the publish enabler. It also lands the companion fix that unblocks distribution: the bundled
bridge binary (`packages/claude-code/bin/pinpoint`) is currently gitignored, so a GitHub-installed
plugin is broken until the binary is committed (Claude Code copies the repo as-is and runs no build).

## Decisions (settled in brainstorm)

| Decision | Choice |
|---|---|
| Monorepo versioning | **Lockstep** — one version everywhere |
| Version input | `workflow_dispatch` input `bump` = `patch \| minor \| major` |
| Changelog scope | **Conventional-commit type filter** — keep `feat` / `fix` / `perf` / `revert` only |
| Release artifact | **GitHub Release + tag** (`vX.Y.Z`), release notes = the new changelog section |
| First release | **Single "Initial release" entry**, not a full-history dump |
| Baseline | **Align all to `0.0.0`**; workflow authors the first real version (minor → `0.1.0`) |
| npm publish | **Out of scope** — distribution is the GitHub plugin marketplace; top packages are `private` |

## Single source of truth

Root `package.json` `version` is the canonical version. The workflow reads it, applies the `bump`,
and writes the result to **all four** version sites in lockstep:

- `package.json` (root) — add a `version` field (currently absent)
- `packages/core/package.json`
- `packages/claude-code/package.json`
- `packages/claude-code/.claude-plugin/plugin.json` — **the one installers read**: bumping it is
  what tells Claude Code an update exists.

**Baseline alignment (one-time, part of this task, committed before the first run):** set all four
to `0.0.0`. plugin.json is currently `0.1.0`; reset it to `0.0.0` so no version is implied to have
shipped. After this, the first dispatch with `minor` produces `0.1.0` as the first tag/release.

## Workflow: `.github/workflows/release.yml`

Trigger: `workflow_dispatch` with input `bump` (choice: `patch` | `minor` | `major`, default
`patch`). `permissions: contents: write` (needs to push commits/tags and create the Release).

Steps, in order — **fail-fast; a red step aborts the release before any version is written:**

1. **Checkout** with `fetch-depth: 0` (full history + tags needed for changelog range).
2. **Toolchain** — Node 20, pnpm, `pnpm install --frozen-lockfile`.
3. **Validate** — `pnpm typecheck && pnpm lint && pnpm test`. No release from a red tree.
4. **Build** — `pnpm build` → produces `packages/claude-code/bin/pinpoint`.
5. **Compute version** — read root `version`, apply `bump` → `X.Y.Z`.
6. **Bump in lockstep** — write `X.Y.Z` to the four sites above.
7. **Changelog** — generate the new section (see below), prepend to `CHANGELOG.md` at repo root
   (create if absent).
8. **Commit + tag** — stage the four version files, `bin/pinpoint`, and `CHANGELOG.md`; commit as
   `chore(release): vX.Y.Z`; create annotated tag `vX.Y.Z`; push commit + tag to `main`.
9. **GitHub Release** — create a Release for tag `vX.Y.Z`, body = the new changelog section.

## Changelog generation

- **Range:** `<previous-tag>..HEAD`. If no previous tag exists (first release), do **not** walk all
  history — emit a single curated section (e.g. `Initial public release.`).
- **Commits considered:** `git log --no-merges` (the repo uses merge commits; the conventional
  metadata lives on the feature commits, so merges are skipped to avoid duplicates).
- **Filter:** keep only subjects whose conventional type is `feat`, `fix`, `perf`, or `revert`.
  Drop `docs`, `chore`, `build`, `refactor`, `test`, `ci`, `style`. This is the "production
  application changes only" rule, leaning on the project's existing commit discipline.
- **Formatting:** strip the trailing `(TASK-N)` suffix; group entries under headings
  **Features** (`feat`), **Bug Fixes** (`fix`), **Performance** (`perf`), **Reverts** (`revert`),
  omitting empty groups. Section header: `## X.Y.Z — YYYY-MM-DD`.
- Newest section prepended to the top of `CHANGELOG.md`.

## Components / boundaries

Keep the workflow thin; push logic that benefits from testing into a small script:

- **`.github/workflows/release.yml`** — orchestration only (checkout, toolchain, ordering,
  permissions, the `gh release` call). No business logic inline beyond wiring.
- **A version/changelog helper** (e.g. `scripts/release/` — Node, no new deps, in keeping with the
  repo's zero-extra-dep stance) doing the testable parts: semver bump, writing the four version
  sites, and building the changelog section from `git log` output. Unit-testable in isolation
  (TDD): given a current version + bump → next version; given a list of commit subjects → grouped,
  filtered, suffix-stripped changelog markdown.
- **`.gitignore`** — drop the `packages/claude-code/bin/pinpoint` line.
- **Baseline version files** — the four sites set to `0.0.0`.

## Testing

- Unit tests (colocated with the helper) for: semver bump (each keyword, incl. `0.0.0` baseline →
  `0.1.0` on minor), changelog filtering (only feat/fix/perf/revert survive), `(TASK-N)` stripping,
  grouping, and the no-prior-tag "initial release" path.
- The workflow itself is validated by a real dispatch once the repo is on GitHub (can't be unit
  tested); the helper carries the logic that *can* be tested locally.

## Risks / preconditions (flagged, not blocking)

- **Pushing to `main` from CI** requires `permissions: contents: write`. If branch protection is
  later added to `main`, the push step needs an exception or a dedicated PAT.
- **No remote today** — the repo is local-only. This workflow does nothing until the repo is pushed
  to GitHub; that push is the actual "publish" step (the broader effort this task serves).
- **Binary portability** — `bin/pinpoint` is a Node/esbuild bundle (not a native binary), so a single
  committed artifact runs anywhere the user's Node runs. If native bits are ever introduced, the
  single-artifact assumption breaks (note in README Limitations — out of scope here).

## Out of scope

- `npm publish` / registry distribution.
- Independent per-package versioning and per-package changelogs.
- Auto-trigger on push/merge (manual dispatch only, by request).
- CI for PR validation (typecheck/lint/test on PRs) — a separate future stream if wanted.
