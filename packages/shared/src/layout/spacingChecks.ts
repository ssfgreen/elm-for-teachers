/**
 * Space made with empty paragraphs. Word already puts 8 pt after each paragraph and space
 * before headings, so each empty paragraph adds a whole line on top. Reports runs of them,
 * paragraphs holding only spaces, uneven gaps before headings of one level, and empty
 * paragraphs straight after a heading or a page break or at the end.
 */
import type { LaidBlock } from "./blocks.js";
import { andList, type LayoutFinding } from "./findings.js";

const isEmpty = (b: LaidBlock | undefined) => !!b && b.empty && !b.table && !b.pageBreak && b.type === "paragraph";

/** The empty paragraphs straight before block `i`. */
function emptyBefore(blocks: readonly LaidBlock[], i: number): number {
  let n = 0;
  while (isEmpty(blocks[i - 1 - n])) n++;
  return n;
}

const blockNo = (i: number) => i + 1;

export function spacingFindings(blocks: readonly LaidBlock[]): LayoutFinding[] {
  const out: LayoutFinding[] = [];
  const add = (from: number, to: number, text: string) => out.push({ area: "spacing", blocks: Array.from({ length: to - from + 1 }, (_, k) => from + k), text });

  for (const b of blocks) {
    if (isEmpty(b) && b.content !== "") add(b.index, b.index, "This paragraph holds only spaces, so it shows as an empty line.");
  }

  // Runs of empty paragraphs, and where they sit.
  for (let i = 0; i < blocks.length; i++) {
    if (!isEmpty(blocks[i]) || isEmpty(blocks[i - 1])) continue;
    let j = i;
    while (isEmpty(blocks[j + 1])) j++;
    const n = j - i + 1;
    const before = blocks[i - 1];
    const after = blocks[j + 1];
    if (before?.pageBreak) add(i, j, `${n === 1 ? "An empty paragraph" : `${n} empty paragraphs`} at the top of the page after the page break push everything down (Word already starts that page with the break's own empty line).`);
    else if (before?.heading) add(i, j, `${n === 1 ? "An empty paragraph" : `${n} empty paragraphs`} straight after the heading in block ${blockNo(before.index)} ${n === 1 ? "separates" : "separate"} it from what it introduces.`);
    else if (!after) {
      if (n > 1) add(i, j, `The document ends with ${n} empty paragraphs, which can push a blank page.`);
    } else if (after.pageBreak) {
      if (n > 1) add(i, j, `${n} empty paragraphs just before a page break do nothing but can push a blank page.`);
    } else if (n > 1) add(i, j, `${n} empty paragraphs in a row make about ${n} lines of space. One is usually enough between parts; Word already puts space after every paragraph.`);
  }

  // Gaps before headings of one level, between parts of the worksheet.
  for (const level of [1, 2, 3] as const) {
    const gaps = new Map<number, number[]>();
    blocks.forEach((b, i) => {
      if (b.heading !== level) return;
      const n = emptyBefore(blocks, i);
      const prev = blocks[i - 1 - n];
      if (!prev || prev.pageBreak) return; // the first on its page: no gap to compare
      gaps.set(n, [...(gaps.get(n) ?? []), i]);
    });
    if (gaps.size < 2) continue;
    const parts = [...gaps].sort(([a], [b]) => a - b).map(([n, is]) => `${n === 0 ? "no" : n} empty paragraph${n === 1 ? "" : "s"} before ${is.length > 1 ? "blocks" : "block"} ${andList(is.map((i) => String(blockNo(i))))}`);
    const all = [...gaps.values()].flat();
    out.push({ area: "spacing", blocks: all, text: `The gaps before the level ${level} headings are uneven: ${andList(parts)}. Make them the same (no empty paragraphs is usually right: headings have space before them).` });
  }
  return out;
}

