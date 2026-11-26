/**
 * A table block as Word lays it out: the column widths it gets from the colwidths line (pixels,
 * 0 or missing sharing what is left), each row's height, and what each column's content needs.
 * The checks on columns are in tableChecks.ts.
 */
import { lineHeight, textWidth, type Face } from "./fonts.js";
import { inlineRuns, wrap } from "./text.js";
import { BODY, CELL, PAGE, PX } from "./word.js";

export interface LaidColumn {
  /** The header cell's text in quotes, or "column N (no heading)". */
  name: string;
  /** Width set in the colwidths line, in pixels (0: shares what is left). */
  setPx: number;
  /** Width Word gives it, in points. */
  width: number;
  /** Widest cell on one line, with padding, in points. */
  natural: number;
  /** Longest word, with padding: narrower than this, Word breaks the word. */
  minimum: number;
  /** The longest word. */
  longestWord: string;
  /** Body rows whose cell in this column takes more than one line. */
  wrappedRows: number;
  /** Every body cell is empty (space for pupils to write). */
  emptyBody: boolean;
  /** Every body cell holds the same short text (such as ☐), or null. */
  sameShort: string | null;
}

export interface LaidTable {
  columns: LaidColumn[];
  rows: Array<{ height: number; header: boolean }>;
  /** Total of the set widths, in pixels. */
  setTotalPx: number;
  hasHeader: boolean;
}

const SEP_RE = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const WIDTHS_RE = /^<!--\s*colwidths:\s*([\d\s]*)-->$/;
const COMMENT_RE = /^<!--.*-->$/;

function cells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

/** The table's rows of cells, whether the first is a header, and the set widths. */
export function parseTable(content: string): { rows: string[][]; header: boolean; widths: number[] } {
  let lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");
  let widths: number[] = [];
  while (lines.length > 1 && COMMENT_RE.test(lines[lines.length - 1]!.trim())) {
    const w = WIDTHS_RE.exec(lines[lines.length - 1]!.trim());
    if (w) widths = w[1]!.trim().split(/\s+/).map((n) => Number(n) || 0);
    lines = lines.slice(0, -1);
  }
  const header = lines.length > 1 && SEP_RE.test(lines[1]!);
  const rows = lines.filter((_, i) => !(i === 1 && header)).map(cells);
  const n = Math.max(1, ...rows.map((r) => r.length));
  return { rows: rows.map((r) => Array.from({ length: n }, (_, j) => r[j] ?? "")), header, widths };
}

/** Widths Word gives the columns, in points: set ones as set, the rest sharing what is left. */
export function columnWidths(setPx: readonly number[], n: number): number[] {
  const set = Array.from({ length: n }, (_, j) => (setPx[j] ?? 0) * PX);
  const fixed = set.reduce((a, b) => a + b, 0);
  const free = set.filter((w) => w === 0).length;
  if (free === 0) return set.map((w) => (w * PAGE.width) / fixed);
  // Set widths wider than the page are squeezed, leaving the others a sliver.
  const room = PAGE.width - fixed;
  if (room < free * 20) return set.map((w) => (w === 0 ? 20 : (w * (PAGE.width - free * 20)) / fixed));
  return set.map((w) => (w === 0 ? room / free : w));
}

export function layTable(content: string, f: Face): LaidTable {
  const { rows, header, widths: setPx } = parseTable(content);
  const n = rows[0]?.length ?? 1;
  const widths = columnWidths(setPx, n);
  const lh = lineHeight(f, BODY.size, CELL.multiple);
  const body = header ? rows.slice(1) : rows;
  const columns = widths.map((width, j): LaidColumn => {
    let natural = 0;
    let minimum = 0;
    let longestWord = "";
    rows.forEach((r, i) => {
      const bold = header && i === 0;
      const text = inlineRuns(r[j]!).map((x) => x.text).join("");
      natural = Math.max(natural, textWidth(text, f, BODY.size, bold) + CELL.padding);
      for (const w of text.split(/\s+/)) {
        const ww = textWidth(w, f, BODY.size, bold) + CELL.padding;
        if (ww > minimum) [minimum, longestWord] = [ww, w];
      }
    });
    const wrappedRows = body.filter((r) => wrap(inlineRuns(r[j]!), width - CELL.padding, f, BODY.size).length > 1).length;
    const texts = body.map((r) => inlineRuns(r[j]!).map((x) => x.text).join("").trim());
    const sameShort = texts.length > 0 && texts.every((t) => t === texts[0] && t.length > 0 && t.length <= 3) ? texts[0]! : null;
    const name = header ? inlineRuns(rows[0]![j]!).map((x) => x.text).join("").trim() : "";
    return { name: name ? `"${name}"` : `column ${j + 1} (no heading)`, setPx: setPx[j] ?? 0, width, natural, minimum, longestWord, wrappedRows, emptyBody: texts.every((t) => t === ""), sameShort };
  });
  const laidRows = rows.map((r, i) => {
    const lines = Math.max(1, ...r.map((c, j) => wrap(inlineRuns(c, header && i === 0), widths[j]! - CELL.padding, f, BODY.size).length));
    return { height: lines * lh + CELL.border, header: header && i === 0 };
  });
  return { columns, rows: laidRows, setTotalPx: setPx.reduce((a, b) => a + b, 0), hasHeader: header };
}
