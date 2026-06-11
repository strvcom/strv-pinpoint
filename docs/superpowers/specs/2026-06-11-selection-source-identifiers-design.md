# Enrich selection with source location + common identifiers (TASK-28)

## Problem
TASK-27's `Selection` carries `selector, tagName, text, react:{componentName,ancestry}|null`. Two
high-value, cheap-to-grep signals are missing: (1) the element's **source file:line** (so the agent
jumps straight to the line instead of grepping), and (2) **common DOM identifiers** (`id`,
`data-testid`, `aria-label`, `role`, `name`) — the fastest way to pin source.

## Goal (additive to TASK-27 — no contract restructure)
Extend `Selection` with:
- `identifiers`: DOM-derived, present regardless of React.
- `react.source`: `{ file, line }` parsed from the React fiber `_debugStack`; only meaningful when
  `react` is non-null. Absent gracefully in prod / non-React.

Because TASK-27 made the whole pipeline pass `selected[]` through opaquely
(`reducer`/`serialize`/`clipboard-payload` copy `it.selected` verbatim), **only the extractor, the
`Selection` type (two copies), and the `pinpoint-paste` skill change.** No reducer/serialize edits.

## The enriched `Selection` shape
```ts
interface Identifiers {            // only present keys are included; omit absent ones
  id?: string;
  testId?: string;                 // data-testid, falling back to data-test
  ariaLabel?: string;              // aria-label
  role?: string;
  name?: string;                   // the name attribute (form controls)
}
interface ReactInfo {
  componentName: string;
  ancestry: string[];
  source?: { file: string; line: number };  // omitted when not derivable
}
interface Selection {
  selector: string;
  tagName: string;
  text: string;
  identifiers: Identifiers;        // {} when the element has none
  react: ReactInfo | null;
}
```
- `identifiers` is **always an object** (possibly empty `{}`) for shape stability; the paste skill
  greps whatever keys are present. `testId` merges `data-testid` (preferred) and `data-test`.
- `react.source` is **optional** — present only when a file:line frame is derivable; `react` itself
  stays `null` for non-React DOM (so source can't exist there). This satisfies "degrade gracefully".

## Source parsing (verified live, React 19 + Vite)
The picked element's fiber `_debugStack.stack` is a multi-line string. For `#hero-heading` (an `<h1>`
inside `Hero`) it contains, after framework frames:
```
    at exports.jsxDEV (http://localhost:5184/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=…:192:83)
    at Hero (http://localhost:5184/src/App.tsx:7:20)        ← first APP-SOURCE frame
    at Object.react_stack_bottom_frame (…/react-dom_client.js?v=…:12867:12)
```
Algorithm (`sourceFromFiber`):
1. Read `fiber._debugStack` (string, or `_debugStack.stack`); if absent → no source.
2. Split into lines; for each, extract a trailing `(<url>:<line>:<col>)` or `at <url>:<line>:<col>`.
3. **Skip framework frames**: URL containing `/node_modules/` or `/.vite/`.
4. The **first remaining app-source frame** → `file = new URL(url).pathname` (strips origin + query
   → `/src/App.tsx`), `line = Number(<line>)`. Return `{ file, line }`.
5. None found → omit `source`.

This is best-effort and dev-only: in production builds `_debugStack` is absent, so `source` is
simply omitted — no error.

## Identifiers extraction (`identifiersOf`)
From the element's attributes (via `getAttribute`), include only present, non-empty values:
- `id` ← `id`
- `testId` ← `data-testid` ?? `data-test`
- `ariaLabel` ← `aria-label`
- `role` ← `role`
- `name` ← `name`
Returns `{}` when none present.

## Non-goals (explicit, per product owner — AC #3)
- **No XPath.**
- **No component props.**

## Touched units
| Unit | Change |
|---|---|
| `overlay/selection-probe.ts` | Add `identifiersOf(el)` + `sourceFromFiber(fiber)`; include `identifiers` (top-level) and `react.source` (when found) in the return. |
| `packages/core/src/types.ts` + `overlay/state/types.ts` | Extend the two `Selection` copies: add `identifiers`, add `source?` to the react object. Keep structurally identical. |
| `packages/claude-code/skills/pinpoint-paste/SKILL.md` | Document + use `selected[].react.source` (jump to file:line first) and `selected[].identifiers` (grep id/testId/aria-label/role/name) before falling back to componentName/text/selector. |

No change to `reducer.ts`, `serialize.ts`, `clipboard-payload.ts`, `save-screenshots.ts`,
`touched-selections.ts`, `OverlayRoot.tsx`, `Card.tsx`, `usePositioning.ts` — they handle
`selected[]`/`react` opaquely and the additions ride along.

## Testing
- **Unit (selection-probe.test.ts):**
  - `identifiersOf`: element with `id`+`data-testid`+`aria-label`+`role`+`name` → all mapped
    (`data-test` fallback covered); element with none → `{}`.
  - `sourceFromFiber`: a stubbed `_debugStack.stack` string with framework + app frames → returns the
    first app frame's `{ file: "/src/App.tsx", line: 7 }`; node_modules/.vite frames skipped; no
    stack → `source` omitted.
  - extractor integration: fiber-less element → `react: null`, `identifiers` still computed.
- **Live:**
  - React example (vite-react): pick `#hero-heading` → `react.source = { file: "/src/App.tsx", line: 7 }`,
    `identifiers.id = "hero-heading"`.
  - HTML/CSS example (non-React, TASK-26): pick an element with `data-testid`/`id` → `identifiers`
    populated, `react: null`, no `source`, no errors.

## Out of scope
Any overlay UX/visual change; the screenshot touched-stack algorithm (TASK-27); prod source maps.
