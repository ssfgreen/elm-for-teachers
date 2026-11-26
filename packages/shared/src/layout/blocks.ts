/**
 * Each block of a doc laid out as Word sets it: its lines (or a table's rows), their heights,
 * and the space before and after. Pagination (pages.ts) and the checks work from this.
 */
import type { BlockType } from "../enums.js";
import { isListItem, isOldList, parseItem, splitList } from "../lists.js";
import { lineHeight, type Face } from "./fonts.js";
import { layTable, type LaidTable } from "./tables.js";
import { inlineRuns, wrap, type Line } from "./text.js";
import { BODY, HEADINGS, IMAGE_HEIGHT, ITEM_AFTER, LIST_INDENT, PAGE, QUOTE_INDENT } from "./word.js";

export interface LayoutBlock {
  id: string;
  type: BlockType | string;
  content: string;
}

export interface LaidLine extends Line {
  height: number;
}

export interface LaidBlock {
  /** Position in the doc, from 0. */
  index: number;
  id: string;
  type: string;
  content: string;
  /** Width the text has, in points. */
  avail: number;
  lines: LaidLine[];
  before: number;
  after: number;
  /** Headings stay on the page of what follows them, and whole. */
  keepWithNext: boolean;
  /** A paragraph with nothing in it (or only spaces). */
  empty: boolean;
  pageBreak: boolean;
  heading: 1 | 2 | 3 | null;
  table: LaidTable | null;
  /** Height guessed rather than measured (a picture). */
  estimated: boolean;
}

const HEADING_RE = /^(#{1,3})\s+/;

function lay(md: string, f: Face, avail: number, size: number, bold = false, multiple = BODY.multiple): LaidLine[] {
  const h = lineHeight(f, size, multiple);
  return wrap(inlineRuns(md, bold), avail, f, size).map((l) => ({ ...l, height: l.size === size ? h : lineHeight(f, l.size, multiple) }));
}

/** Lays out a doc's blocks, in order. */
export function layBlocks(blocks: readonly LayoutBlock[], f: Face): LaidBlock[] {
  return blocks.map((b, index): LaidBlock => {
    const base: LaidBlock = { index, id: b.id, type: b.type, content: b.content, avail: PAGE.width, lines: [], before: 0, after: BODY.after, keepWithNext: false, empty: false, pageBreak: false, heading: null, table: null, estimated: false };
    const next = blocks[index + 1];
    switch (b.type) {
      case "heading": {
        const m = HEADING_RE.exec(b.content);
        const level = (Math.min(3, m?.[1]!.length ?? 2) || 2) as 1 | 2 | 3;
        const s = HEADINGS[level];
        return { ...base, heading: level, before: s.before, after: s.after, keepWithNext: true, lines: lay(m ? b.content.slice(m[0].length) : b.content, f, PAGE.width, s.size) };
      }
      case "page_break":
        return { ...base, pageBreak: true, lines: lay("", f, PAGE.width, BODY.size) };
      case "divider":
        return { ...base, lines: lay("", f, PAGE.width, BODY.size) };
      case "image":
        return { ...base, estimated: true, lines: [{ ...lay("", f, PAGE.width, BODY.size)[0]!, height: IMAGE_HEIGHT }] };
      case "table": {
        const table = layTable(b.content, f);
        return { ...base, after: 0, table, lines: [] };
      }
      case "quote": {
        const avail = PAGE.width - QUOTE_INDENT;
        const text = b.content.split("\n").map((l) => l.replace(/^>\s?/, "")).join("\n");
        return { ...base, avail, lines: lay(text, f, avail, BODY.size) };
      }
      case "code_block":
        return { ...base, after: 0, lines: lay(b.content.replace(/[*_`]/g, (c) => `\\${c}`), f, PAGE.width, BODY.size, false, 1) };
      default: {
        if (isListItem(b.type)) {
          const item = parseItem(b.type, b.content);
          const checklist = b.type === "checklist_item";
          const avail = checklist ? PAGE.width : PAGE.width - LIST_INDENT;
          const lastOfList = next?.type !== b.type;
          return { ...base, avail, after: lastOfList ? BODY.after : ITEM_AFTER, lines: lay(checklist ? `☐ ${item.text}` : item.text, f, avail, BODY.size) };
        }
        if (isOldList(b.type)) {
          const avail = PAGE.width - LIST_INDENT;
          const text = splitList(b.type, b.content).map((i) => parseItem(i.type, i.content).text).join("\n");
          return { ...base, avail, lines: lay(text, f, avail, BODY.size) };
        }
        const empty = b.content.trim() === "";
        return { ...base, empty, lines: lay(empty ? "" : b.content, f, PAGE.width, BODY.size) };
      }
    }
  });
}

/** The height a laid block takes, lines and space after (space before is the page's to decide). */
export const blockHeight = (b: LaidBlock) => (b.table ? b.table.rows.reduce((h, r) => h + r.height, 0) : b.lines.reduce((h, l) => h + l.height, 0)) + b.after;
