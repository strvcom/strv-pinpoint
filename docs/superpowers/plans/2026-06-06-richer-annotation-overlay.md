# Richer Annotation Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the single-selection overlay into a multi-annotation experience (pick N elements, comment on each, optional per-item screenshot, Send to Claude) exposed via a new `get_annotations` MCP tool, keeping `get_selection` + `screenshot` unchanged.

**Architecture:** Overlay v2 (injected vanilla JS) maintains an annotation list on `window.__frontmanFlowAnnotations = { batchId, ready, items }`; a new `get_annotations` tool reads it over CDP and returns a text block per item plus an embedded CDP screenshot for flagged items. TDD for the TS units against `FakePage`; the overlay DOM glue is verified by an integration test + manual.

**Tech Stack:** Node 20+ (from nvm: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`), pnpm, TypeScript (NodeNext ESM, `.js` imports), Vitest (colocated), Playwright/CDP, `@modelcontextprotocol/sdk`. Gates: Biome + Lefthook + typecheck (the `(0,eval)` Biome override exists only for `playwright-page.ts`).

**Branch:** `task-5--richer-overlay` (already created; TASK-5 In Progress).

---

## File Structure
```
packages/core/src/
  types.ts                      # + Annotation, AnnotationBatch              (Task 1)
  cdp/overlay-script.ts         # rewrite v2; + ANNOTATIONS_GLOBAL/PROBE       (Task 2)
  annotations/read-annotations.ts (+test)                                     (Task 3)
  tools/get-annotations.ts        (+test)                                     (Task 4)
  server/register-tools.ts      # register get_annotations (update test)      (Task 5)
  integration/annotations.integration.test.ts                                 (Task 6)
.claude/skills/frontman-flow/SKILL.md ; README.md  # document the batch loop  (Task 7)
```

## Task 1: Types
**Files:** Modify `packages/core/src/types.ts`

- [ ] **Step 1: Add the types** (append after `CapturedImage`):
```ts
export interface Annotation {
  id: string;
  badge: number;
  componentName: string | null;
  ancestry: string[];
  selector: string;
  tagName: string;
  text: string;
  rect: Rect;
  comment: string;
  wantScreenshot: boolean;
}

export interface AnnotationBatch {
  batchId: number;
  ready: boolean;
  items: Annotation[];
}
```
- [ ] **Step 2:** `pnpm typecheck` → clean.
- [ ] **Step 3:** Commit: `git add packages/core/src/types.ts && git commit -m "feat(core): Annotation + AnnotationBatch types"`

## Task 2: Overlay v2
**Files:** Rewrite `packages/core/src/cdp/overlay-script.ts`

No unit test (DOM/in-page glue; verified by Task 6 + manual). After writing, verify it parses (`new Function(OVERLAY_SOURCE)`).

- [ ] **Step 1: Replace the file with the v2 source:**
```ts
import { EXTRACT_SELECTION_FN, SELECTION_GLOBAL } from "./selection-probe.js";

export const REGION_GLOBAL = "__frontmanFlowRegion";
export const REGION_PROBE = `window.${REGION_GLOBAL} ?? null`;
export const ANNOTATIONS_GLOBAL = "__frontmanFlowAnnotations";
export const ANNOTATIONS_PROBE = `window.${ANNOTATIONS_GLOBAL} ?? null`;

/**
 * Injected overlay (v2). Pick appends an annotation per click; a fixed panel shows a card per
 * annotation (comment textarea + 📷 toggle + ✕). "Send to Claude" marks the batch ready. State on
 * window.__frontmanFlowAnnotations = { batchId, ready, items }. window.__frontmanFlowSelection keeps
 * the most-recent pick (get_selection unchanged); window.__frontmanFlowRegion keeps the drag region.
 * DOM glue — verified by integration/manual, not unit tests.
 */
export const OVERLAY_SOURCE = `
${EXTRACT_SELECTION_FN}
(() => {
  if (window.__frontmanFlowOverlayInstalled) return;
  window.__frontmanFlowOverlayInstalled = true;
  var Z = 2147483640;
  var state = { mode: null, items: [], ready: false, batchId: 0, nextId: 1 };
  var sendBtn = null;

  var hover = document.createElement('div');
  var marquee = document.createElement('div');
  [hover, marquee].forEach(function (d) { d.style.cssText = 'position:fixed;pointer-events:none;z-index:' + Z + ';border:2px solid #4f8cff;background:rgba(79,140,255,.12);display:none'; document.documentElement.appendChild(d); });
  marquee.style.borderStyle = 'dashed';
  var place = function (d, r) { d.style.left = r.x + 'px'; d.style.top = r.y + 'px'; d.style.width = r.width + 'px'; d.style.height = r.height + 'px'; };
  var show = function (d, r) { d.style.display = 'block'; place(d, r); };

  var marks = document.createElement('div');
  marks.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:' + Z + ';display:block';
  document.documentElement.appendChild(marks);

  var panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:12px;right:12px;width:260px;max-height:80vh;overflow:auto;z-index:' + (Z + 2) + ';font:12px system-ui;color:#fff;display:none';
  document.documentElement.appendChild(panel);

  var bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:' + (Z + 3) + ';display:flex;gap:6px;font:12px system-ui';
  var btn = function (label, fn) { var b = document.createElement('button'); b.textContent = label; b.style.cssText = 'padding:4px 8px;border-radius:6px;border:1px solid #555;background:#1b1b1b;color:#fff;cursor:pointer'; b.onclick = function (e) { e.stopPropagation(); fn(); }; return b; };
  bar.appendChild(btn('Pick', function () { setMode('pick'); }));
  bar.appendChild(btn('Region', function () { setMode('region'); }));
  bar.appendChild(btn('Off', function () { setMode(null); }));
  document.documentElement.appendChild(bar);

  function setMode(m) { state.mode = m; hover.style.display = 'none'; if (m !== 'region') marquee.style.display = 'none'; document.body.style.cursor = m ? 'crosshair' : ''; }

  function serialize() {
    return { batchId: state.batchId, ready: state.ready, items: state.items.map(function (it, i) {
      return { id: it.id, badge: i + 1, componentName: it.componentName, ancestry: it.ancestry, selector: it.selector, tagName: it.tagName, text: it.text, rect: it.rect, comment: it.comment, wantScreenshot: it.wantScreenshot };
    }) };
  }
  function sync() {
    var snap = serialize();
    window['${ANNOTATIONS_GLOBAL}'] = snap;
    window['${SELECTION_GLOBAL}'] = snap.items.length ? snap.items[snap.items.length - 1] : null;
  }
  function setDirty() { if (state.ready) { state.ready = false; if (sendBtn) { sendBtn.textContent = 'Send to Claude'; sendBtn.style.background = '#1b1b1b'; } } sync(); }

  function renderMarks() {
    marks.innerHTML = '';
    state.items.forEach(function (it, i) {
      var o = document.createElement('div'); o.style.cssText = 'position:absolute;border:2px solid #22c55e;background:rgba(34,197,94,.10)'; place(o, it.rect); marks.appendChild(o);
      var b = document.createElement('div'); b.textContent = String(i + 1); b.style.cssText = 'position:absolute;background:#22c55e;color:#06210f;font:bold 11px system-ui;min-width:16px;height:16px;line-height:16px;border-radius:8px;text-align:center;left:' + it.rect.x + 'px;top:' + Math.max(0, it.rect.y - 16) + 'px'; marks.appendChild(b);
    });
  }
  function renderPanel() {
    panel.innerHTML = ''; sendBtn = null;
    panel.style.display = state.items.length ? 'block' : 'none';
    state.items.forEach(function (it, i) {
      var card = document.createElement('div'); card.style.cssText = 'background:#1b1b1b;border:1px solid #333;border-radius:8px;padding:8px;margin-bottom:8px';
      var head = document.createElement('div'); head.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px';
      var badge = document.createElement('span'); badge.textContent = String(i + 1); badge.style.cssText = 'background:#22c55e;color:#06210f;font:bold 11px system-ui;min-width:16px;height:16px;line-height:16px;border-radius:8px;text-align:center';
      var label = document.createElement('span'); label.textContent = it.componentName || it.tagName; label.style.cssText = 'flex:1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      var cam = document.createElement('button'); cam.textContent = '📷'; cam.title = 'include screenshot'; cam.style.cssText = 'cursor:pointer;border:1px solid #555;border-radius:4px;background:' + (it.wantScreenshot ? '#335' : '#1b1b1b');
      cam.onclick = function (e) { e.stopPropagation(); it.wantScreenshot = !it.wantScreenshot; cam.style.background = it.wantScreenshot ? '#335' : '#1b1b1b'; setDirty(); };
      var rm = document.createElement('button'); rm.textContent = '✕'; rm.style.cssText = 'cursor:pointer;border:1px solid #555;border-radius:4px;background:#1b1b1b;color:#fff';
      rm.onclick = function (e) { e.stopPropagation(); state.items.splice(i, 1); renderAll(); setDirty(); };
      head.appendChild(badge); head.appendChild(label); head.appendChild(cam); head.appendChild(rm);
      var ta = document.createElement('textarea'); ta.value = it.comment; ta.placeholder = 'What should change?'; ta.rows = 2;
      ta.style.cssText = 'width:100%;box-sizing:border-box;background:#0e0e0e;color:#fff;border:1px solid #333;border-radius:4px;font:12px system-ui;resize:vertical';
      ta.oninput = function () { it.comment = ta.value; setDirty(); };
      ta.onmousedown = function (e) { e.stopPropagation(); };
      card.appendChild(head); card.appendChild(ta); panel.appendChild(card);
    });
    if (state.items.length) {
      var actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:6px';
      sendBtn = document.createElement('button'); sendBtn.textContent = state.ready ? 'Sent ✓' : 'Send to Claude';
      sendBtn.style.cssText = 'flex:1;padding:6px;border-radius:6px;border:1px solid #2a6;color:#fff;cursor:pointer;background:' + (state.ready ? '#143' : '#1b1b1b');
      sendBtn.onclick = function (e) { e.stopPropagation(); state.ready = true; state.batchId++; sync(); sendBtn.textContent = 'Sent ✓'; sendBtn.style.background = '#143'; };
      var clr = document.createElement('button'); clr.textContent = 'Clear'; clr.style.cssText = 'padding:6px;border-radius:6px;border:1px solid #555;background:#1b1b1b;color:#fff;cursor:pointer';
      clr.onclick = function (e) { e.stopPropagation(); state.items = []; state.ready = false; renderAll(); sync(); };
      actions.appendChild(sendBtn); actions.appendChild(clr); panel.appendChild(actions);
    }
  }
  function renderAll() { renderMarks(); renderPanel(); }

  document.addEventListener('mousemove', function (e) { if (state.mode !== 'pick') return; var el = document.elementFromPoint(e.clientX, e.clientY); if (!el || panel.contains(el) || bar.contains(el)) return; show(hover, el.getBoundingClientRect()); }, true);
  document.addEventListener('click', function (e) { if (state.mode !== 'pick') return; if (panel.contains(e.target) || bar.contains(e.target)) return; e.preventDefault(); e.stopPropagation(); var el = document.elementFromPoint(e.clientX, e.clientY); if (!el) return; var data = window.__frontmanFlowExtractSelection(el); data.id = 'a' + (state.nextId++); data.comment = ''; data.wantScreenshot = false; state.items.push(data); state.ready = false; renderAll(); sync(); }, true);

  var drag = null;
  var rectOf = function (a, e) { return { x: Math.min(a.x, e.clientX), y: Math.min(a.y, e.clientY), width: Math.abs(e.clientX - a.x), height: Math.abs(e.clientY - a.y) }; };
  document.addEventListener('mousedown', function (e) { if (state.mode !== 'region' || panel.contains(e.target) || bar.contains(e.target)) return; e.preventDefault(); drag = { x: e.clientX, y: e.clientY }; }, true);
  document.addEventListener('mousemove', function (e) { if (state.mode !== 'region' || !drag) return; show(marquee, rectOf(drag, e)); }, true);
  document.addEventListener('mouseup', function (e) { if (state.mode !== 'region' || !drag) return; var r = rectOf(drag, e); drag = null; if (r.width > 4 && r.height > 4) window['${REGION_GLOBAL}'] = r; }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMode(null); }, true);

  sync();
})();
`;
```
- [ ] **Step 2:** Build + parse-check:
```bash
pnpm --filter @frontman-flow/core build
node --input-type=module -e "import('./packages/core/dist/cdp/overlay-script.js').then(m=>{new Function(m.OVERLAY_SOURCE);console.log('parses; probes:',m.ANNOTATIONS_PROBE,m.REGION_PROBE)})"
```
Expected: prints "parses; probes: window.__frontmanFlowAnnotations ?? null window.__frontmanFlowRegion ?? null".
- [ ] **Step 3:** `pnpm exec biome check .` clean; `pnpm test` (27) still green.
- [ ] **Step 4:** Commit: `git add packages/core/src/cdp/overlay-script.ts && git commit -m "feat(core): overlay v2 — multi-annotation panel + Send to Claude"`

## Task 3: readAnnotations
**Files:** Create `packages/core/src/annotations/read-annotations.ts` + `.test.ts`

- [ ] **Step 1: Failing test** (`read-annotations.test.ts`):
```ts
import { describe, expect, it } from "vitest";
import { FakePage } from "../cdp/fake-page.js";
import { ANNOTATIONS_PROBE } from "../cdp/overlay-script.js";
import { readAnnotations } from "./read-annotations.js";

const batch = (over = {}) => ({ batchId: 1, ready: true, items: [{ id: "a1", badge: 1, componentName: "Hero", ancestry: ["Hero"], selector: "h1", tagName: "H1", text: "hi", rect: { x: 0, y: 0, width: 1, height: 1 }, comment: "bigger", wantScreenshot: false }], ...over });

describe("readAnnotations", () => {
  it("returns null when absent", async () => {
    expect(await readAnnotations(new FakePage({ evalResults: { [ANNOTATIONS_PROBE]: null } }))).toBeNull();
  });
  it("returns null when not ready", async () => {
    expect(await readAnnotations(new FakePage({ evalResults: { [ANNOTATIONS_PROBE]: batch({ ready: false }) } }))).toBeNull();
  });
  it("returns null when ready but empty", async () => {
    expect(await readAnnotations(new FakePage({ evalResults: { [ANNOTATIONS_PROBE]: batch({ items: [] }) } }))).toBeNull();
  });
  it("returns the batch when ready and non-empty", async () => {
    const b = await readAnnotations(new FakePage({ evalResults: { [ANNOTATIONS_PROBE]: batch() } }));
    expect(b?.items[0].componentName).toBe("Hero");
    expect(b?.ready).toBe(true);
  });
});
```
- [ ] **Step 2:** Run → FAIL (module missing). `pnpm vitest run packages/core/src/annotations/read-annotations.test.ts`
- [ ] **Step 3: Implement** (`read-annotations.ts`):
```ts
import type { BridgePage } from "../cdp/page.js";
import type { AnnotationBatch } from "../types.js";
import { ANNOTATIONS_PROBE } from "../cdp/overlay-script.js";

/** The submitted batch, or null when none / not ready / empty. */
export async function readAnnotations(page: BridgePage): Promise<AnnotationBatch | null> {
  const batch = await page.evaluate<AnnotationBatch | null>(ANNOTATIONS_PROBE);
  if (!batch || !batch.ready || !batch.items || batch.items.length === 0) return null;
  return batch;
}
```
- [ ] **Step 4:** Run → PASS (4 tests).
- [ ] **Step 5:** Commit: `git add packages/core/src/annotations && git commit -m "feat(core): readAnnotations (ready, non-empty batch or null)"`

## Task 4: get_annotations tool handler
**Files:** Create `packages/core/src/tools/get-annotations.ts` + `.test.ts`

- [ ] **Step 1: Failing test** (`get-annotations.test.ts`):
```ts
import { describe, expect, it } from "vitest";
import { FakePage } from "../cdp/fake-page.js";
import { ANNOTATIONS_PROBE } from "../cdp/overlay-script.js";
import { getAnnotationsTool } from "./get-annotations.js";

const item = (over = {}) => ({ id: "a1", badge: 1, componentName: "Hero", ancestry: ["Hero"], selector: "#h", tagName: "H1", text: "hi", rect: { x: 0, y: 0, width: 10, height: 10 }, comment: "bigger", wantScreenshot: false, ...over });
const ready = (items: unknown[]) => ({ [ANNOTATIONS_PROBE]: { batchId: 1, ready: true, items } });

describe("getAnnotationsTool", () => {
  it("guides the user when nothing is submitted", async () => {
    const r = await getAnnotationsTool({ page: new FakePage({ evalResults: { [ANNOTATIONS_PROBE]: null } }) });
    expect((r.content[0] as { text: string }).text).toMatch(/send to claude/i);
  });
  it("returns a text block per item in badge order", async () => {
    const r = await getAnnotationsTool({ page: new FakePage({ evalResults: ready([item({ badge: 1, componentName: "Hero" }), item({ id: "a2", badge: 2, componentName: "Nav", selector: "#n" })]) }) });
    const texts = r.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text);
    expect(texts.join("\n")).toMatch(/Hero/);
    expect(texts.join("\n")).toMatch(/Nav/);
  });
  it("embeds an image only for wantScreenshot items", async () => {
    const page = new FakePage({ evalResults: ready([item({ wantScreenshot: true, selector: "#h" })]), elementPng: { "#h": Buffer.from("PNG") } });
    const r = await getAnnotationsTool({ page });
    const imgs = r.content.filter((c) => c.type === "image");
    expect(imgs).toHaveLength(1);
    expect((imgs[0] as { data: string }).data).toBe(Buffer.from("PNG").toString("base64"));
  });
  it("omits the image gracefully when no element matches (falls back to rect clip)", async () => {
    const page = new FakePage({ evalResults: ready([item({ wantScreenshot: true, selector: "#missing" })]), elementPng: { "#missing": null }, clipPng: Buffer.from("CLIP") });
    const r = await getAnnotationsTool({ page });
    const imgs = r.content.filter((c) => c.type === "image");
    expect((imgs[0] as { data: string }).data).toBe(Buffer.from("CLIP").toString("base64"));
  });
});
```
- [ ] **Step 2:** Run → FAIL. `pnpm vitest run packages/core/src/tools/get-annotations.test.ts`
- [ ] **Step 3: Implement** (`get-annotations.ts`):
```ts
import type { Annotation } from "../types.js";
import { readAnnotations } from "../annotations/read-annotations.js";
import type { ToolDeps, ToolResult } from "./deps.js";

