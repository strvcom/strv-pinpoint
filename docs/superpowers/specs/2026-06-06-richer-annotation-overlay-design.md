# Richer Annotation Overlay (TASK-5) — Design

> Status: approved (brainstorm output). Next: writing-plans.
> Reference for features: `nicobailon/pi-annotate`. Builds on the v1 overlay
> (`packages/core/src/cdp/overlay-script.ts`) + extractor (`selection-probe.ts`).

## Goal

Upgrade the minimal Pick/Region overlay into a **multi-annotation** experience: the developer
picks several elements, types a **comment** on each ("make this bigger"), optionally flags a
screenshot, clicks **Send to Claude**, and their Claude session reads the whole batch via a new
`get_annotations` MCP tool and applies each comment to the right source file. Keeps the
dependency-free, CDP-injected, React-fiber-identity approach; no frontman server.

## Decisions (from brainstorm)

| Decision | Choice |
|---|---|
| MCP surface | **Add `get_annotations`**; keep `get_selection` (most-recent single) + `screenshot` unchanged |
| Ready semantics | Explicit **Send to Claude** → `ready=true`; editing/adding/removing flips `ready=false` |
| v1 features | multi-select + numbered badges · per-element comment note cards · per-annotation screenshot |
| Card UI | **Simple fixed panel** (no draggable cards / SVG connectors) |
| Deferred | ancestor cycling, draggable cards + connectors, MutationObserver edit-capture, auto box-model/a11y capture |

## Overlay v2

Injected via `injectBootstrap` (as today). Toolbar gains nothing new for modes (**Pick / Region /
Off** stay); Pick now **appends** an annotation per click instead of replacing. A **fixed side
panel** renders the annotation list + panel actions.

State on `window.__pinpointAnnotations`:
```
{ batchId: number, ready: boolean, items: Annotation[] }
```
where each `Annotation` is the extractor output plus annotation fields:
```
{ id, badge, componentName, ancestry[], selector, tagName, text, rect, comment, wantScreenshot }
```
- **Pick click** → run `__pinpointExtractSelection(el)`, append an item (`badge = items.length+1`),
  draw a persistent outline + numbered badge on the element, add a card, set `ready=false`.
- **Card**: badge · `componentName||tagName` label · comment `<textarea>` (updates `item.comment`,
  sets `ready=false`) · 📷 toggle (`item.wantScreenshot`) · ✕ remove (drops the item + its outline/badge,
  sets `ready=false`).
- **Panel actions**: **Send to Claude** → `ready=true`, `batchId++`. **Clear** → empty `items`,
  `ready=false`.
- Back-compat: also keep `window.__pinpointSelection` = the most-recent picked item (so
  `get_selection` is unchanged), and `window.__pinpointRegion` for ad-hoc region screenshots.
- ESC exits the active mode (as today). Idempotent install guard stays.

The extractor (`selection-probe.ts`) is unchanged and reused per pick.

## MCP surface

- **`get_annotations`** (new): reads `window.__pinpointAnnotations` via CDP.
  - Not `ready` (or empty) → single text block: "No submitted annotations — pick elements in the
    overlay, add a comment to each, then click Send to Claude."
  - `ready` → a `content` array. For each item, in badge order: a **text** block with
    `{ badge, componentName, ancestry, selector, tagName, text, comment }` (pretty JSON), and — only
    if `wantScreenshot` — an **image** block captured via the existing `capture()` (element by
    `selector`, falling back to `rect` clip). A leading text block states the batch size.
- **`get_selection`** and **`screenshot`**: unchanged.

## Bridge wiring (files)

- `packages/core/src/types.ts` — add `Annotation` and `AnnotationBatch` (`{ batchId, ready, items }`).
- `packages/core/src/cdp/overlay-script.ts` — rewrite to v2 (multi-annotation + panel + Send). Export
  `ANNOTATIONS_GLOBAL` + `ANNOTATIONS_PROBE` (alongside the existing `REGION_*`). Reuse
  `EXTRACT_SELECTION_FN`, `SELECTION_GLOBAL`.
- `packages/core/src/annotations/read-annotations.ts` — `readAnnotations(page): Promise<AnnotationBatch | null>`
  (evaluate `ANNOTATIONS_PROBE`; return null when absent/not-ready). (+ colocated test)
- `packages/core/src/tools/get-annotations.ts` — `getAnnotationsTool(deps)`: read the batch; build the
  content array; for `wantScreenshot` items capture directly via the page —
  `page.screenshotElement(selector)`, falling back to `page.screenshotClip(item.rect)` if no element
  matches; base64-encode into an image block (omit on null). (+ colocated test)
- `packages/core/src/server/register-tools.ts` — register `get_annotations` (no input).
- `.claude/skills/pinpoint/SKILL.md` + `README.md` — document the batch loop + the new tool.

## Data flow

1. Pick elements → each appended (badge + outline + card).
2. Type a comment per card; toggle 📷 where useful.
3. **Send to Claude** → batch `ready`.
4. User tells their Claude session "apply my annotations."
5. Claude → `get_annotations` → per item: grep `componentName` (disambiguate via `ancestry` + `text`),
   apply that card's `comment`, edit the file. Screenshots ground visual edits. HMR reloads.

## Error / edge handling

- Not-ready / empty batch → clear text guidance (above), not an error.
- `componentName: null` (e.g., RSC) → Claude falls back to `text` + `selector` + screenshot (same as today).
- `wantScreenshot` but the element isn't matchable/visible → omit the image, keep the text block with a note.
- Screenshots clip the current viewport (documented limitation); pick what's on screen.

## Testing

- **Unit (Vitest + `FakePage`):**
  - `read-annotations`: absent → null; present-but-`ready:false` → null; `ready:true` → the batch.
  - `get-annotations`: not-ready → guidance text; ready with 2 items → 2 text blocks (badge order);
    image block present only for the `wantScreenshot` item; null screenshot → graceful text-only.
- **Integration (live Chrome):** on `examples/vite-react` (or nextjs), set a 2-item
  `__pinpointAnnotations` (one `wantScreenshot:true`) with `ready:true`, call `get_annotations`,
  assert 2 text blocks with correct `componentName`s + exactly one image block.
- Overlay DOM glue (panel, cards, badges, Send) verified by integration + manual, as in v1.

## Out of scope (later)

Ancestor cycling, draggable cards + SVG connectors, MutationObserver edit/recording, auto
box-model/a11y context capture, region-as-annotation (regions stay a screenshot target).
