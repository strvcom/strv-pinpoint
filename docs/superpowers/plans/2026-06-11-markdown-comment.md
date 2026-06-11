# Minimal Markdown Comment Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the annotation comment `<textarea>` with a minimal ProseMirror editor — paragraphs + bullet/ordered lists, created by typing markdown (no toolbar) — storing Markdown in `item.comment`.

**Architecture:** A pure markdown round-trip module (custom minimal schema + `prosemirror-markdown` parser/serializer restricted to paragraphs+lists) is the testable core. A vanilla `createMarkdownEditor(host, opts)` mounts a ProseMirror `EditorView` (no Preact binding) with list input-rules + a keymap; the Card swaps its textarea for an editor host div via a `useEffect`. Bundle impact is measured as a checkpoint.

**Tech Stack:** ProseMirror (`-model/-state/-view/-markdown/-schema-list/-inputrules/-keymap/-commands`) + `markdown-it` (transitive), Preact (host), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-11-markdown-comment-design.md`

**Toolchain:** exit 127 → prepend nvm bin. Run from worktree root.

---

## File structure

| File | Responsibility |
|---|---|
| `overlay/markdown/schema.ts` (create) | minimal PM schema: `doc, paragraph, text` + list nodes (no heading/marks) |
| `overlay/markdown/markdown.ts` (create) | `parseMarkdown(md): Node` + `serializeMarkdown(doc): string` (restricted to paragraphs+lists) |
| `overlay/markdown/markdown.test.ts` (create) | round-trip unit tests (pure, node — no EditorView) |
| `overlay/markdown/editor.ts` (create) | `createMarkdownEditor(host, opts)` — vanilla EditorView + input-rules + keymap |
| `overlay/components/Card.tsx` (modify) | swap `<textarea>` for the editor host div + mount effect |
| `overlay/components/Card.test.tsx` (modify) | assert `.pp-md` host (not textarea); editor module mocked |
| `overlay/styles.ts` (modify) | `.pp-md` + list CSS (shadow-scoped) |
| `packages/core/package.json` (modify) | add ProseMirror devDeps |
| `docs/decisions.md` (modify) | decision + bundle-size note |

---

### Task 1: ProseMirror deps + minimal schema

**Files:**
- Modify: `packages/core/package.json`
- Create: `packages/core/src/overlay/markdown/schema.ts`

- [ ] **Step 1: Add the ProseMirror devDependencies**

In `packages/core/package.json` `devDependencies`, add (alphabetical, keep JSON valid):

```json
    "prosemirror-commands": "^1.6.0",
    "prosemirror-inputrules": "^1.4.0",
    "prosemirror-keymap": "^1.2.2",
    "prosemirror-markdown": "^1.13.0",
    "prosemirror-model": "^1.23.0",
    "prosemirror-schema-list": "^1.4.1",
    "prosemirror-state": "^1.4.3",
    "prosemirror-view": "^1.34.0",
```

Run: `pnpm install` (exit code may be 1 from the lefthook `prepare` step in a worktree — harmless; verify `ls packages/core/node_modules/prosemirror-model` exists).

- [ ] **Step 2: Create the minimal schema**

Create `packages/core/src/overlay/markdown/schema.ts`:

```ts
import OrderedMap from "orderedmap";
import { type NodeSpec, Schema } from "prosemirror-model";
import { addListNodes } from "prosemirror-schema-list";

// Minimal node set: paragraphs + text only at the base; lists added below. NO heading, NO marks —
// so "no titles, lists only" is structural (there is no node to hold a heading or bold) (TASK-31).
const baseNodes = OrderedMap.from<NodeSpec>({
  doc: { content: "block+" },
  paragraph: {
    group: "block",
    content: "inline*",
    parseDOM: [{ tag: "p" }],
    toDOM: () => ["p", 0],
  },
  text: { group: "inline" },
});

