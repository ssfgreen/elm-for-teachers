/**
 * A reading's block as the pupil's reader shows it (#213): what kind of block it is, and its text
 * with the markup taken off, in runs that each know where they start in the block's text. A
 * highlight's `start` and `end` count in that text, so the server checks them here and the page
 * draws from the same runs. Runs are joined with "\n" in the text. Pictures, rules and page breaks
 * have no text. Pure; the same block contents as the editor (client/src/editor/markdown.ts).
 */
import { isListItem, isOldList, parseItem, splitList } from "./lists.js";
import { cleanSvg, isSvgContent } from "./svg.js";

/** A stretch of text with the inline marks the reader draws. */
export interface Inline {
  text: string;
  bold?: true;
  italic?: true;
  underline?: true;
  code?: true;
  /** An http(s) or mailto link. */
  href?: string;
}

/** A run of a block's text: where it starts in the block's reader text, and its pieces in order. */
export interface TextRun {
  from: number;
  parts: Inline[];
}

export type ListKind = "bullet" | "numbered" | "check";

export type ReaderView =
  | { kind: "heading"; level: 1 | 2 | 3; run: TextRun }
  | { kind: "paragraph"; run: TextRun }
  | { kind: "quote"; lines: TextRun[] }
  | { kind: "code"; run: TextRun }
  | { kind: "item"; list: ListKind; number: number; checked: boolean; run: TextRun }
  | { kind: "list"; list: ListKind; start: number; items: { checked: boolean; run: TextRun }[] }
  | { kind: "table"; header: boolean; rows: TextRun[][] }
  | { kind: "picture"; alt: string; asset_id: string | null; svg: string | null }
  | { kind: "rule" }
  | { kind: "none" };

export interface ReaderBlock {
  id: string;
  /** The block's text as the reader shows it: what a highlight's offsets count in. */
  text: string;
  view: ReaderView;
}

const HEADING_RE = /^(#{1,3})\s+/;
const QUOTE_RE = /^>\s?/;
const IMAGE_RE = /^!\[([^\]]*)\]\(([^)]*)\)/;
const ASSET_RE = /^asset:([A-Za-z0-9_-]+)$/;
const TABLE_SEP_RE = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const TABLE_NOTE_RE = /^<!--\s*(colwidths|header):.*-->$/;
const SPAN_OPEN_RE = /^<span data-(?:color|font|size)="[a-z_]+">/;
const URL_RE = /^(?:https?:\/\/|mailto:)[^\s)]+/;
const LINE_TAG = "<line/>";

const lines = (s: string) => s.split(/\r?\n/);

/** Where a link starting with `[` at `i` ends, or null when the bracket is just text. */
function linkAt(md: string, i: number): { close: number; href: string; end: number } | null {
  for (let j = i + 1; j < md.length; j++) {
    const ch = md[j]!;
    if (ch === "\n") return null;
    if (ch === "\\") {
      j += 1;
      continue;
    }
    if (ch === "]") {
      if (md[j + 1] !== "(") return null;
      const url = URL_RE.exec(md.slice(j + 2));
      if (!url || md[j + 2 + url[0].length] !== ")") return null;
      return { close: j, href: url[0], end: j + 3 + url[0].length };
    }
  }
  return null;
}

type Flag = "bold" | "italic" | "underline" | "code";

/**
 * Inline markdown as the editor writes it (editor/inline.ts) read into marked pieces: bold,
 * italic, underline, code and links are kept; colour, font, size and the editor's own highlight
 * are dropped (the pupil's highlights are the colours on this page). With `breaks`, a line break
 * stays "\n"; otherwise it reads as a space.
 */
