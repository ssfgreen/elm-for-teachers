/**
 * The canvas is a flat list of server blocks; the editor is a Tiptap document whose
 * top-level nodes are those blocks, one to one. This table is the only place that
 * maps a server `BlockType` to a Tiptap node name and back.
 */
import type { BlockType } from "@edw/shared";

export const NODE_FOR_TYPE: Record<BlockType, string> = {
  paragraph: "paragraph",
  heading: "heading",
  bullet_list: "bulletList",
  numbered_list: "orderedList",
  checklist: "taskList",
  bullet_item: "bulletItem",
  numbered_item: "numberedItem",
  checklist_item: "checklistItem",
  quote: "blockquote",
  code_block: "codeBlock",
  divider: "horizontalRule",
  page_break: "pageBreak",
  image: "image",
  table: "table",
};

export const TYPE_FOR_NODE: Record<string, BlockType> = Object.fromEntries(
  Object.entries(NODE_FOR_TYPE).map(([t, n]) => [n, t as BlockType]),
);

/** Node names that may appear at the top level of the document, i.e. are blocks. */
export const TOP_NODE_NAMES: readonly string[] = Object.values(NODE_FOR_TYPE);

export const META_EXTERNAL = "edw-external";
