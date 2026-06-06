---
name: frontman-flow
description: Use when the user asks to change, fix, style, or edit element(s) they picked (or a region they captured) in the running dev app via the frontman-flow overlay — e.g. "make the selected heading bigger", "apply my annotations", "fix the spacing on what I clicked". Drives mcp__frontman-flow__get_annotations (a submitted batch with per-element comments), mcp__frontman-flow__get_selection (single pick), and mcp__frontman-flow__screenshot.
---

# frontman-flow: click-to-fix loop

The user is running their dev app in a Chrome the frontman-flow bridge controls, and has **picked an element** (or dragged a **region**) using the overlay's Pick/Region toolbar. Your job is to turn "change this" into a source edit.

## Which tool

- **Batch with comments** — the user picked several elements, typed a comment on each, and clicked **Send to Claude** (e.g. "apply my annotations", "do the changes I marked up"): use **`mcp__frontman-flow__get_annotations`** (see Batch mode below).
- **Single quick pick** — one element, instruction given in chat ("make the selected heading bigger"): use **`get_selection`** (Steps below).

## Steps (single pick)

1. **Read the selection.** Call `mcp__frontman-flow__get_selection`.
   - `status: "none"` → ask the user to click **Pick** in the overlay (bottom-right) and select an element, then retry. Don't guess.
   - `status: "selected"` → you get `{ componentName, ancestry, selector, tagName, text, rect }`.

2. **Locate the source.** Prefer the component identity:
   - Grep the repo for the component definition, e.g. `function <componentName>`, `const <componentName> =`, `class <componentName>`, or `export default function <componentName>`. Use `ancestry` (nearest-first) to disambiguate when a name is common.
   - If `componentName` is `null` (often a server component), fall back to the **visible `text`** (grep the literal string) and the `selector`/`tagName`; a `screenshot` helps you confirm you're editing the right element.

3. **See it (optional but recommended for visual changes).** Call `mcp__frontman-flow__screenshot` with `target: "selection"` (the picked element) or `"region"` (the drag-selected area) to ground spacing/color/layout edits in what's actually on screen. `"viewport"` or a CSS selector also work.

4. **Edit the real source file** with your normal Read/Edit tools, make the requested change, and let the dev server hot-reload. Confirm the file + change back to the user.

## Batch mode (multiple annotations)

When the user has submitted a batch (picked several elements, commented on each, clicked **Send to Claude**):

1. Call `mcp__frontman-flow__get_annotations`.
   - Guidance text ("No submitted annotations…") → the user hasn't sent yet; ask them to pick, comment, and click **Send to Claude**. Don't guess.
   - Otherwise you get one JSON text block per item `{ badge, componentName, ancestry, selector, tagName, text, comment }`, plus an embedded screenshot for items the user flagged with 📷.
2. For **each** item: the `comment` is the instruction. Locate its source the same way as a single pick (grep `componentName`, disambiguate via `ancestry`/`text`; fall back to `text`/`selector` + the screenshot when `componentName` is null), then apply that comment's change.
3. Work through every item; summarize the per-element edits back to the user. If a comment is empty, ask what they want for that one rather than guessing.

## Notes

- The selection is **identity, not a resolved file path** — you do the grep. That's deliberate (works across Next/Vite/RSC where source-maps don't).
- Screenshots clip the **current viewport**; if the user scrolled the target off-screen, ask them to scroll it back and re-pick.
- Keep edits scoped to what was asked; if the right file is ambiguous after grepping, show the candidates and ask rather than guessing.
