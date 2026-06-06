---
name: frontman-flow
description: Use when the user asks to change, fix, style, or edit an element they have selected/picked (or a region they captured) in the running dev app via the frontman-flow overlay — e.g. "make the selected heading bigger", "fix the spacing on what I clicked", "change the picked button's label". Drives the mcp__frontman-flow__get_selection and mcp__frontman-flow__screenshot tools.
---

# frontman-flow: click-to-fix loop

The user is running their dev app in a Chrome the frontman-flow bridge controls, and has **picked an element** (or dragged a **region**) using the overlay's Pick/Region toolbar. Your job is to turn "change this" into a source edit.

## Steps

1. **Read the selection.** Call `mcp__frontman-flow__get_selection`.
   - `status: "none"` → ask the user to click **Pick** in the overlay (bottom-right) and select an element, then retry. Don't guess.
   - `status: "selected"` → you get `{ componentName, ancestry, selector, tagName, text, rect }`.

2. **Locate the source.** Prefer the component identity:
   - Grep the repo for the component definition, e.g. `function <componentName>`, `const <componentName> =`, `class <componentName>`, or `export default function <componentName>`. Use `ancestry` (nearest-first) to disambiguate when a name is common.
   - If `componentName` is `null` (often a server component), fall back to the **visible `text`** (grep the literal string) and the `selector`/`tagName`; a `screenshot` helps you confirm you're editing the right element.

3. **See it (optional but recommended for visual changes).** Call `mcp__frontman-flow__screenshot` with `target: "selection"` (the picked element) or `"region"` (the drag-selected area) to ground spacing/color/layout edits in what's actually on screen. `"viewport"` or a CSS selector also work.

4. **Edit the real source file** with your normal Read/Edit tools, make the requested change, and let the dev server hot-reload. Confirm the file + change back to the user.

## Notes

- The selection is **identity, not a resolved file path** — you do the grep. That's deliberate (works across Next/Vite/RSC where source-maps don't).
- Screenshots clip the **current viewport**; if the user scrolled the target off-screen, ask them to scroll it back and re-pick.
- Keep edits scoped to what was asked; if the right file is ambiguous after grepping, show the candidates and ask rather than guessing.
