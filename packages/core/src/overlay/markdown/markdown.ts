import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { ListItemNode, ListNode } from "@lexical/list";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  CODE,
  ORDERED_LIST,
  TEXT_FORMAT_TRANSFORMERS,
  UNORDERED_LIST,
} from "@lexical/markdown";
import { createEditor, type Klass, type LexicalNode } from "lexical";

// Nodes the transformers below can create. NO heading/quote (no titles), NO link (TASK-31).
export const MD_NODES: Array<Klass<LexicalNode>> = [
  ListNode,
  ListItemNode,
  CodeNode,
  CodeHighlightNode,
];

// Allowed formatting: bold/italic/strikethrough/inline-code (TEXT_FORMAT) + bullet/ordered lists +
// fenced code block. NO headings, NO underline (no markdown syntax), NO links/quotes (TASK-31).
export const MD_TRANSFORMERS = [CODE, UNORDERED_LIST, ORDERED_LIST, ...TEXT_FORMAT_TRANSFORMERS];

/** Headless markdown round-trip (no DOM) — used by tests and to normalize stored comments. */
export function roundTripMarkdown(md: string): string {
  const editor = createEditor({
    nodes: MD_NODES,
    onError: (e) => {
      throw e;
    },
  });
  let out = "";
  editor.update(
    () => {
      $convertFromMarkdownString(md ?? "", MD_TRANSFORMERS);
    },
    { discrete: true },
  );
  editor.getEditorState().read(() => {
    out = $convertToMarkdownString(MD_TRANSFORMERS);
  });
  return out;
}
