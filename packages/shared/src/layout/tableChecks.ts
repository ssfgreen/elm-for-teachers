/**
 * Table columns against their content: words broken because a column is too narrow, a column
 * wrapping while others have room to spare, columns holding the same thing at different widths,
 * and set widths wider than the page. Each table with a problem gets suggested widths.
 */
import type { LaidBlock } from "./blocks.js";
import { andList, px, type LayoutFinding } from "./findings.js";
import type { LaidColumn, LaidTable } from "./tables.js";
import { PAGE, PAGE_PX } from "./word.js";

/** A column whose content needs no more than this share of the page is kept narrow. */
const NARROW = 0.3;
/** Room a column can have spare before it counts as wasted, in points. */
const SPARE = 45;

const named = (cs: readonly LaidColumn[]) => andList(cs.map((c) => c.name));

export function tableFindings(blocks: readonly LaidBlock[]): LayoutFinding[] {
  const out: LayoutFinding[] = [];
  for (const b of blocks) {
    if (!b.table) continue;
    const t = b.table;
    const say: string[] = [];
    for (const c of t.columns) {
      if (c.minimum > c.width + 0.5) say.push(`column ${c.name} is ${px(c.width)} px wide in Word but its longest word "${c.longestWord}" needs ${px(c.minimum)} px, so Word breaks the word`);
    }
    const wrapping = t.columns.filter((c) => c.wrappedRows > 0 && c.minimum <= c.width + 0.5);
    const roomy = t.columns.filter((c) => !c.emptyBody && c.width - c.natural > SPARE / 2);
    const spare = roomy.reduce((s, c) => s + (c.width - c.natural), 0);
    const bodyRows = t.rows.length - (t.hasHeader ? 1 : 0);
    if (wrapping.length && roomy.length && spare >= SPARE) {
      for (const c of wrapping) say.push(`column ${c.name} wraps ${c.wrappedRows} of ${bodyRows} rows onto more lines, while ${named(roomy)} ${roomy.length > 1 ? "have" : "has"} about ${px(spare)} px ${roomy.length > 1 ? "they do" : "it does"} not use`);
    } else {
      for (const c of t.columns) {
        if (c.setPx > 0 && !c.emptyBody && c.natural <= PAGE.width * NARROW && c.width - c.natural > SPARE * 1.5 && c.natural < c.width / 2) say.push(`column ${c.name} is ${px(c.width)} px wide for content that needs ${px(c.natural)} px`);
      }
    }
    const groups = new Map<string, LaidColumn[]>();
    for (const c of t.columns) if (c.sameShort) groups.set(c.sameShort, [...(groups.get(c.sameShort) ?? []), c]);
    for (const [content, cs] of groups) {
      const ws = cs.map((c) => px(c.width));
      if (cs.length > 1 && Math.max(...ws) > Math.min(...ws) * 1.1) say.push(`columns ${named(cs)} hold the same thing (${content}) but are ${andList(ws.map(String))} px wide`);
    }
    if (t.setTotalPx > PAGE_PX) say.push(`the set widths add up to ${t.setTotalPx} px, but the page's text is about ${PAGE_PX} px wide in Word, so Word squeezes the table`);
    if (say.length === 0) continue;
    const suggestion = suggestWidths(t);
    out.push({ area: "tables", blocks: [b.index], text: `${say.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(". ")}. ${suggestion}` });
  }
  return out;
}

/** Widths that fit the content: short columns as narrow as it allows, the rest sharing the page. */
export function suggestWidths(t: LaidTable): string {
  const need = (c: LaidColumn) => Math.ceil(px(Math.max(c.natural, c.minimum)) / 5) * 5;
  const narrow = t.columns.map((c) => !c.emptyBody && c.natural <= PAGE.width * NARROW);
  const widths = t.columns.map((c, j) => (narrow[j] ? need(c) : 0));
  // Columns holding the same thing get the same width.
  t.columns.forEach((c, j) => {
    if (!c.sameShort || !narrow[j]) return;
    const same = t.columns.map((d, k) => (d.sameShort === c.sameShort && narrow[k] ? widths[k]! : 0));
    widths[j] = Math.max(...same);
  });
  if (!widths.includes(0)) widths[widths.indexOf(Math.max(...widths))] = 0;
  const wide = t.columns.filter((_, j) => widths[j] === 0);
  return `Suggested widths: <!-- colwidths: ${widths.join(" ")} --> (${wide.length ? `${named(wide)} ${wide.length > 1 ? "share" : "takes"} the rest` : ""}).`;
}
