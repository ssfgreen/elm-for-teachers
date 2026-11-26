/**
 * Conversion between server blocks (markdown content strings) and Tiptap nodes.
 *
 * A list item is a block of its own (`bullet_item`, `numbered_item`, `checklist_item`; read and
 * written by @edw/shared's lists.ts): its marker and text, a line break written as a continuation
 * line under the marker. The older whole-list blocks are still read and written as below.
 *
 * Paragraphs keep line breaks as `\n`. A numbered list starts at its first item's number. In lists a line without the item marker
 * continues the item above on a new line (written back indented: "1. Sentence\n   ____"). Headings carry their level as `#`, `##` or `###`; lists one item per line
 * with `- ` or `N. `; checklists `- [ ] ` / `- [x] `; quotes `> ` per line;
 * code blocks fenced; dividers `---`; page breaks no content; images `![alt](src)`; tables one row per
 * line with pipes, a `| --- |` line after the first row marking it as the header, and
 * an optional last line `<!-- colwidths: 120 0 240 -->` holding resized column widths
 * in pixels (0 = flexible), and one `<!-- header: blue -->` holding the header row's colour
 * (only with a header row); markdown viewers hide both.
 * Inline marks are handled by inline.ts.
 */
import type { Node, Schema } from "@tiptap/pm/model";
import type { BlockContent, BlockType } from "@edw/shared";
import { cleanSvg, isListItem, isSvgContent, parseItem, writeItem } from "@edw/shared";
import { NODE_FOR_TYPE, TYPE_FOR_NODE } from "./blockTypes.js";
import { inlineFragment, inlineText, serializeInline } from "./inline.js";
import { hasHeaderRow, isHeaderColor } from "./extensions/tableHeaderColor.js";
import type { PublicBlock } from "./types.js";