export const mdSchema = new Schema({
  // list_item content "paragraph block*" → items hold a paragraph (+ nested lists); group "block".
  nodes: addListNodes(baseNodes, "paragraph block*", "block"),
  marks: {},
});
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean (the schema module compiles; `orderedmap` ships with prosemirror-model).

- [ ] **Step 4: Commit**

```bash
git add packages/core/package.json pnpm-lock.yaml packages/core/src/overlay/markdown/schema.ts
git commit -m "feat(overlay): ProseMirror deps + minimal lists-only markdown schema (TASK-31)"
```

---

### Task 2: Markdown round-trip (the testable core)

**Files:**
- Create: `packages/core/src/overlay/markdown/markdown.ts`
- Test: `packages/core/src/overlay/markdown/markdown.test.ts`

- [ ] **Step 1: Write the failing round-trip tests**

Create `packages/core/src/overlay/markdown/markdown.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseMarkdown, serializeMarkdown } from "./markdown.js";

const round = (md: string) => serializeMarkdown(parseMarkdown(md)).trim();

describe("markdown round-trip (TASK-31)", () => {
  it("preserves a bullet list", () => {
    expect(round("- a\n- b")).toBe("- a\n- b");
  });

  it("preserves an ordered list", () => {
    expect(round("1. x\n2. y")).toBe("1. x\n2. y");
  });

  it("preserves a plain paragraph", () => {
    expect(round("hello world")).toBe("hello world");
  });

  it("degrades a heading to plain paragraph text (no heading node)", () => {
    // markdown-it is configured WITHOUT the heading rule, so '# h' stays literal text.
    expect(round("# h")).toBe("# h");
  });

  it("empty input yields empty output", () => {
    expect(round("")).toBe("");
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm exec vitest run packages/core/src/overlay/markdown/markdown.test.ts`
Expected: FAIL — module `./markdown.js` not found.

- [ ] **Step 3: Implement parse + serialize**

Create `packages/core/src/overlay/markdown/markdown.ts`:

```ts
import MarkdownIt from "markdown-it";
import type { Node } from "prosemirror-model";
import { defaultMarkdownSerializer, MarkdownParser, MarkdownSerializer } from "prosemirror-markdown";
import { mdSchema } from "./schema.js";

// markdown-it "zero" disables ALL rules; enable only what maps to our schema (lists + paragraphs +
// inline text). Headings/emphasis/etc stay disabled, so unsupported markdown stays literal text.
const md = MarkdownIt("zero", { html: false }).enable([
  "list",
  "paragraph",
  "text",
  "newline",
]);

// Token → node mapping (only the nodes our schema has).
const parser = new MarkdownParser(mdSchema, md, {
  paragraph: { block: "paragraph" },
  bullet_list: { block: "bullet_list" },
  ordered_list: {
    block: "ordered_list",
    getAttrs: (tok) => ({ order: +(tok.attrGet("start") ?? 1) || 1 }),
  },
  list_item: { block: "list_item" },
});

// Reuse the official node serializers for just our node set.
const n = defaultMarkdownSerializer.nodes;
const serializer = new MarkdownSerializer(
  {
    paragraph: n.paragraph,
    bullet_list: n.bullet_list,
    ordered_list: n.ordered_list,
    list_item: n.list_item,
    text: n.text,
  },
  {},
);

export function parseMarkdown(markdown: string): Node {
  return parser.parse(markdown ?? "");
}

export function serializeMarkdown(doc: Node): string {
  return serializer.serialize(doc);
}
```

- [ ] **Step 4: Run, iterate to green**

