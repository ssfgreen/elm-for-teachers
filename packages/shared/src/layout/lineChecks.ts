/**
 * Writing lines and blanks made of underscores. Written by counting characters, they stop part
 * way across the page, at different places, or wrap. A writing line written as `<line/>` reaches
 * the margin whatever the font (text.ts), so each underscore line that misses is reported with
 * that as the fix. Short blanks inside a sentence are left alone.
 */
import type { LaidBlock, LaidLine } from "./blocks.js";
import { andList, pct, quoteStart, type LayoutFinding } from "./findings.js";
import type { Face } from "./fonts.js";

/** A line counts as ending part way across when it fills less than this. */
const SHORT = 0.9;
/** A blank shorter than this is a gap in a sentence, not a writing line: left alone. */
const MIN_BLANK = 5;
/** With estimated letter widths, an overflow narrower than this share of the line is not reported. */
const UNSURE = 0.04;

const onlyBlank = (l: LaidLine) => l.blankChars > 0 && l.text.trim().length === l.blankChars;

export function lineFindings(blocks: readonly LaidBlock[], f: Face): LayoutFinding[] {
  const out: LayoutFinding[] = [];
  const said = new Set<string>();
  const push = (b: LaidBlock, text: string) => {
    if (said.has(`${b.index} ${text}`)) return;
    said.add(`${b.index} ${text}`);
    out.push({ area: "lines", blocks: [b.index], text });
  };
  for (const b of blocks) {
    if (b.table || b.lines.length === 0) continue;
    const short: string[] = [];
    b.lines.forEach((l, k) => {
      if (l.blankChars < MIN_BLANK) return;
      const prev = b.lines[k - 1];
      const next = b.lines[k + 1];
      if (next?.wrapped && onlyBlank(next) && onlyBlank(l) && l.width >= b.avail * SHORT) {
        // With estimated widths, a line only just over may well fit in Word: say nothing.
        if (f.estimated && next.width < b.avail * UNSURE) return;
        push(b, `A writing line of underscores is longer than the page is wide: it runs onto the next line as ${next.blankChars} more underscores. Write it as <line/>, which runs exactly to the right margin.`);
        return;
      }
      if (prev && onlyBlank(prev) && l.wrapped && onlyBlank(l)) return; // the overflow of the line above, reported there
      if (l.wrapped && onlyBlank(l) && prev && prev.blankChars === 0 && !prev.fill) {
        push(b, `The blank after "${quoteStart(prev.text)}" does not fit on that line, so it drops to a line of its own that ends at ${pct(l.width / b.avail)} of the width. Write it as <line/>: it fills the rest of the line, or a whole line of its own when the line is full.`);
        return;
      }
      const used = l.width / b.avail;
      if (used < SHORT) short.push(`${onlyBlank(l) ? "a writing line" : `"${quoteStart(l.text)}"`} ends at ${pct(used)} of the width`);
    });
    if (short.length) push(b, `${capital(andList(merge(short)))}. Write ${short.length > 1 ? "their blanks" : "its blank"} as <line/>, which reaches the right margin.`);
  }
  return out;
}

/** The same message for several lines of a block, said once with a count. */
function merge(items: string[]): string[] {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i, (counts.get(i) ?? 0) + 1);
  return [...counts].map(([text, n]) => (n > 1 ? text.replace(/^a writing line ends/, `${n} writing lines end`) : text));
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