const NONE = "No submitted annotations — pick elements in the overlay, add a comment to each, then click Send to Claude.";

export async function getAnnotationsTool(deps: ToolDeps): Promise<ToolResult> {
  const batch = await readAnnotations(deps.page);
  if (!batch) return { content: [{ type: "text", text: NONE }] };

  const content: ToolResult["content"] = [
    { type: "text", text: `${batch.items.length} annotation(s) submitted:` },
  ];
  for (const a of batch.items) {
    content.push({ type: "text", text: annotationText(a) });
    if (a.wantScreenshot) {
      const png = (await deps.page.screenshotElement(a.selector)) ?? (await deps.page.screenshotClip(a.rect));
      if (png) content.push({ type: "image", data: png.toString("base64"), mimeType: "image/png" });
    }
  }
  return { content };
}

function annotationText(a: Annotation): string {
  return JSON.stringify(
    { badge: a.badge, componentName: a.componentName, ancestry: a.ancestry, selector: a.selector, tagName: a.tagName, text: a.text, comment: a.comment },
    null,
    2,
  );
}
```
- [ ] **Step 4:** Run → PASS (4 tests).
- [ ] **Step 5:** Commit: `git add packages/core/src/tools/get-annotations.ts packages/core/src/tools/get-annotations.test.ts && git commit -m "feat(core): get_annotations tool (text per item + embedded screenshots)"`

## Task 5: Register get_annotations
**Files:** Modify `packages/core/src/server/register-tools.ts` and its test.

- [ ] **Step 1: Update the in-process test** (`register-tools.test.ts`): change the expected tool-name assertion to include `get_annotations`:
```ts
expect(tools.map((t) => t.name).sort()).toEqual(["get_annotations", "get_selection", "screenshot"]);
```
- [ ] **Step 2:** Run → FAIL (only 2 tools registered). `pnpm vitest run packages/core/src/server/register-tools.test.ts`
- [ ] **Step 3: Register the tool** — add the import and a `registerTool` call in `register-tools.ts`:
```ts
import { getAnnotationsTool } from "../tools/get-annotations.js";
// …inside registerTools, alongside the others:
server.registerTool(
  "get_annotations",
  {
    description:
      "Return the batch of annotations the user submitted via the overlay's 'Send to Claude' button: per element a JSON block { badge, componentName, ancestry, selector, tagName, text, comment } and (when flagged) a screenshot. Grep each componentName to find its source and apply that annotation's comment. Returns guidance text if nothing is submitted.",
    inputSchema: undefined,
  },
  async () => (await getAnnotationsTool(deps)) as never,
);
```
- [ ] **Step 4:** Run → PASS. Then `pnpm test` (full) green + `pnpm typecheck` clean + `pnpm exec biome check .` clean.
- [ ] **Step 5:** Commit: `git add packages/core/src/server/register-tools.ts packages/core/src/server/register-tools.test.ts && git commit -m "feat(core): register get_annotations MCP tool"`

## Task 6: Integration test (live Chrome)
**Files:** Create `packages/core/integration/annotations.integration.test.ts`

Requires the Vite example on 5180 + Chrome on 9222 (see README). Excluded from default `vitest run`.

- [ ] **Step 1: Write the test:**
```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Connection, connect } from "../src/cdp/connector.js";
import { getAnnotationsTool } from "../src/tools/get-annotations.js";

