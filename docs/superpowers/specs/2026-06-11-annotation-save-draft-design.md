# Annotation save/draft flow — not persisted until saved

**Task:** TASK-30
**Status:** Designed (approved 2026-06-11)

## Problem

Today a pick (or screenshot drag) immediately adds a **persisted** annotation: the card auto-opens,
Shift+Enter / click-away **minimizes** it, and Send copies **all** items. There's no notion of an
in-progress draft — every accidental pick lands in the clipboard payload, and there's no explicit
"commit this annotation" step.

## Goal

An explicit **Save** step. New annotations are **drafts** and are **not** included in the clipboard
payload until saved. Exactly one draft exists at a time; saved annotations accumulate.

## Design

### Data model
- `Item.saved: boolean`. `addElement` / `addScreenshot` create the item with `saved: false`
  (a draft). A new `saveItem` action sets `saved: true`.
- `serialize.ts` filters to `saved === true` — **drafts never enter the clipboard payload** (the
  literal "do not persist until saved"). This is the one piece that overlaps TASK-27's `serialize`
  rewrite; TASK-30 lands first.
- **One draft at a time** (across element + screenshot kinds): adding a new draft while an unsaved
  one exists discards the old one — silently if it has no comment text, otherwise gated by a
  confirm (see Pick-while-drafting).

### Draft card vs saved card
- **Draft** (`saved: false`):
  - Comment textarea + a **Save** button anchored **bottom-right** of the card.
  - **No minimize / close** controls.
  - A **trash** button discards the draft immediately (no confirm — it was never saved); **Escape**
    also discards it.
  - Clicking away does **not** minimize — the draft stays open until saved or discarded.
  - **Shift+Enter → Save** (replaces the old Shift+Enter→minimize binding; placeholder text
    updated).
- **Saved** (`saved: true`): today's controls — minimize, delete (with its confirm), and the camera
  toggle (element kind). Reopen via the numbered badge.
- **Save** (button or Shift+Enter) commits (`saved: true`) and then **collapses the card to its
  badge** (today's minimize/`closeCard` effect).

### Pick-while-drafting (confirm flow)
When a new pick/screenshot arrives while a draft is open:
- Draft has **no comment text** → discard it and open the new annotation.
- Draft **has text** → show a `ConfirmRow` ("Discard unsaved annotation?"). **Yes** discards the
  draft and opens the new annotation; **No** keeps the draft and ignores the new pick.

This is a stateful interaction, so it lives in `OverlayRoot` (a small "pending pick" state +
confirm), not the reducer. The reducer stays pure: it exposes `addElement`/`addScreenshot` (which
also drop any *empty* existing draft), `saveItem`, and `discardDraft`.

### Copy / Send
The Copy/Send control is unchanged in placement, but it **first saves the currently-open draft** (if
any), then copies the saved set (`serialize` already filters to saved). So Copy never silently drops
an in-progress draft — "Copy = save this draft, then send." (If the open draft is empty it is still
saved; it carries the selected element identity, comment optional.)

### Unaffected
- The `beforeunload` guard (TASK-29) already triggers on any item present (draft or saved) — no
  change needed.

## Units

| File | Change |
|---|---|
| `overlay/state/types.ts` | add `saved: boolean` to `Item`; add `saveItem` / `discardDraft` actions |
| `overlay/state/reducer.ts` | `addElement`/`addScreenshot` set `saved:false` + drop any empty existing draft; `saveItem` sets `saved:true` + collapses (open=false); `discardDraft` removes the unsaved item |
| `overlay/state/serialize.ts` | filter items to `saved === true` |
| `overlay/components/Card.tsx` | draft vs saved control sets; Save button (bottom-right); Shift+Enter→save; Escape→discard (draft); draft click-away no-op |
| `overlay/components/OverlayRoot.tsx` | pending-pick + confirm flow on pick-while-drafting-with-text; wire `saveItem`/`discardDraft`; Copy saves open draft first |

## Testing

- **Reducer** (unit): `addElement`/`addScreenshot` → `saved:false`; `saveItem` → `saved:true` +
  collapsed; `discardDraft` removes it; adding a draft over an **empty** draft replaces it.
- **serialize** (unit): drafts excluded; only `saved` items serialized; badge numbering over the
  serialized (saved) set is correct.
- **Card** (happy-dom): draft shows Save + no minimize/close; Shift+Enter triggers save; Escape
  discards; saved card shows the full controls.
- **OverlayRoot/flow** (happy-dom): pick-while-draft-empty replaces silently; pick-while-draft-with-
  text shows the confirm and only opens the new annotation on Yes; Copy saves the open draft first.
- Live check on the `vite-plain` example via the dev loop.

## Scope / non-goals

- Markdown formatting of the comment is **out of scope** — that's TASK-31 (sequenced after this).
- The clipboard contract shape (per-annotation identity) is unchanged here; TASK-27 reshapes it
  later. This task only changes **which** items serialize (saved only) + adds the `saved` field.
- One draft at a time (not multiple concurrent drafts).

## Risks

- The pick-while-drafting confirm is the subtle part (intercepting a pick to show a confirm before
  mutating state). Keeping it in `OverlayRoot` as an explicit pending-pick state (not the reducer)
  keeps the reducer pure and testable.
- `serialize` filtering interacts with badge numbering and `latestSelection`; tests cover that the
  numbering/selection reflect the saved set.
