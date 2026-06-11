# Selection source + identifiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Additively enrich `Selection` with DOM `identifiers` and `react.source` (file:line from the fiber `_debugStack`), updating only the extractor, the `Selection` type (two copies), and the paste skill.

**Architecture:** TASK-27 made the pipeline pass `selected[]` through opaquely, so reducer/serialize/clipboard-payload need no change. The extractor computes the new fields; the types describe them; the paste skill consumes them.

**Tech Stack:** TypeScript, Vitest + happy-dom, esbuild overlay bundle. Commands: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`; vitest from worktree ROOT; commit with `git -c core.hooksPath=/dev/null commit` ending the body with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Spec:** `docs/superpowers/specs/2026-06-11-selection-source-identifiers-design.md`

**Worktree root:** `/Users/lucas/code/repo/strv/open-source/pinpoint/.claude/worktrees/task-28--selection-source-identifiers`

---

## Task 1: Extractor enrichment + Selection type + unit tests

**Files:**
- Modify: `packages/core/src/types.ts` (`Selection`)
- Modify: `packages/core/src/overlay/state/types.ts` (`Selection`)
- Modify: `packages/core/src/overlay/selection-probe.ts`
- Test: `packages/core/src/overlay/selection-probe.test.ts`

- [ ] **Step 1: Extend the two `Selection` types**

In BOTH `packages/core/src/types.ts` and `packages/core/src/overlay/state/types.ts`, change `Selection` to:
```ts
export interface Selection {
  selector: string;
  tagName: string;
  text: string;
  identifiers: {
    id?: string;
    testId?: string;
    ariaLabel?: string;
    role?: string;
    name?: string;
  };
  react: {
    componentName: string;
    ancestry: string[];
    source?: { file: string; line: number };
  } | null;
}
```
(Keep the two copies structurally identical — they mirror each other across the overlay/wire boundary, like `Rect`.)

- [ ] **Step 2: Write failing tests** in `packages/core/src/overlay/selection-probe.test.ts`

Add tests (keep existing ones):
```ts
it("identifiers: maps id, data-testid, aria-label, role, name when present", () => {
  installSelectionProbe();
  const el = document.createElement("button");
  el.id = "save-btn";
  el.setAttribute("data-testid", "save");
  el.setAttribute("aria-label", "Save");
  el.setAttribute("role", "button");
  el.setAttribute("name", "saveField");
  document.body.appendChild(el);
  const r = (window as any).__pinpointExtractSelection(el);
  expect(r.identifiers).toEqual({ id: "save-btn", testId: "save", ariaLabel: "Save", role: "button", name: "saveField" });
});

it("identifiers: data-test is used when data-testid absent; empty object when none", () => {
  installSelectionProbe();
  const a = document.createElement("div");
  a.setAttribute("data-test", "legacy");
  document.body.appendChild(a);
  expect((window as any).__pinpointExtractSelection(a).identifiers).toEqual({ testId: "legacy" });

  const b = document.createElement("span");
  document.body.appendChild(b);
  expect((window as any).__pinpointExtractSelection(b).identifiers).toEqual({});
});

it("react.source: parses first app-source frame from the fiber _debugStack (skips node_modules/.vite)", () => {
  installSelectionProbe();
  const el = document.createElement("h1");
  const stack = [
    "Error: react-stack-top-frame",
    "    at exports.jsxDEV (http://localhost:5184/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=abc:192:83)",
    "    at Hero (http://localhost:5184/src/App.tsx:7:20)",
    "    at react_stack_bottom_frame (http://localhost:5184/node_modules/.vite/deps/react-dom_client.js?v=def:12867:12)",
  ].join("\n");
  // stub a minimal fiber on the element
  (el as any).__reactFiber$test = { type: { name: "Hero" }, return: null, _debugStack: { stack } };
  document.body.appendChild(el);
  const r = (window as any).__pinpointExtractSelection(el);
  expect(r.react).not.toBeNull();
  expect(r.react.source).toEqual({ file: "/src/App.tsx", line: 7 });
});