const BULLET_RE = /^\s*[-*•]\s+/;
const NUMBER_RE = /^\s*\d+[.)]\s+/;
const CHECK_RE = /^\s*[-*]\s+\[( |x|X)\]\s?/;
const HEADING_RE = /^(#{1,3})\s+/;
const QUOTE_RE = /^>\s?/;
const IMAGE_RE = /^!\[([^\]]*)\]\(([^)]*)\)/;
/** An SVG as a data URL, brackets escaped too so it can sit in `![alt](...)`. */
const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg).replace(/\(/g, "%28").replace(/\)/g, "%29")}`;
const TABLE_SEP_RE = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const COLWIDTHS_RE = /^<!--\s*colwidths:\s*([\d\s]*)-->$/;
const HEADER_COLOR_RE = /^<!--\s*header:\s*([a-z]+)\s*-->$/;

/** What the editor shows: the pending replacement when one exists, else the live content. */
export function displayContent(b: PublicBlock): BlockContent {
  return { content: b.pending?.op === "replace" ? b.pending.content : b.content };
}

const lines = (s: string) => (s.length ? s.split(/\r?\n/) : [""]);

/** List lines grouped into items: a line without the marker continues the item above (as a line break). */
function listItems(content: string, marker: RegExp): string[] {
  const items: string[] = [];
  for (const l of lines(content)) {
    if (marker.test(l) || items.length === 0) items.push(l.replace(marker, ""));
    else items[items.length - 1] += `\n${l.trim()}`;
  }
  return items;
}

/** One list item's text: its paragraph with line breaks, continuation lines indented under the marker. */
function itemText(item: Node, indent: string): string {
  const p = item.firstChild;
  const text = p && p.isTextblock ? serializeInline(p, true) : inlineText(item);
  return text.replace(/\n/g, `\n${indent}`);
}

function tableCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

/** Block attributes every top-level node carries (see extensions/blockAttrs.ts). */
export function blockAttrsOf(b: PublicBlock): Record<string, unknown> {
  return {
    id: b.id,
    status: b.status,
    pending: b.pending,
    original: b.pending?.op === "replace" ? b.content : null,
  };
}

export function blockToNode(schema: Schema, b: PublicBlock): Node {
  const c = displayContent(b);
  const base = blockAttrsOf(b);
  const n = schema.nodes;
  const para = (text: string) => n.paragraph!.create(null, inlineFragment(schema, text));
  switch (b.type) {
    case "heading": {
      const m = HEADING_RE.exec(c.content);
      const level = m ? m[1]!.length : 2;
      return n.heading!.create({ ...base, level }, inlineFragment(schema, m ? c.content.slice(m[0].length) : c.content));
    }
    case "quote":
      return n.blockquote!.create(
        base,
        lines(c.content).map((l) => para(l.replace(QUOTE_RE, ""))),
      );
    case "bullet_list":
    case "numbered_list": {
      const re = b.type === "bullet_list" ? BULLET_RE : NUMBER_RE;
      // A numbered list keeps the number it starts at ("3. ..." continues an earlier list).
      const start = b.type === "numbered_list" ? Number(/^\s*(\d+)/.exec(c.content)?.[1] ?? 1) || 1 : undefined;
      return n[NODE_FOR_TYPE[b.type]]!.create(
        start === undefined || start === 1 ? base : { ...base, start },
        listItems(c.content, re).map((t) => n.listItem!.create(null, n.paragraph!.create(null, inlineFragment(schema, t, true)))),
      );
    }
    case "checklist":
      return n.taskList!.create(
        base,
        lines(c.content)
          .reduce<string[]>((items, l) => {
            if (CHECK_RE.test(l) || BULLET_RE.test(l) || items.length === 0) items.push(l);
            else items[items.length - 1] += `\n${l.trim()}`;
            return items;
          }, [])
          .map((l) => {
            const m = CHECK_RE.exec(l);
            const checked = m ? m[1]!.toLowerCase() === "x" : false;
            const text = m ? l.slice(m[0].length) : l.replace(BULLET_RE, "");
            return n.taskItem!.create({ checked }, n.paragraph!.create(null, inlineFragment(schema, text, true)));
          }),
      );
    case "bullet_item":
    case "numbered_item":
    case "checklist_item": {
      const item = parseItem(b.type, c.content);
      const attrs = b.type === "numbered_item" ? { number: item.number } : b.type === "checklist_item" ? { checked: item.checked } : {};
      return n[NODE_FOR_TYPE[b.type]]!.create({ ...base, ...attrs }, inlineFragment(schema, item.text, true));
    }
    case "code_block": {
      let body = c.content;
      if (body.startsWith("```")) {
        const parts = body.split(/\r?\n/);
        parts.shift();
        if (parts.length && parts[parts.length - 1]!.trim() === "```") parts.pop();
        body = parts.join("\n");
      }
      return n.codeBlock!.create(base, body.length ? schema.text(body) : undefined);
    }
    case "divider":
      return n.horizontalRule!.create(base);
    case "page_break":
      return n.pageBreak!.create(base);
    case "image": {
      // A drawing the assistant is still writing (live edits): shown as it is, until the server stores it.
      const drawing = isSvgContent(c.content) ? cleanSvg(c.content) : null;
      if (drawing) return n.image!.create({ ...base, alt: drawing.alt, src: svgDataUrl(drawing.svg) });
      const m = IMAGE_RE.exec(c.content.trim());
      return n.image!.create({ ...base, alt: m?.[1] ?? "", src: m?.[2] ?? "" });
    }
    case "table": {
      let raw = lines(c.content);
      // The trailing comment lines, in either order.
      let widthsLine: RegExpExecArray | null = null;
      let colorLine: RegExpExecArray | null = null;
      while (raw.length > 1) {
        const last = raw[raw.length - 1]!.trim();
        const w: RegExpExecArray | null = widthsLine ? null : COLWIDTHS_RE.exec(last);
        const h: RegExpExecArray | null = colorLine ? null : HEADER_COLOR_RE.exec(last);
        if (!w && !h) break;
        widthsLine ??= w;
        colorLine ??= h;
        raw = raw.slice(0, -1);
      }
      const colwidths = widthsLine ? widthsLine[1]!.trim().split(/\s+/).map((w) => Number(w) || 0) : [];
      const header = raw.length > 1 && TABLE_SEP_RE.test(raw[1]!);
      const rows = raw.filter((l, i) => !(i === 1 && header)).map(tableCells);
      const width = Math.max(1, ...rows.map((r) => r.length));
      const headerColor = header && isHeaderColor(colorLine?.[1]) ? colorLine[1] : null;
      return n.table!.create(
        { ...base, headerColor },
        rows.map((cells, i) =>
          n.tableRow!.create(
            null,
            Array.from({ length: width }, (_, j) =>
              (i === 0 && header ? n.tableHeader! : n.tableCell!).create(colwidths[j] ? { colwidth: [colwidths[j]] } : null, para(cells[j] ?? "")),
            ),
          ),
        ),
      );
    }
    default:
      return n.paragraph!.create(base, inlineFragment(schema, c.content, true));
  }
}

