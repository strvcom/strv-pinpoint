# TASK-24 — Animated sliding indicator behind tool toggles

Replace the `.pp-active` solid-background treatment on the Pick/Screenshot buttons with a
single animated pill that slides behind the active tool and floats in/out on select/deselect.

## Design (resolved from the ACs)
- **Slide between tools** (AC1): one indicator `<div>` that translates horizontally between the
  Pick (x=0) and Screenshot (x=TOOL_W+GAP) slots via a CSS `transform` transition.
- **Float in/out** (AC2): `opacity` + `scale` transition driven by `mode !== null`. Hidden
  (opacity 0, scaled down) when `mode === null`; floats in when a tool is chosen, out when
  deselected. Float-out happens **in place** at the last tool's slot (track last non-null mode).
- Lives entirely in the shadow-DOM CSS (`styles.ts` `OVERLAY_CSS`) + `Fab.tsx`. No host CSS.

## Geometry (deterministic, no layout measurement)
happy-dom doesn't compute layout, so positions are derived from constants, not `offsetWidth`:
- The two tool buttons get a fixed equal width `TOOL_W`, grouped in a `position:relative`
  `.pp-tools` flex container with gap `TOOL_GAP`.
- Indicator is `position:absolute` inside `.pp-tools`, behind the buttons (`z-index:0`; tool
  buttons `position:relative;z-index:1`). `translateX(0 | TOOL_W+TOOL_GAP)`.

## Steps (TDD)
- [ ] 1. Tests (Toolbar.test.tsx): with `fabOpen`, a `.pp-tool-indicator` exists; `opacity:0` when
      `mode=null`; `opacity:1` + `translateX(0px)` when `mode=pick`; `translateX` shifted when
      `mode=screenshot`; float-out-in-place (screenshot→null keeps the shifted X). Pick/Screenshot
      buttons keep their `pp-active` class for text color but no inline blue background.
- [ ] 2. `Fab.tsx`: group the two tool buttons in `.pp-tools` with the indicator; add `width` to
      `IconButton` for fixed-width tool buttons; derive indicator transform/opacity from `mode` +
      a last-non-null-mode ref.
- [ ] 3. `styles.ts`: drop `background:#2962ff` from `.pp-icon.pp-active` (keep `color:#fff`); add
      `.pp-tool-indicator` base + `transition:transform .2s ease, opacity .18s ease`.
- [ ] 4. `pnpm build` (regenerate `overlay-source.generated.ts`) + `pnpm typecheck && pnpm lint && pnpm test`.
- [ ] 5. Live-verify on examples/vite-react (AC3): orb → pick (pill floats in behind Pick) →
      screenshot (slides) → deselect (floats out); hover/active affordances intact; no console errors.

## Out of scope
Clear/Copy buttons unchanged. No change to Mode semantics (TASK-23 already made tools deselectable).
