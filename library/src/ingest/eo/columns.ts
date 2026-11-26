import { findLooseCodes } from '../../core/codes.js';
import type { PdfLine } from '../pdf/lines.js';
import { joinWrapped } from './prose.js';

export interface Statement {
  codes: string[];
  text: string;
  /** y of the statement's first line, to place it under the right organiser. */
  top: number;
}

/**
 * Lines whose left edges are this close belong to one column: bullets indent by about 18 and
 * some first lines by 45, while columns are at least 110 apart.
 */
const COLUMN_SNAP = 50;
/** A code sits at most this far below the last line of its statement. */
const CODE_REACH = 40;

interface Column {
  x: number;
  lines: PdfLine[];
}

function columnsOf(lines: PdfLine[]): Column[] {
  const columns: Column[] = [];
  for (const line of [...lines].sort((a, b) => a.x - b.x)) {
    const last = columns.at(-1);
    if (last && line.x - last.x <= COLUMN_SNAP) last.lines.push(line);
    else columns.push({ x: line.x, lines: [line] });
  }
  return columns;
}

/** Codes split over lines (`LIT 0-01a /` above `LIT 0-20a`) become one group. */
function codeGroups(codeLines: PdfLine[]): PdfLine[] {
  const groups: PdfLine[] = [];
  for (const line of [...codeLines].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const g = groups.find((p) => p.text.trim().endsWith('/') && p.y - line.y > 0 && p.y - line.y <= 14 && Math.abs(p.x - line.x) < 80);
    if (g) {
      g.text = `${g.text} ${line.text}`;
      g.y = line.y;
      g.x = Math.min(g.x, line.x);
      g.right = Math.max(g.right, line.right);
    } else groups.push({ ...line });
  }
  return groups;
}

/**
 * The column a code closes: of the columns with text just above the code, the one that
 * starts furthest right while still starting left of the code (codes sit right-aligned).
 */
function columnFor(code: PdfLine, columns: Column[]): Column | null {
  let best: Column | null = null;
  for (const column of columns) {
    if (column.x > code.x + 5 || (best && column.x <= best.x)) continue;
    // Usually below the text; sometimes on the same baseline, to its right.
    const near = column.lines.some((line) => {
      const dy = line.y - code.y;
      return (dy > 2 && dy <= CODE_REACH) || (Math.abs(dy) <= 2 && code.x > line.right);
    });
    if (near) best = column;
  }
  return best;
}

/**
 * Pairs each experience and outcome with its code. In the PDFs the code comes under the
 * statement, right-aligned in its column; pdf.js does not always keep them in order, so this
 * works from positions: each column read top to bottom, a code closing the text above it.
 * Text that no code closes comes back in `orphans`, and codes with no text in `lost`.
 */
export function pairStatements(textLines: PdfLine[], codeLines: PdfLine[]) {
  const columns = columnsOf(textLines);
  const closers = new Map<Column, PdfLine[]>();
  const lost: string[][] = [];
  for (const code of codeGroups(codeLines)) {
    const column = columnFor(code, columns);
    if (!column) lost.push(findLooseCodes(code.text));
    else closers.set(column, [...(closers.get(column) ?? []), code]);
  }

  const statements: Statement[] = [];
  const orphans: { text: string; top: number }[] = [];
  for (const column of columns) {
    const events = [...column.lines.map((l) => ({ line: l, code: false })), ...(closers.get(column) ?? []).map((l) => ({ line: l, code: true }))];
    events.sort((a, b) => b.line.y - a.line.y || Number(a.code) - Number(b.code));
    let text = '';
    let top = 0;
    for (const { line, code } of events) {
      if (code) {
        if (text.length > 0) statements.push({ codes: findLooseCodes(line.text), text, top });
        else lost.push(findLooseCodes(line.text));
        text = '';
        continue;
      }
      if (text.length === 0) top = line.y;
      text = line.text.startsWith('•') ? `${text} ${line.text}`.trim() : joinWrapped(text, line.text);
    }
    if (text.length > 0) orphans.push({ text, top });
  }
  return { statements, orphans, lost };
}
