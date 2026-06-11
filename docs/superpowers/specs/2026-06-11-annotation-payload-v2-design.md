# Annotation payload v2 — `selected[]` array of selection objects (TASK-27)

## Problem

The bridge contract carries element identity as **flat per-item fields**
(`componentName`, `ancestry`, `selector`, `tagName`, `text`). Two limits:

1. A screenshot annotation marks an *area*, often spanning several elements/components, but
   currently carries **no element identity at all** — `addScreenshot` hardcodes the flat fields to
   null/empty. The agent gets only a rect + a saved PNG, so it can't grep for the right source.
2. The flat shape can't express *multiple* elements per annotation, and isn't a clean base for
   TASK-28 (per-element source-location + identifiers).

## Goal

Restructure the contract so element/component identity lives under a single **`selected`** key:
an **array of `selection` objects**. Element picks yield exactly one selection; screenshots yield
the salient elements the region covers (outermost container + innermost leaf of each touched
stack). This is a deliberate **v2** of the contract (the current `serialize.ts` is marked
do-not-change); we **hard-cut** — no flat-field back-compat.

## The `selection` shape

```ts
interface Selection {
  selector: string;            // CSS selector (#id or short nth-of-type path)
  tagName: string;             // e.g. "BUTTON"
  text: string;                // trimmed innerText/textContent, ≤120 chars
  react: { componentName: string; ancestry: string[] } | null;  // null for plain DOM
}
```

- **Identity only — no `rect`.** The marked/region rect stays at the *item* level (used for
  badge/card anchoring + the saved screenshot clip); selections describe *what*, not *where*.
