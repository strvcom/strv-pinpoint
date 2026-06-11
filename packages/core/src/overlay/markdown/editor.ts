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

/**
 * Mounts a minimal ProseMirror editor (paragraphs + lists, markdown in/out) into `host`. The view
 * is appended inside `host` (class `.ProseMirror`); ProseMirror resolves its root via getRootNode(),
 * so it works inside the overlay's shadow tree. Vanilla — no Preact binding (TASK-31).
 */
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

  const view = new EditorView(host, {
    state,
    dispatchTransaction(tr) {
      const next = view.state.apply(tr);
      view.updateState(next);
      if (tr.docChanged) opts.onChange(serializeMarkdown(next.doc));
    },
  });

  return {
    destroy: () => view.destroy(),
    focus: () => view.focus(),
  };
}
