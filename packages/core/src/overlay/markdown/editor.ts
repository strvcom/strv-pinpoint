import { registerList } from "@lexical/list";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  registerMarkdownShortcuts,
} from "@lexical/markdown";
import { registerRichText } from "@lexical/rich-text";
import { mergeRegister } from "@lexical/utils";
import { COMMAND_PRIORITY_LOW, createEditor, KEY_ENTER_COMMAND, KEY_ESCAPE_COMMAND } from "lexical";
import { MD_NODES, MD_TRANSFORMERS } from "./markdown.js";

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

/**
 * Mounts a minimal Lexical editor into `host`: bold/italic/strikethrough/inline-code marks + bullet/
 * ordered lists + fenced code blocks, all via keyboard/markdown shortcuts (NO toolbar). The comment
 * round-trips as Markdown. Shift+Enter saves, Escape discards. Vanilla — no Preact binding (TASK-31).
 */
export function createMarkdownEditor(
  host: HTMLElement,
  opts: MarkdownEditorOptions,
): MarkdownEditorHandle {
  const editor = createEditor({
    namespace: "pp-md",
    nodes: MD_NODES,
    onError: (e) => console.error("[pinpoint] markdown editor:", e),
  });
  editor.setRootElement(host);

  let ready = false; // skip the onChange fired by the initial content load
  const cleanup = mergeRegister(
    registerRichText(editor),
    registerList(editor),
    registerMarkdownShortcuts(editor, MD_TRANSFORMERS),
    editor.registerCommand(
      KEY_ENTER_COMMAND,
      (e) => {
        if (e?.shiftKey) {
          e.preventDefault();
          opts.onSave();
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        opts.onDiscard();
        return true;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
      if (!ready || (dirtyElements.size === 0 && dirtyLeaves.size === 0)) return;
      editorState.read(() => opts.onChange($convertToMarkdownString(MD_TRANSFORMERS)));
    }),
  );

  // Load the initial markdown before marking ready, so init doesn't fire onChange.
  editor.update(
    () => {
      $convertFromMarkdownString(opts.value ?? "", MD_TRANSFORMERS);
    },
    { discrete: true },
  );
  ready = true;

  return {
    destroy: () => {
      cleanup();
      editor.setRootElement(null);
    },
    focus: () => editor.focus(),
  };
}