- `react` groups the fiber-derived fields and is **`null` when there is no React fiber** (plain
  HTML — see TASK-26's non-React fixture). Today's extractor returns `componentName`/`ancestry`
  flat; v2 nests them under `react` and sets `react: null` when `ancestry` is empty *and* no fiber
  was found.
- **Additive-extension contract (for TASK-28):** `Selection` is a flat, open object. TASK-28 adds
  optional `source` (file:line) and `identifiers` fields *to each selection* without restructuring.
  Consumers must ignore unknown keys.

## How `selected[]` is populated

### Element pick → exactly one selection
Unchanged hit path: `usePicker` → `document.elementFromPoint` → `__pinpointExtractSelection(el)` →
one `Selection`. `selected` has length 1.

### Screenshot region → outermost + innermost of each touched stack
New resolver runs when a region is committed (`useScreenshotRegion.onCapture`), before dispatch:

1. **Grid-sample `elementsFromPoint`** across the region (a coarse grid — e.g. ~5×5 points, clamped
   so tiny regions still sample their corners+center). Native hit-testing respects z-index /
   `overflow` / visibility, so we collect what's actually painted, not merely geometrically
   overlapping. Skip the overlay host (`[data-pinpoint]`) and any node it contains.
2. **Per sample point**, reduce its chain `[leaf … html]` to two endpoints:
   - **innermost** = the first real element (the leaf at that pixel).
   - **outermost** = the largest ancestor whose bounding rect is **fully inside the screenshot
     region**; if none qualifies (region smaller than the leaf), outermost = innermost.
   - *Tuning knob:* "fully inside" is the strict default. If live testing shows it skips a framing
     block that overflows the region by a few px, relax to "region covers ≥ 80% of the element's
     area." Start strict.
3. **Dedup by DOM node** across all sample points (union of innermosts + outermosts).
4. Map each kept element through `__pinpointExtractSelection` → its `Selection` (React-fiber-aware:
   each element gets its own `react` identity where a fiber exists — this is "the same top/bottom
   logic using React fiber elements where possible", achieved by reusing the one extractor).

**Meaning / scope:** `selected[]` for a screenshot is a **best-effort set of grep targets** — the
framing component(s) + the specific leaves the box covers — not a pixel-complete inventory. The
middle of each stack (layout-wrapper `div`/`section`) is intentionally dropped as noise.

**Worked example** — box around a card with a button + heading: points on the button →
`{button, div.card}`; points on the heading → `{h2, div.card}`; points on padding → `{div.card}`.
Deduped `selected[]` = `[div.card→Card, button→Button, h2]`.

## Data flow & affected units

| Unit | Change |
|---|---|
| `overlay/selection-probe.ts` | Extractor returns `{ selector, tagName, text, rect, react: {componentName, ancestry} \| null }` — `react` replaces the flat `componentName`/`ancestry`. `rect` stays in the **return** (the caller lifts it to `item.rect`) but is **not** part of `Selection`. |
| `overlay/hooks/useScreenshotRegion.ts` | New `resolveTouchedSelections(region)` helper (grid-sample + reduce + dedup + extract). `onCapture` passes `selected: Selection[]` alongside the rect. |
| `overlay/hooks/usePicker.ts` / `OverlayRoot.tsx` | Pick passes a one-element `selected` to `addElement`; screenshot passes the resolved `selected` to `addScreenshot`. |
| `overlay/state/types.ts` | `Item` drops flat `componentName/ancestry/selector/tagName/text`; gains `selected: Selection[]`. Keeps `rect`, `pageX/Y`, `comment`, `wantScreenshot`, `cardOffset`. New `Selection` type. Actions carry `selected`. |
| `overlay/state/reducer.ts` | `addElement` / `addScreenshot` store `selected`. |
| `overlay/state/serialize.ts` | `SerializedItem` drops flat fields, gains `selected: Selection[]`. **Bump `Snapshot`/payload `version` → 2.** Still no DOM access. |
| `overlay/components/Card.tsx` | Header label uses `item.selected[0]?.react?.componentName ?? item.selected[0]?.tagName ?? "screenshot"`. |
| `overlay/hooks/usePositioning.ts` | Live-rect lookup uses `item.selected[0]?.selector` (was `item.selector`); same `querySelector`-or-fallback-to-`item.rect` logic. |
| server `/send` (bridge-server) | Emits `selected[]` per item + `version: 2`; still appends `screenshot` path + `source`/`bridgeUrl`/`sessionId`/`promptId`. |
| `packages/claude-code/skills/pinpoint-paste/SKILL.md` | Read `version: 2` + `item.selected[]`: for each selection grep `react.componentName` (disambiguate with `react.ancestry`), else fall back to `text` + `selector`. Element item = one selection; screenshot item = several. |

**Note on the element `rect`:** the picked element's `rect` still feeds `item.rect` (badge/card
anchor + screenshot clip), so the extractor keeps returning `rect` for the *caller* to lift to the
item — it just no longer lives *inside* a `Selection`.

## Rect semantics (unchanged)
`item.rect` = the marked rect (picked element's rect, or the drag region for screenshots), live via
`vrect()` in serialize. `pageX/Y` for screenshots unchanged.

## Error handling / edge cases
- **No React fiber** (plain DOM, TASK-26 fixture): `react: null`, no throw. AC #4.
- **Empty grid hit** (region over blank space / only the overlay): `selected: []` is valid — the
  screenshot still carries its rect + PNG; the paste skill falls back to the image.
- **Region smaller than its leaf**: outermost = innermost (one selection).
- **Overlay host never appears** in `selected` (filtered).

## Testing
- **Unit (happy-dom, deterministic):**
  - extractor returns `react: null` for a fiber-less node; `react: {…}` when fibers are stubbed.
  - `resolveTouchedSelections`: with a stubbed `elementsFromPoint` + stubbed `getBoundingClientRect`,
    a `div.card > section > button` stack yields `[div.card, button]` (section dropped); dedup across
    points; region-smaller-than-leaf → single; blank region → `[]`.
  - reducer `addElement` (len 1) / `addScreenshot` (len n) store `selected`.
  - `serialize` emits `selected[]` + `version: 2`, no flat fields.
  - `Card` header label fallback chain.
- **Live (examples/vite-react + examples plain-HTML from TASK-26):** pick → 1 selection w/ React
  identity; screenshot over a card → container+leaves; screenshot on the plain-HTML page →
  selections with `react: null`. Verify via the real `/send` payload (`version:2`, `selected[]`).

## Out of scope
- Source-location + stable identifiers per selection (**TASK-28** — this spec only makes `Selection`
  ready to receive them).
- Any overlay UX/visual change (badges, cards, toolbar) beyond the Card header label source.
- Changing pick semantics or screenshot capture/clip geometry.
