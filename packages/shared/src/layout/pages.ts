/**
 * Lays laid-out blocks into A4 pages the way Word does, closely enough to judge a worksheet
 * (the same rules as client/src/export/paginate.ts, which does it in the browser for the preview):
 *
 *  - a page break starts a new page; its own empty paragraph goes to the top of that page, as
 *    in Word, where the paragraph mark after a break moves down with the text;
 *  - a heading stays whole, on the page of the first line of what follows it;
 *  - a paragraph or list item runs over line by line; a table row by row, its header row repeated;
 *  - space before is dropped at the top of a page.
 */
import type { LaidBlock } from "./blocks.js";
import { PAGE } from "./word.js";

export interface Placement {
  /** Pages the block starts and ends on, from 1. */
  first: number;
  last: number;
  /** Lines (or body rows, for a table) on its first page, when it runs over. */
  onFirst: number;
  /** Lines (or body rows) in all. */
  total: number;
}

export interface PageInfo {
  number: number;
  /** Points used. */
  used: number;
  /** Blocks with any part on the page (indexes). */
  blocks: number[];
  /** The page ends at a page break rather than when it is full. */
  endsAtBreak: boolean;
}

interface Unit {
  height: number;
}

function units(b: LaidBlock): { units: Unit[]; header: number } {
  if (b.table) {
    const header = b.table.rows[0]?.header ? b.table.rows[0].height : 0;
    return { units: b.table.rows.map((r) => ({ height: r.height })), header };
  }
  return { units: b.lines.map((l) => ({ height: l.height })), header: 0 };
}

export function paginate(blocks: readonly LaidBlock[]): { pages: PageInfo[]; places: Placement[] } {
  const pages: PageInfo[] = [{ number: 1, used: 0, blocks: [], endsAtBreak: false }];
  const places: Placement[] = [];
  let y = 0;
  const page = () => pages[pages.length - 1]!;
  const newPage = (atBreak: boolean) => {
    page().used = Math.max(page().used, y);
    page().endsAtBreak = atBreak;
    pages.push({ number: pages.length + 1, used: 0, blocks: [], endsAtBreak: false });
    y = 0;
  };
  const note = (i: number) => {
    if (!page().blocks.includes(i)) page().blocks.push(i);
  };

  blocks.forEach((b, i) => {
    if (b.pageBreak) newPage(true);
    const { units: us, header } = units(b);
    const before = y === 0 ? 0 : b.before;
    // What must fit on this page for the block to start here: a heading whole, with the first
    // line (or first rows) of the next block; anything else, its first line or row.
    let need = before + (us[0]?.height ?? 0);
    if (b.keepWithNext) {
      const next = blocks[i + 1];
      const after = next && !next.pageBreak ? units(next) : null;
      const nextFirst = after ? (after.units[0]?.height ?? 0) + (after.header ? (after.units[1]?.height ?? 0) : 0) + next!.before : 0;
      need = before + us.reduce((h, u) => h + u.height, 0) + b.after + nextFirst;
    } else if (b.table && header) need += us[1]?.height ?? 0;
    if (y > 0 && y + need > PAGE.height) newPage(false);
    y += y === 0 ? 0 : b.before;

    const place: Placement = { first: page().number, last: page().number, onFirst: 0, total: b.table ? us.length - (header ? 1 : 0) : us.length };
    let counted = 0;
    note(i);
    us.forEach((u, k) => {
      const whole = b.keepWithNext;
      if (!whole && y > 0 && y + u.height > PAGE.height) {
        if (place.first === page().number) place.onFirst = counted;
        newPage(false);
        note(i);
        if (header && k > 0) y += header;
      }
      y += u.height;
      if (!(header && k === 0)) counted += 1;
    });
    place.last = page().number;
    if (place.first === place.last) place.onFirst = place.total;
    places.push(place);
    y += b.after;
  });
  page().used = Math.max(page().used, y);
  return { pages, places };
}