Run: `pnpm exec vitest run packages/core/src/overlay/markdown/markdown.test.ts`
Expected: PASS. If a markdown-it rule name is off (the "zero" enable-list is version-sensitive), adjust the `.enable([...])` set until the 5 tests pass — the heading-degrades test pins that headings are NOT parsed, and the list tests pin lists ARE. (If `ordered_list` serializes with a different marker spacing, normalize the expectation to what the official serializer emits — the point is stable round-trip, not an exact string.)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/overlay/markdown/markdown.ts packages/core/src/overlay/markdown/markdown.test.ts
git commit -m "feat(overlay): markdown parse/serialize restricted to paragraphs + lists (TASK-31)"
```

---

### Task 3: The editor view (vanilla ProseMirror)

**Files:**
- Create: `packages/core/src/overlay/markdown/editor.ts`

This unit has no happy-dom unit test (ProseMirror needs a real contenteditable/selection); it is covered by `pnpm typecheck`, the Card mount test (Task 4, which mocks this module), and live verification (Task 5).

- [ ] **Step 1: Implement `createMarkdownEditor`**

Create `packages/core/src/overlay/markdown/editor.ts`:

```ts
import { baseKeymap } from "prosemirror-commands";
import { inputRules, wrappingInputRule } from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import { liftListItem, sinkListItem, splitListItem } from "prosemirror-schema-list";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { parseMarkdown, serializeMarkdown } from "./markdown.js";
import { mdSchema } from "./schema.js";

export interface MarkdownEditorOptions {
  value: string;
  onChange: (md: string) => void;
  onSave: () => void;
  onDiscard: () => void;
  /** Shadow root (or document) so ProseMirror resolves selection in the right tree. */
  root: Document | ShadowRoot;
}

export interface MarkdownEditorHandle {
  destroy(): void;
  focus(): void;
}

// Type "- " / "* " / "+ " → bullet list; "1. " → ordered list. No toolbar.
const listInputRules = inputRules({
  rules: [
    wrappingInputRule(/^\s*([-*+])\s$/, mdSchema.nodes.bullet_list),
    wrappingInputRule(
      /^(\d+)\.\s$/,
      mdSchema.nodes.ordered_list,
      (m) => ({ order: +m[1] }),
      (m, node) => node.childCount + node.attrs.order === +m[1],
    ),
  ],
});