const APP_URL = process.env.FF_VITE_URL ?? "http://localhost:5180";
const CDP_URL = process.env.FF_CDP_URL ?? "http://localhost:9222";
let connection: Connection;

beforeAll(async () => {
  connection = await connect({ cdpUrl: CDP_URL, appUrl: APP_URL });
  // Build a 2-item ready batch programmatically using the injected extractor.
  await connection.page.evaluate<unknown>(`(() => {
    var mk = function (sel, comment, shot) { var d = window.__frontmanFlowExtractSelection(document.querySelector(sel)); d.comment = comment; d.wantScreenshot = shot; return d; };
    window.__frontmanFlowAnnotations = { batchId: 1, ready: true, items: [ mk('#hero-heading', 'make it bigger', true), mk('#hero-btn', 'rename to Save', false) ] };
  })()`);
});
afterAll(async () => { await connection?.close(); });

describe("get_annotations on a live page (integration)", () => {
  it("returns a text block per item with component identity + one screenshot", async () => {
    const r = await getAnnotationsTool({ page: connection.page });
    const text = r.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("\n");
    expect(text).toMatch(/2 annotation/);
    expect(text).toMatch(/Hero/);          // both #hero-heading and #hero-btn resolve to the Hero component
    expect(text).toMatch(/make it bigger/);
    expect(text).toMatch(/rename to Save/);
    const imgs = r.content.filter((c) => c.type === "image");
    expect(imgs).toHaveLength(1);
    expect(Buffer.from((imgs[0] as { data: string }).data, "base64").length).toBeGreaterThan(100);
  });
});
```
- [ ] **Step 2: Run** (with Vite+Chrome up):
```bash
pnpm --dir examples/vite-react exec vite --port 5180 --strictPort &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9222 --user-data-dir=/tmp/ff-chrome-anno about:blank &
pnpm --filter @frontman-flow/core exec vitest run --config vitest.integration.config.ts annotations
```
Expected: PASS (1 test). Stop the bg processes after (`pkill -f "vite --port 5180"; pkill -f ff-chrome-anno`).
- [ ] **Step 3:** Commit: `git add packages/core/integration/annotations.integration.test.ts && git commit -m "test(core): get_annotations live integration (2-item batch + screenshot)"`

## Task 7: Docs
**Files:** Modify `.claude/skills/frontman-flow/SKILL.md`, `README.md`

- [ ] **Step 1:** In `.claude/skills/frontman-flow/SKILL.md`, add a section that for **batch** requests Claude calls `mcp__frontman-flow__get_annotations` (after the user clicks **Send to Claude**), then for each returned item greps `componentName` and applies that item's `comment`; if nothing submitted, ask the user to pick + comment + Send. Keep `get_selection` as the single-pick path.
- [ ] **Step 2:** In `README.md`, add `get_annotations` to the MCP tools table and a one-line "batch" note in the loop (pick several → comment each → Send → "apply my annotations").
- [ ] **Step 3:** Commit: `git add .claude/skills/frontman-flow/SKILL.md README.md && git commit -m "docs: document the annotation batch loop + get_annotations"`

---

## Definition of Done
`pnpm test` green (unit, incl. new read-annotations + get-annotations + updated register-tools); the annotations integration test passes against live Chrome; Biome + typecheck clean; overlay v2 renders the panel/cards/badges and Send marks the batch ready (verified manually or via integration). `get_selection` + `screenshot` behavior unchanged.

## Self-review notes
- Spec coverage: overlay v2 (T2), get_annotations incl. screenshot embed + not-ready guidance (T4), additive tool keeping get_selection/screenshot (T5), types (T1), tests (T3/T4/T6), docs (T7). ✓
- Types: `Annotation`/`AnnotationBatch` (T1) used by readAnnotations (T3), get-annotations (T4), overlay serialize shape (T2) — field names match (componentName, ancestry, selector, tagName, text, rect, comment, wantScreenshot, badge, id; batch: batchId, ready, items). ✓
- `FakePage` already supports `evalResults`, `elementPng`, `clipPng` (used by T4). ✓
