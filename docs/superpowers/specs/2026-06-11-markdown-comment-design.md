# Minimal markdown comment editor (lists only)

**Task:** TASK-31
**Status:** Designed (approved 2026-06-11)

## Problem

The annotation comment is a plain `<textarea>` storing plain text. We want light formatting —
specifically **lists** — authored as a real (WYSIWYG) editor, with the comment stored as **Markdown**
so it flows into the clipboard payload as markdown. Product constraints: **no headings/titles, no
formatting toolbar or large block-format UI; the most complex formatting allowed is list types
(bullet + ordered).**

## Goal

Replace the comment textarea with a minimal ProseMirror editor: paragraphs + bullet/ordered lists,
created by typing markdown (no toolbar), round-tripping Markdown in/out of `item.comment`.

## Why ProseMirror

The user chose a real WYSIWYG library over a textarea-with-helpers. Among WYSIWYG options,
ProseMirror fits "lists only, no toolbar, markdown" best:
- `prosemirror-markdown` provides an official Markdown **parser and serializer** (no HTML↔markdown
  hop).
- A **custom minimal schema** (`doc, paragraph, text, bullet_list, ordered_list, list_item`) makes
  "no titles, lists only" structural — there is literally no node for a heading.
- `prosemirror-inputrules` makes lists appear by typing `- `/`* `/`1. ` → **no toolbar**.
- Vanilla core (no React) embeds in the Preact/Shadow-DOM overlay via the imperative `EditorView`
  API.

## Design

### Unit: `overlay/components/markdown-editor.ts` (vanilla, no Preact)

```
createMarkdownEditor(host: HTMLElement, opts: {
  value: string;                 // initial markdown
  onChange: (md: string) => void;
  onSave: () => void;            // Shift+Enter
  onDiscard: () => void;         // Escape
  root: Document | ShadowRoot;   // for ProseMirror selection in the shadow tree
}): { destroy(): void; focus(): void }
```

- **Schema:** built from a minimal node spec + `addListNodes` (prosemirror-schema-list) for
  `bullet_list`, `ordered_list`, `list_item`. Nodes: `doc(block+)`, `paragraph`, `text`,
  `bullet_list`, `ordered_list`, `list_item`. **No marks**, no heading/blockquote/code.
- **Markdown I/O:** a `MarkdownParser` and `MarkdownSerializer` restricted to those nodes
  (start from `prosemirror-markdown`'s defaults and drop the unsupported tokens/nodes). `value`
  parsed on create; on every doc change, serialize → `onChange(md)`.
- **Plugins:** `inputRules` (wrappingInputRule for `- `, `* `, `+ `, `1. ` → lists),
  `keymap` with: `Enter` = `splitListItem` (continue list) falling back to default; `Tab` =
  `sinkListItem`, `Shift-Tab` = `liftListItem`; `Shift-Enter` = run `onSave()`; `Escape` =
  run `onDiscard()`; plus `baseKeymap`. The Shift-Enter/Escape bindings return `true` so they
  preempt default handling.
- **Shadow DOM:** pass `root` to `EditorView` so selection resolves inside the shadow tree.

### Card change (`overlay/components/Card.tsx`)

Replace the `<textarea>` with a host `<div class="pp-md" ref={...}>` and a `useEffect` that calls
`createMarkdownEditor(hostDiv, { value: item.comment, onChange: onComment, onSave, onDiscard:
onDelete-for-draft, root })` on mount and `.destroy()` on unmount. The editor is created once per
card mount (its content is uncontrolled after init — like the current textarea, which is also
uncontrolled in practice). The draft vs saved distinction (Save button, no minimize, etc. from
TASK-30) is unchanged; only the input widget changes. Escape→discard applies only to drafts (the
editor's Escape binding calls a handler that no-ops for saved cards).

### Styling (`overlay/styles.ts`)

Add shadow-scoped CSS for `.pp-md` (the editor box — same look as the old textarea: dark bg, border,
padding, min-height, `font:12px system-ui`) and for `.pp-md ul`, `.pp-md ol`, `.pp-md li`
(tight list spacing). ProseMirror adds a `.ProseMirror` class on the editable div; style it for
focus outline + caret.

### Downstream (unchanged)

`item.comment` remains a markdown **string**; `clipboard-payload.ts` serializes it as-is, so the
pasted JSON's `comment` is markdown. No payload-shape change (TASK-27's `selection` is untouched).

## Dependencies (build-time, bundled into the overlay)

`prosemirror-model`, `prosemirror-state`, `prosemirror-view`, `prosemirror-markdown`,
`prosemirror-schema-list`, `prosemirror-inputrules`, `prosemirror-keymap`, `prosemirror-commands`.
Added as devDeps of `@pinpoint/core` (the overlay is bundled by esbuild; the **bin stays
zero-runtime-dep** — these are compiled into `OVERLAY_SOURCE`, not required at runtime).

## Testing

- **Unit (no EditorView):** the markdown parser/serializer round-trip — `"- a\n- b"` and
  `"1. x\n2. y"` parse to a doc and serialize back to equivalent markdown; a heading like `"# h"`
  degrades to plain paragraph text (no heading node). These are pure functions, fully testable in
  node.
- **Card mount (happy-dom):** the Card renders the `.pp-md` host (not a `<textarea>`) for both draft
  and saved; `createMarkdownEditor` is invoked with the item's comment (spy/mocked at the module
  boundary so happy-dom doesn't need a working contenteditable).
- **Live (vite-plain):** typing `- ` makes a bullet list, Enter continues it, empty item exits;
  Shift+Enter saves; Escape discards a draft; the copied JSON's `comment` is markdown.

## Risks / fallbacks

- **Bundle size:** ProseMirror adds meaningful weight to the overlay (`bin/pinpoint` grows). Measured
  as a checkpoint during implementation; if it bloats unacceptably, fall back to Lexical (lighter
  minimal config) or the textarea-with-list-continuation approach. Recorded in `docs/decisions.md`.
- **Shadow DOM selection:** pass `root` to `EditorView`; verify caret/selection live (known
  ProseMirror shadow-DOM caveat).
- **happy-dom:** ProseMirror's contenteditable/selection won't run there, so interactive editing is
  verified live, not in unit tests (the markdown round-trip + Card mount are unit-tested).

## Scope / non-goals

- No headings, no marks (bold/italic), no toolbar, no code blocks/blockquote — lists + paragraphs
  only.
- No change to the clipboard payload shape; only the comment's authoring widget + that it's markdown.
- Sequenced after TASK-30 (save/draft) and TASK-27/28 (payload v2 + enrichment), all merged.