export function createMarkdownEditor(
  host: HTMLElement,
  opts: MarkdownEditorOptions,
): MarkdownEditorHandle {
  const li = mdSchema.nodes.list_item;
  const editorKeymap = keymap({
    // Save / discard preempt default handling.
    "Shift-Enter": () => {
      opts.onSave();
      return true;
    },
    Escape: () => {
      opts.onDiscard();
      return true;
    },
    Enter: splitListItem(li),
    Tab: sinkListItem(li),
    "Shift-Tab": liftListItem(li),
  });

  const state = EditorState.create({
    doc: parseMarkdown(opts.value),
    plugins: [listInputRules, editorKeymap, keymap(baseKeymap)],
  });

  const view = new EditorView(
    { mount: host },
    {
      state,
      root: opts.root,
      dispatchTransaction(tr) {
        const next = view.state.apply(tr);
        view.updateState(next);
        if (tr.docChanged) opts.onChange(serializeMarkdown(next.doc));
      },
    },
  );

  return {
    destroy: () => view.destroy(),
    focus: () => view.focus(),
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/overlay/markdown/editor.ts
git commit -m "feat(overlay): createMarkdownEditor — vanilla PM, list input-rules + keymap (TASK-31)"
```

---

### Task 4: Card integration + styles

**Files:**
- Modify: `packages/core/src/overlay/components/Card.tsx`
- Modify: `packages/core/src/overlay/styles.ts`
- Test: `packages/core/src/overlay/components/Card.test.tsx`

- [ ] **Step 1: Update the Card test (mock the editor module)**

At the top of `packages/core/src/overlay/components/Card.test.tsx`, mock the editor module so happy-dom needn't run ProseMirror, then assert the host renders:

```ts
import { vi } from "vitest";
vi.mock("../markdown/editor.js", () => ({
  createMarkdownEditor: vi.fn(() => ({ destroy: vi.fn(), focus: vi.fn() })),
}));
```

Replace the existing `textarea`-based assertions: any test selecting `card.querySelector("textarea")` now selects `card.querySelector(".pp-md")`. Add:

```ts
it("renders a markdown editor host (.pp-md), not a textarea (TASK-31)", () => {
  const { card } = setup(makeItem({ saved: false }));
  expect(card.querySelector(".pp-md")).not.toBeNull();
  expect(card.querySelector("textarea")).toBeNull();
});
```

For the TASK-30 tests that fired keydown on the textarea (Shift+Enter→save, Escape→discard): those behaviors now live in the editor's keymap (not unit-testable in happy-dom) — change them to assert the editor was created with the right callbacks instead:

```ts
import { createMarkdownEditor } from "../markdown/editor.js";
it("wires onSave/onDiscard into the markdown editor (TASK-30/31)", () => {
  const onSave = vi.fn();
  const onDelete = vi.fn();
  setup(makeItem({ saved: false }), { onSave, onDelete });
  const opts = (createMarkdownEditor as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as {
    onSave: () => void;
    onDiscard: () => void;
    value: string;
  };
  opts.onSave();
  expect(onSave).toHaveBeenCalled();
  opts.onDiscard();
  expect(onDelete).toHaveBeenCalled();
});
```

(Delete the old textarea-keydown tests they replace.)

- [ ] **Step 2: Run, expect failure**

Run: `pnpm exec vitest run packages/core/src/overlay/components/Card.test.tsx`
Expected: FAIL — `.pp-md` not found / `createMarkdownEditor` not imported by Card.

- [ ] **Step 3: Swap the textarea for the editor host in `Card.tsx`**

Add the import: `import { createMarkdownEditor, type MarkdownEditorHandle } from "../markdown/editor.js";`

Replace the `<textarea ...>` block with a host div + a ref, and add a mount effect. Replace `taRef` usage: keep a `hostRef` for the editor host and an `editorRef` for the handle.

```tsx
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<MarkdownEditorHandle | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = (host.getRootNode() as ShadowRoot | Document) ?? document;
    editorRef.current = createMarkdownEditor(host, {
      value: item.comment,
      onChange: onComment,
      onSave: () => (isDraft ? onSave() : onMinimize()),
      onDiscard: () => {
        if (isDraft) onDelete();
      },
      root,
    });
    editorRef.current.focus();
    return () => {
      editorRef.current?.destroy();
      editorRef.current = null;
    };
    // Create once per card mount; comment is uncontrolled after init (matches the old textarea).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

JSX (replacing the textarea):

```tsx
      {/* Markdown comment editor (lists only) — host for the ProseMirror view */}
      <div
        class="pp-md"
        ref={hostRef}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      />
```

Remove the now-unused `taRef` and the two `useEffect`s that focused/created the textarea, and the textarea's own keydown handler (Shift+Enter/Escape now live in the editor keymap). Keep `handleConfirmNo`'s focus call working by focusing `editorRef.current?.focus()` instead of `taRef.current?.focus()`.

- [ ] **Step 4: Add styles in `styles.ts`**

Append to `OVERLAY_CSS` (shadow-scoped — these rules only affect the overlay):

```ts
  ".pp-md{box-sizing:border-box;width:100%;min-height:44px;background:#0e0e0e;color:#fff;border:1px solid #333;border-radius:4px;padding:6px 8px;font:12px system-ui}" +
  ".pp-md .ProseMirror{outline:none;white-space:pre-wrap;word-wrap:break-word}" +
  ".pp-md ul,.pp-md ol{margin:2px 0;padding-left:18px}" +
  ".pp-md li{margin:1px 0}" +
  ".pp-md p{margin:0}" +
```

- [ ] **Step 5: Run Card tests + full suite + typecheck**

Run: `pnpm exec vitest run packages/core/src/overlay/components/Card.test.tsx` → PASS.
Then `pnpm test` (full suite green) and `pnpm typecheck` (clean).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/overlay/components/Card.tsx packages/core/src/overlay/components/Card.test.tsx packages/core/src/overlay/styles.ts
git commit -m "feat(overlay): Card uses the markdown editor instead of a textarea (TASK-31)"
```

---

### Task 5: Bundle checkpoint + build + live verify + decisions

**Files:**
- Modify: `docs/decisions.md`

- [ ] **Step 1: Build + measure the bundle impact**

Run: `pnpm build`. Note the printed `bin/pinpoint` size and the `overlay-source.generated.ts` byte count. Compare to the pre-TASK-31 baseline (~99KB bin). If ProseMirror roughly doubles the overlay or pushes the bin past a reasonable size for an injected script (say >300KB), STOP and report — we'd reconsider (Lexical / textarea fallback) per the spec's risk note. Otherwise proceed.

- [ ] **Step 2: Commit the regenerated bundle**

```bash
git add packages/core/src/cdp/overlay-source.generated.ts
git commit -m "build(overlay): regenerate bundle with markdown editor (TASK-31)"
```

- [ ] **Step 3: Live verify on vite-plain**

Start the example + dev loop (`pnpm --dir examples/vite-plain dev` + `PIN_APP_URL=http://localhost:5174 pnpm dev:overlay`). Pick an element → the draft card shows the markdown editor. Type `- first`, Enter, `second` → a bullet list; Enter on an empty item exits the list; `1. ` makes an ordered list. Shift+Enter saves (collapses); reopen via badge shows the list. Copy and paste the JSON here — `comment` should be markdown (`"- first\n- second"`). Confirm no headings are possible (typing `# x` stays literal).

- [ ] **Step 4: Decisions row**

Append to `docs/decisions.md`:

> `2026-06-11` — Minimal markdown comment editor (TASK-31): replaced the comment `<textarea>` with a vanilla ProseMirror editor — custom schema of `paragraph`+`text`+lists only (no heading node, no marks), `prosemirror-markdown` for markdown round-trip in/out of `item.comment`, list input-rules (`- `/`1. `) so lists are typed with **no toolbar**. `createMarkdownEditor` mounts the `EditorView` imperatively in the Card (no Preact binding), passed the shadow root for selection; Shift+Enter→save, Escape→discard (draft) are PM keybindings. ProseMirror is a build-time devDep compiled into `OVERLAY_SOURCE` — the bin stays zero-runtime-dep. Bundle grew to <SIZE> (recorded). markdown-it "zero" preset enables only list/paragraph/text rules, so unsupported markdown (headings, emphasis) stays literal text. Interactive editing verified live; the markdown round-trip is unit-tested.

(Replace `<SIZE>` with the measured bin size from Step 1.)

- [ ] **Step 5: Commit**

```bash
git add docs/decisions.md
git commit -m "docs(decisions): record markdown comment editor (TASK-31)"
```

---

## Self-review notes

- **Spec coverage:** schema with no heading/marks (Task 1); markdown round-trip restricted to lists+paragraphs (Task 2); vanilla editor with list input-rules + no toolbar + Shift+Enter/Escape keybindings + shadow root (Task 3); Card swap + styles, markdown stored in `item.comment` (Task 4); bundle checkpoint + live verify + decisions (Task 5). Downstream payload unchanged (comment stays a string).
- **Type consistency:** `parseMarkdown`/`serializeMarkdown`, `mdSchema`, `createMarkdownEditor(host, opts)` with `MarkdownEditorOptions`/`MarkdownEditorHandle`, and the Card's `hostRef`/`editorRef` are used consistently.
- **Known verify-during-impl points (not placeholders — anchored by tests):** the exact `markdown-it` "zero" `.enable([...])` rule names (pinned by Task 2's round-trip + heading-degrades tests) and ProseMirror peer-version compatibility (pinned by `pnpm typecheck` + the build). The `<SIZE>` token in the decisions row is filled from the measured build in Task 5 Step 1.
