import MarkdownIt from "markdown-it";
import {
  defaultMarkdownSerializer,
  MarkdownParser,
  MarkdownSerializer,
} from "prosemirror-markdown";
import type { Node } from "prosemirror-model";
import { mdSchema } from "./schema.js";

// markdown-it "zero" disables ALL rules; enable only what maps to our schema (lists + paragraphs +
// inline text). Headings/emphasis/etc stay disabled, so unsupported markdown stays literal text.
const md = MarkdownIt("zero", { html: false }).enable(["list", "paragraph", "text", "newline"]);

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
