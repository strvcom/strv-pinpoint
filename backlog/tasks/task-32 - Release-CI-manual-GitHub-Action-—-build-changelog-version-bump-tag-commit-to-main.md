---
id: TASK-32
title: >-
  Release CI: manual GitHub Action — build, changelog, version bump, tag, commit
  to main
status: To Do
assignee: []
created_date: '2026-06-12 13:12'
updated_date: '2026-06-12 13:12'
labels:
  - ci
dependencies: []
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add the project's first CI: a manually-triggered (workflow_dispatch) Release workflow in .github/workflows/ that cuts a release end to end. It must: (1) build everything via pnpm build — crucially producing and COMMITTING the bundled plugin bridge packages/claude-code/bin/pinpoint, which is currently gitignored and absent from git, so a GitHub-installed plugin is broken until this lands (see docs/decisions.md + README publish discussion); (2) bump the version across root package.json and the relevant packages (packages/core, packages/claude-code, and packages/claude-code/.claude-plugin/plugin.json — plugin.json version drives update detection for installers); (3) regenerate/append a CHANGELOG containing ONLY changes to the production application (the shipped runtime under packages/), excluding dev nuance — docs/, backlog/, examples/, tests, tooling/config; (4) commit the build artifacts + version bumps + changelog to main and create a matching version tag. Decide the version-input mechanism (explicit input vs semver bump choice major/minor/patch) and how to scope 'production' changes (e.g. conventional-commit scopes, or path-filtered git log over packages/ excluding *.test.ts). Open questions to settle in the plan: monorepo versioning (lockstep vs independent), tag format (vX.Y.Z), and whether the binary is cross-platform enough to commit one artifact (Node esbuild bundle — see TASK-10). Brainstorm + write a plan before implementing; this is the repo's first workflow so there's no existing CI pattern to follow.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Manual workflow_dispatch Release workflow exists under .github/workflows/ (repo's first CI)
- [ ] #2 Workflow runs pnpm build and commits the bundled bridge packages/claude-code/bin/pinpoint (removed from .gitignore) so a GitHub-installed plugin works without a local build
- [ ] #3 Versions bumped in lockstep-or-decided across root package.json, packages/core, packages/claude-code, and packages/claude-code/.claude-plugin/plugin.json
- [ ] #4 CHANGELOG updated with only production-application changes (shipped runtime under packages/), excluding docs/backlog/examples/tests/tooling
- [ ] #5 Build artifacts + version bumps + changelog committed to main and a vX.Y.Z tag created on that commit
- [ ] #6 A plan exists in docs/superpowers/plans/ before implementation, settling version-input mechanism, monorepo versioning, tag format, and 'production change' scoping
<!-- AC:END -->
