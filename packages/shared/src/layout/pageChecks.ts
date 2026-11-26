/**
 * Where the pages end: pages left mostly empty before a page break, blank pages, a last page
 * with only a few lines on it, tables split leaving one row alone, and questions whose writing
 * lines go over to the next page.
 */
import type { LaidBlock } from "./blocks.js";
import { pct, type LayoutFinding } from "./findings.js";
import type { PageInfo, Placement } from "./pages.js";
import { blankOnly } from "./text.js";
import { BODY, PAGE } from "./word.js";

/** A page ended by a break with less than this on it is mostly empty. */
const SPARSE = 0.25;
/** A last page with less than this on it is a little run over. */
const SPILL = 0.15;

const blockNo = (i: number) => i + 1;
const isBlankLines = (b: LaidBlock) => !b.table && b.lines.length > 0 && b.lines.every(blankOnly);
const hasContent = (b: LaidBlock) => !b.pageBreak && !b.empty && b.type !== "divider";

export function pageFindings(blocks: readonly LaidBlock[], pages: readonly PageInfo[], places: readonly Placement[]): LayoutFinding[] {
  const out: LayoutFinding[] = [];
  const lines = (pt: number) => Math.max(1, Math.round(pt / (BODY.size * 1.2 * BODY.multiple + 2)));

  pages.forEach((p, k) => {
    const content = p.blocks.filter((i) => hasContent(blocks[i]!));
    const last = k === pages.length - 1;
    if (content.length === 0 && pages.length > 1) {
      out.push({ area: "pages", blocks: p.blocks, text: `Page ${p.number} is blank${p.blocks.length ? ` (it has only empty paragraphs or a page break: block${p.blocks.length > 1 ? "s" : ""} ${p.blocks.map(blockNo).join(", ")})` : ""}.` });
      return;
    }
    if (!last && p.endsAtBreak && p.used / PAGE.height < SPARSE) {
      out.push({ area: "pages", blocks: content, text: `Page ${p.number} is only ${pct(p.used / PAGE.height)} full before the page break (it holds block${content.length > 1 ? "s" : ""} ${content.map(blockNo).join(", ")}). Its content could go on the page before, or more could go on it.` });
    }
    const startedByBreak = k > 0 && pages[k - 1]!.endsAtBreak;
    if (last && k > 0 && !startedByBreak && p.used / PAGE.height < SPILL) {
      out.push({ area: "pages", blocks: content, text: `The last page, page ${p.number}, holds only about ${lines(p.used)} line${lines(p.used) === 1 ? "" : "s"} (${pct(p.used / PAGE.height)}): the document runs over page ${p.number - 1} by a little. Taking out that much space earlier (empty paragraphs, or a shorter part) would bring it back onto one page fewer.` });
    }
  });

  blocks.forEach((b, i) => {
    const place = places[i]!;
    if (b.table && place.first < place.last) {
      const rest = place.total - place.onFirst;
      if (place.onFirst <= 1 || rest <= 1) {
        const alone = place.onFirst <= 1 ? `only ${place.onFirst} row on page ${place.first}` : `only ${rest} row on page ${place.last}`;
        out.push({ area: "pages", blocks: [i], text: `The table splits across pages ${place.first} and ${place.last} with ${alone}. Move the page end (or the table) so its rows stay together.` });
      }
    }
    // A question whose writing lines go over to the next page.
    if (!b.table && place.first < place.last && b.lines.length > place.onFirst) {
      const later = b.lines.slice(place.onFirst);
      if (later.every(blankOnly) && b.lines.slice(0, place.onFirst).some((l) => !blankOnly(l))) {
        out.push({ area: "pages", blocks: [i], text: `The question is on page ${place.first} but its writing lines go over to page ${place.last}.` });
      }
    }
    const next = blocks[i + 1];
    if (next && !b.table && hasContent(b) && !isBlankLines(b) && isBlankLines(next) && places[i + 1]!.first > place.last) {
      out.push({ area: "pages", blocks: [i, i + 1], text: `Block ${blockNo(i)} is at the bottom of page ${place.last}, but its writing lines (block ${blockNo(i + 1)}) start page ${places[i + 1]!.first}.` });
    }
  });
  return out;
}
