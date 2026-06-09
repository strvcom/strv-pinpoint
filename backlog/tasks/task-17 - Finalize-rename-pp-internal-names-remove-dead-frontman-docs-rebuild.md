---
id: TASK-17
title: 'Finalize rename: pp- internal names + remove dead frontman docs + rebuild'
status: To Do
assignee: []
created_date: '2026-06-09 16:57'
labels:
  - chore
dependencies: []
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tail of the pinpoint rename. (a) Rename internal ff- vestiges -> pp-: overlay CSS classes (ff-icon/active/pill/card/badge/confirm), the __ffHide style id (->__ppHide), the /tmp/ff-chrome profile path (->/tmp/pp-chrome), and ff-* test-fixture tmpdirs, across packages/core/src + scripts/dev.sh + README. (b) Delete the two dead bridge-to-frontman docs: START_HERE.md (obsolete original brief, references removed .reference machinery) + docs/superpowers/notes/phase0-frontman-contract.md (extracted upstream frontman API for the abandoned approach); update CLAUDE.md's START_HERE pointer. Keep the 2026-06-06 MVP plan + design spec (genesis record) and phase0-spike-findings (rationale). (c) Rebuild bin/dist from renamed source; gates green.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ff-/__ff renamed to pp-/__pp across src + dev.sh + README; overlay style string + className usages consistent
- [ ] #2 START_HERE.md + phase0-frontman-contract.md deleted; CLAUDE.md START_HERE pointer updated (no dangling ref)
- [ ] #3 pnpm build rebuilds bin/pinpoint + core dist from renamed source; gates green
<!-- AC:END -->