it("react.source: omitted when no _debugStack; react stays null for fiber-less DOM (identifiers still present)", () => {
  installSelectionProbe();
  const noStack = document.createElement("div");
  (noStack as any).__reactFiber$test = { type: { name: "Comp" }, return: null };
  document.body.appendChild(noStack);
  const r1 = (window as any).__pinpointExtractSelection(noStack);
  expect(r1.react).not.toBeNull();
  expect(r1.react.source).toBeUndefined();

  const plain = document.createElement("div");
  plain.id = "plain";
  document.body.appendChild(plain);
  const r2 = (window as any).__pinpointExtractSelection(plain);
  expect(r2.react).toBeNull();
  expect(r2.identifiers).toEqual({ id: "plain" });
});
```
> Note: the existing test stubs a fiber via a `__reactFiber$…` key; match that exact pattern. The `nameOf`/ancestry walk in the extractor will set `react.componentName` from the stub's `type.name`.

- [ ] **Step 3: Run, verify fail** — `pnpm exec vitest run src/overlay/selection-probe` → FAIL (`identifiers`/`source` undefined).

- [ ] **Step 4: Implement in `selection-probe.ts`**

Inside `__pinpointExtractSelection`, before the final `return`, add two helpers and compute the values:
```ts
    // Common, highly-greppable DOM identifiers (TASK-28). Only present keys are included.
    var identifiersOf = function (node: Element) {
      var out: Record<string, string> = {};
      var id = node.id;
      if (id) out.id = id;
      var testId = node.getAttribute("data-testid") || node.getAttribute("data-test");
      if (testId) out.testId = testId;
      var aria = node.getAttribute("aria-label");
      if (aria) out.ariaLabel = aria;
      var role = node.getAttribute("role");
      if (role) out.role = role;
      var nm2 = node.getAttribute("name");
      if (nm2) out.name = nm2;
      return out;
    };

    // Source file:line from the element fiber's _debugStack (TASK-28). Dev-only; omitted otherwise.
    var sourceFromFiber = function (fiber: any) {
      var stackStr = fiber && fiber._debugStack && (fiber._debugStack.stack || fiber._debugStack);
      if (typeof stackStr !== "string") return undefined;
      var lines = stackStr.split("\n");
      for (var i = 0; i < lines.length; i++) {
        var m = lines[i].match(/(https?:\/\/[^\s()]+):(\d+):(\d+)\)?\s*$/);
        if (!m) continue;
        var url = m[1];
        if (url.indexOf("/node_modules/") >= 0 || url.indexOf("/.vite/") >= 0) continue;
        try {
          return { file: new URL(url).pathname, line: Number(m[2]) };
        } catch (_e) {
          return undefined;
        }
      }
      return undefined;
    };
```
Then change the `react` construction + return:
```ts
    var react: {
      componentName: string;
      ancestry: string[];
      source?: { file: string; line: number };
    } | null = ancestry.length > 0 ? { componentName: ancestry[0], ancestry: ancestry.slice(0, 8) } : null;
    if (react) {
      var src = sourceFromFiber(f);
      if (src) react.source = src;
    }
    var r = el.getBoundingClientRect();
    return {
      selector: selectorFor(el),
      tagName: el.tagName,
      text: ((el as any).innerText || el.textContent || "").trim().slice(0, 120),
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      identifiers: identifiersOf(el),
      react: react,
    };
```
(Replace the existing `var react = …` + `return {…}` block. `rect` stays in the return for the caller.)

- [ ] **Step 5: Run, verify pass** — `pnpm exec vitest run src/overlay/selection-probe` → PASS, then `pnpm typecheck` → clean.

- [ ] **Step 6: Commit**
```bash
git add packages/core/src/types.ts packages/core/src/overlay/state/types.ts packages/core/src/overlay/selection-probe.ts packages/core/src/overlay/selection-probe.test.ts
git -c core.hooksPath=/dev/null commit -m "feat(overlay): selection identifiers + react.source file:line (TASK-28)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: pinpoint-paste skill + build + live verify

**Files:**
- Modify: `packages/claude-code/skills/pinpoint-paste/SKILL.md`
- (verification only) regenerate bundle

- [ ] **Step 1: Update SKILL.md**

Update the example JSON so a `selected[]` entry shows the new fields, e.g.:
```json
"selected": [{ "selector": "#hero-heading", "tagName": "H1", "text": "…",
  "identifiers": { "id": "hero-heading" },
  "react": { "componentName": "Hero", "ancestry": ["Hero","App"], "source": { "file": "/src/App.tsx", "line": 7 } } }]
```
In step 3 (locate the source), prepend the cheaper signals before the componentName grep:
> - If `react.source` is present, open `{file}` at `{line}` directly — that's the element's source location.
> - Else use `identifiers` (grep `id`, `testId`/`data-testid`, `aria-label`, `role`, `name`) — these pin source fastest.
> - Else grep `react.componentName` (disambiguate via `react.ancestry`); else fall back to `text` + `selector`.

- [ ] **Step 2: Build + gates**
```bash
pnpm --filter @pinpoint/core build   # regenerate overlay-source.generated.ts
pnpm typecheck && pnpm lint && pnpm test
git add packages/core/src/cdp/overlay-source.generated.ts packages/claude-code/skills/pinpoint-paste/SKILL.md
git -c core.hooksPath=/dev/null commit -m "feat: pinpoint-paste reads source/identifiers + regenerate bundle (TASK-28)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: Live verify (controller does this)**
  - **React (vite-react):** inject overlay, `__pinpointExtractSelection(document.querySelector('#hero-heading'))` → assert `identifiers.id === "hero-heading"` and `react.source` = `{ file: "/src/App.tsx", line: <n> }`.
  - **Non-React (vite-plain):** inject overlay on the plain HTML page, extract an element with an `id`/`data-testid` → `identifiers` populated, `react === null`, no `source`, no errors.

- [ ] **Step 4: Confirm ACs** #1 identifiers; #2 source file:line + graceful absence; #3 no XPath/props (verify the extractor adds neither); #4 contract+probe+skill + both examples.

---

## Notes
- Additive only — do NOT touch reducer/serialize/clipboard-payload/save-screenshots/touched-selections/OverlayRoot/Card.
- Keep the two `Selection` copies identical.
- `react.source` rides inside the existing `react` object, so it's `null`-gated for non-React automatically.
