/**
 * The assistant's suggestions in a doc, in reading order, as the comments column lists them: one
 * card per change inside a suggested edit to a block ("Replace “x” with “y”"), and one per block
 * for a new block, a deletion, a move or a change of formatting only ("Add paragraph: …"). Pure.
 */
import type { BlockType } from "@edw/shared";
import { canvasSchema } from "../extensions/index.js";
import type { PublicBlock } from "../types.js";
import { changeIndexes, diffWords, type WordDiffPart as Part } from "@edw/shared";
import { plainTextOf } from "./text.js";

export type SuggestionKind = "insert" | "replace" | "delete" | "move";

/** One change inside a block: text added, text taken out, or one for the other. */
export interface TextChange {
  ins: string;
  del: string;
}

export interface Suggestion {
  block_id: string;
  /** For one change inside a suggested edit: its index among the block's changes; null for the whole block. */
  part: number | null;
  kind: SuggestionKind;
  /** "Add paragraph", "Delete heading", "Edit table"… */
  title: string;
  /** For one change inside a suggested edit, that change (one entry); otherwise none. */
  changes: TextChange[];
  /** The block's text (the suggested text for an insert or replace), for a quote on the card. */
  text: string;
  /** Position in the doc, for ordering with comment threads. */
  order: number;
}

const NOUN: Record<BlockType, string> = {
  paragraph: "paragraph",
  heading: "heading",
  bullet_list: "list",
  numbered_list: "list",
  checklist: "checklist",
  bullet_item: "list item",
  numbered_item: "list item",
  checklist_item: "checklist item",
  quote: "quote",
  code_block: "code",
  divider: "divider",
  page_break: "page break",
  image: "picture",
  table: "table",
};

const awaits = (b: PublicBlock) => b.status === "proposed" || (b.status === "live" && b.pending !== null);

export function kindOf(b: PublicBlock): SuggestionKind | null {
  if (b.status === "proposed") return "insert";
  if (b.status !== "live" || !b.pending) return null;
  return b.pending.op;
}

/** Plain text of a block's markdown as the editor shows it. */
export const plainText = (type: BlockType, content: string) => plainTextOf(canvasSchema(), type, content);

/** The word diff a pending replace shows: from the block's text to the suggested text. */
export function replaceDiff(b: PublicBlock): Part[] {
  if (b.pending?.op !== "replace") return [];
  return diffWords(plainText(b.type, b.content), plainText(b.type, b.pending.content));
}

/** Parts grouped into changes: an insertion and the deletion right after it are one replacement. */
export function textChanges(parts: Part[]): TextChange[] {
  const out: TextChange[] = [];
  const index = changeIndexes(parts);
  parts.forEach((p, k) => {
    if (p.kind === "same") return;
    const c = (out[index[k]!] ??= { ins: "", del: "" });
    c[p.kind] += p.text;
  });
  return out;
}

/** A block's suggestion cards: one per change for a suggested edit to its text, otherwise one. */
export function suggestionsOf(b: PublicBlock, order: number): Suggestion[] {
  const kind = kindOf(b);
  if (!kind) return [];
  const noun = NOUN[b.type];
  const shown = b.pending?.op === "replace" ? b.pending.content : b.content;
  const text = plainText(b.type, shown).trim();
  const whole = (title: string): Suggestion[] => [{ block_id: b.id, part: null, kind, title, changes: [], text, order }];
  switch (kind) {
    case "insert":
      return whole(`Add ${noun}`);
    case "delete":
      return whole(`Delete ${noun}`);
    case "move":
      return whole(`Move ${noun}`);
    case "replace": {
      const parts = textChanges(replaceDiff(b));
      if (!parts.length) return whole(b.type === "image" ? "Change picture" : `Format ${noun}`);
      return parts.map((c, i) => ({ block_id: b.id, part: i, kind, title: `Edit ${noun}`, changes: [c], text, order }));
    }
  }
}

/** The doc's suggestions, in reading order. */
export function suggestionsIn(blocks: PublicBlock[], docId: string): Suggestion[] {
  return blocks
    .filter((b) => b.doc_id === docId && awaits(b))
    .sort((a, b) => a.order - b.order)
    .flatMap((b) => suggestionsOf(b, b.order));
}
