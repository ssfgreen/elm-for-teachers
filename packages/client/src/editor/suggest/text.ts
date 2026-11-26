/**
 * A block's text as one string, with where each character sits in the document, so a diff over
 * the text can be drawn back onto the editor. Each paragraph (a list item, a table cell) is
 * joined to the one before by a line break, and so is a hard break inside one.
 */
import type { Node, Schema } from "@tiptap/pm/model";
import type { BlockType } from "@edw/shared";
import { blockToNode } from "../markdown.js";

export interface FlatText {
  text: string;
  /** Document position of each character; a joining line break sits at the end of the paragraph before it. */
  pos: number[];
  /** Where text ends: after the last paragraph's content. */
  end: number;
}

/** `start` is the position before `node` (0 to read a detached node from its own start). */
export function flatText(node: Node, start = 0): FlatText {
  const pos: number[] = [];
  let text = "";
  let end = start + 1;
  let seen = false;
  const content = start + 1;
  if (node.isTextblock) {
    readTextblock(node, content);
    return { text, pos, end };
  }
  node.descendants((child, p) => {
    if (!child.isTextblock) return true;
    readTextblock(child, content + p + 1);
    return false;
  });
  return { text, pos, end };

  function readTextblock(tb: Node, from: number) {
    if (seen) {
      text += "\n";
      pos.push(end);
    }
    seen = true;
    tb.forEach((inline, off) => {
      const at = from + off;
      if (inline.isText) {
        const t = inline.text ?? "";
        for (let i = 0; i < t.length; i++) pos.push(at + i);
        text += t;
      } else if (inline.type.name === "hardBreak") {
        text += "\n";
        pos.push(at);
      } else if (inline.type.name === "writingLine") {
        // One character for the one position, so a diff can mark a line added or taken out.
        text += "_";
        pos.push(at);
      }
    });
    end = from + tb.content.size;
  }
}

/** A block's markdown as the editor node it would be. */
export function nodeOf(schema: Schema, type: BlockType, content: string): Node {
  return blockToNode(schema, { id: "x", session_id: "", doc_id: "", type, content, status: "live", version: 0, derived_from: null, order: 0, pending: null, created_at: "", updated_at: "" });
}

/** Plain text of a block's markdown as the editor shows it. */
export function plainTextOf(schema: Schema, type: BlockType, content: string): string {
  return flatText(nodeOf(schema, type, content)).text;
}
