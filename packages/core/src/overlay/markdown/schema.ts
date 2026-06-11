import { Schema } from "prosemirror-model";
import { addListNodes } from "prosemirror-schema-list";

// Minimal node set: paragraphs + text only at the base; lists added below. NO heading, NO marks —
// so "no titles, lists only" is structural (there is no node to hold a heading or bold) (TASK-31).
const base = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "inline*",
      parseDOM: [{ tag: "p" }],
      toDOM: () => ["p", 0],
    },
    text: { group: "inline" },
  },
  marks: {},
});

export const mdSchema: Schema = new Schema({
  // list_item content "paragraph block*" → items hold a paragraph (+ nested lists); group "block".
  // base.spec.nodes is an OrderedMap, which addListNodes requires.
  nodes: addListNodes(base.spec.nodes, "paragraph block*", "block"),
  marks: {},
});