export function inlineParts(md: string, breaks = false): Inline[] {
  const out: Inline[] = [];
  const on = new Set<Flag>();
  let href: string | undefined;
  let link: { close: number; end: number } | null = null;
  let spans = 0;
  let buf = "";
  const flush = () => {
    if (!buf) return;
    const p: Inline = { text: buf };
    for (const f of on) p[f] = true;
    if (href) p.href = href;
    out.push(p);
    buf = "";
  };
  const toggle = (f: Flag) => {
    flush();
    if (on.has(f)) on.delete(f);
    else on.add(f);
  };
  let i = 0;
  while (i < md.length) {
    if (link && i === link.close) {
      flush();
      href = undefined;
      i = link.end;
      link = null;
      continue;
    }
    const ch = md[i]!;
    const inCode = on.has("code");
    if (ch === "\\" && i + 1 < md.length && !inCode) {
      buf += md[i + 1];
      i += 2;
      continue;
    }
    if (ch === "`") {
      toggle("code");
      i += 1;
      continue;
    }
    if (ch === "\n" || (ch === "\r" && md[i + 1] === "\n")) {
      i += ch === "\r" ? 2 : 1;
      buf += breaks ? "\n" : " ";
      continue;
    }
    if (inCode) {
      buf += ch;
      i += 1;
      continue;
    }
    if (md.startsWith("**", i)) {
      toggle("bold");
      i += 2;
      continue;
    }
    if (ch === "*") {
      toggle("italic");
      i += 1;
      continue;
    }
    if (ch === "<") {
      if (md.startsWith(LINE_TAG, i)) {
        i += LINE_TAG.length;
        continue;
      }
      const tag = /^<(\/?)(u|mark)>/.exec(md.slice(i, i + 7));
      if (tag) {
        if (tag[2] === "u") {
          flush();
          if (tag[1]) on.delete("underline");
          else on.add("underline");
        }
        i += tag[0].length;
        continue;
      }
      const span = SPAN_OPEN_RE.exec(md.slice(i, i + 40));
      if (span) {
        spans += 1;
        i += span[0].length;
        continue;
      }
      if (spans > 0 && md.startsWith("</span>", i)) {
        spans -= 1;
        i += 7;
        continue;
      }
    }
    if (ch === "[" && !link) {
      const l = linkAt(md, i);
      if (l) {
        flush();
        href = l.href;
        link = { close: l.close, end: l.end };
        i += 1;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

function tableCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

const LIST_OF = { bullet_item: "bullet", numbered_item: "numbered", checklist_item: "check", bullet_list: "bullet", numbered_list: "numbered", checklist: "check" } as const;

/** A reading's block read for the pupil's reader. */
export function readerBlock(block: { id: string; type: string; content: string }): ReaderBlock {
  let text = "";
  let pieces = 0;
  /** Adds a run to the block's text, after a "\n" unless it is the first. */
  const add = (parts: Inline[]): TextRun => {
    if (pieces > 0) text += "\n";
    pieces += 1;
    const from = text.length;
    text += parts.map((p) => p.text).join("");
    return { from, parts };
  };
  const run = (md: string, breaks = false) => add(inlineParts(md, breaks));
  const c = block.content;
  const view = ((): ReaderView => {
    switch (block.type) {
      case "heading": {
        const m = HEADING_RE.exec(c);
        return { kind: "heading", level: (m ? m[1]!.length : 2) as 1 | 2 | 3, run: run(m ? c.slice(m[0].length) : c) };
      }
      case "paragraph":
        return { kind: "paragraph", run: run(c, true) };
      case "quote":
        return { kind: "quote", lines: lines(c).map((l) => run(l.replace(QUOTE_RE, ""))) };
      case "code_block": {
        let body = lines(c);
        if (body[0]?.startsWith("```")) {
          body = body.slice(1);
          if (body.length && body[body.length - 1]!.trim() === "```") body = body.slice(0, -1);
        }
        // Code is shown as it is written: no inline markup.
        const raw = body.join("\n");
        return { kind: "code", run: add(raw ? [{ text: raw, code: true }] : []) };
      }
      case "divider":
        return { kind: "rule" };
      case "page_break":
        return { kind: "none" };
      case "image": {
        const drawing = isSvgContent(c) ? cleanSvg(c) : null;
        if (drawing) return { kind: "picture", alt: drawing.alt, asset_id: null, svg: drawing.svg };
        const m = IMAGE_RE.exec(c.trim());
        const asset = m ? ASSET_RE.exec(m[2]!.trim()) : null;
        return { kind: "picture", alt: m?.[1] ?? "", asset_id: asset ? asset[1]! : null, svg: null };
      }
      case "table": {
        let raw = lines(c);
        while (raw.length > 1 && TABLE_NOTE_RE.test(raw[raw.length - 1]!.trim())) raw = raw.slice(0, -1);
        const header = raw.length > 1 && TABLE_SEP_RE.test(raw[1]!);
        const rows = raw.filter((_, i) => !(i === 1 && header)).map(tableCells);
        const width = Math.max(1, ...rows.map((r) => r.length));
        return { kind: "table", header, rows: rows.map((cells) => Array.from({ length: width }, (_, j) => run(cells[j] ?? ""))) };
      }
      default:
        if (isListItem(block.type)) {
          const item = parseItem(block.type, c);
          return { kind: "item", list: LIST_OF[block.type], number: item.number, checked: item.checked, run: run(item.text, true) };
        }
        if (isOldList(block.type)) {
          const items = splitList(block.type, c).map((it) => parseItem(it.type, it.content));
          return { kind: "list", list: LIST_OF[block.type], start: items[0]?.number ?? 1, items: items.map((it) => ({ checked: it.checked, run: run(it.text, true) })) };
        }
        return { kind: "paragraph", run: run(c, true) };
    }
  })();
  return { id: block.id, text, view };
}

/** The asset ids a reading's pictures name: the only assets a pupil may fetch through it. */
export function readingAssetIds(blocks: ReadonlyArray<{ id: string; type: string; content: string }>): string[] {
  const ids: string[] = [];
  for (const b of blocks) {
    if (b.type !== "image") continue;
    const v = readerBlock(b).view;
    if (v.kind === "picture" && v.asset_id && !ids.includes(v.asset_id)) ids.push(v.asset_id);
  }
  return ids;
}