export function nodeToContent(node: Node): BlockContent {
  let content: string;
  const items: string[] = [];
  switch (node.type.name) {
    case "heading":
      content = `${"#".repeat(Math.min(3, Math.max(1, Number(node.attrs.level) || 2)))} ${serializeInline(node)}`;
      break;
    case "blockquote":
      node.forEach((p) => items.push(`> ${inlineText(p)}`));
      content = items.join("\n");
      break;
    case "bulletList":
      node.forEach((i) => items.push(`- ${itemText(i, "  ")}`));
      content = items.join("\n");
      break;
    case "orderedList":
      node.forEach((i, _o, idx) => items.push(`${(Number(node.attrs.start) || 1) + idx}. ${itemText(i, "   ")}`));
      content = items.join("\n");
      break;
    case "taskList":
      node.forEach((i) => items.push(`- [${i.attrs.checked ? "x" : " "}] ${itemText(i, "      ")}`));
      content = items.join("\n");
      break;
    case "bulletItem":
    case "numberedItem":
    case "checklistItem": {
      const type = TYPE_FOR_NODE[node.type.name]!;
      if (!isListItem(type)) throw new Error(`not a list item: ${node.type.name}`);
      content = writeItem(type, { text: serializeInline(node, true), number: Number(node.attrs.number) || 1, checked: !!node.attrs.checked });
      break;
    }
    case "codeBlock":
      content = "```\n" + node.textContent + "\n```";
      break;
    case "horizontalRule":
      content = "---";
      break;
    case "pageBreak":
      content = "";
      break;
    case "image":
      content = `![${(node.attrs.alt as string | null) ?? ""}](${(node.attrs.src as string | null) ?? ""})`;
      break;
    case "table": {
      const header = hasHeaderRow(node);
      node.forEach((row, _o, idx) => {
        const cells: string[] = [];
        row.forEach((cell) => cells.push(inlineText(cell)));
        items.push(`| ${cells.join(" | ")} |`);
        if (idx === 0 && header) items.push(`| ${cells.map(() => "---").join(" | ")} |`);
      });
      // Resized columns: the first row's widths stand for the column (cells are never merged).
      const widths: number[] = [];
      node.firstChild?.forEach((cell) => widths.push(Number((cell.attrs.colwidth as number[] | null)?.[0]) || 0));
      if (widths.some((w) => w > 0)) items.push(`<!-- colwidths: ${widths.map((w) => Math.round(w)).join(" ")} -->`);
      if (header && isHeaderColor(node.attrs.headerColor)) items.push(`<!-- header: ${node.attrs.headerColor} -->`);
      content = items.join("\n");
      break;
    }
    case "paragraph":
      content = serializeInline(node, true);
      break;
    default:
      content = serializeInline(node);
  }
  return { content };
}

export function blockTypeOf(node: Node): BlockType {
  return TYPE_FOR_NODE[node.type.name] ?? "paragraph";
}

/** Blocks shown for a doc, in order. */
export function visibleBlocksOf(blocks: PublicBlock[], docId: string): PublicBlock[] {
  return blocks
    .filter((b) => b.doc_id === docId && (b.status === "live" || b.status === "proposed"))
    .sort((a, b) => a.order - b.order);
}

/**
 * Build the editor document for a doc. An empty doc gets one empty paragraph with
 * no id; the id plugin names it and the sync layer inserts it on the server.
 */
export function docFromBlocks(schema: Schema, blocks: PublicBlock[], docId: string, override?: Map<string, Node>): Node {
  const visible = visibleBlocksOf(blocks, docId);
  if (visible.length === 0) return schema.nodes.doc!.create(null, [schema.nodes.paragraph!.create()]);
  return schema.nodes.doc!.create(
    null,
    visible.map((b) => override?.get(b.id) ?? blockToNode(schema, b)),
  );
}
