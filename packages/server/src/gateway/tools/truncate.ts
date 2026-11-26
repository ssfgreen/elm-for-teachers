/**
 * Output limits (Pi's truncate.ts): a long document or tool output is cut so one call cannot
 * fill the context or the bill, and the model is told what it got and how to read on.
 * Documents are cut at block boundaries; anything else at a line boundary.
 */

export interface BlockPage {
  text: string;
  /** Blocks shown, 1-based, and how many the document has. */
  first: number;
  last: number;
  total: number;
}

/** A block entry of `serializeCanvas` output starts its line with its number (continuations are indented). */
const ENTRY = /\n(?=\d+\. \[)/;

/**
 * One serialised document (`serializeCanvas` for a single doc) from block `from` on, as many
 * whole blocks as fit in `maxChars` (always at least one).
 */
export function pageBlocks(serialized: string, from: number, maxChars: number): BlockPage {
  const [header = '', ...entries] = serialized.split(ENTRY);
  const total = entries.length;
  if (total === 0) return { text: serialized, first: 0, last: 0, total: 0 };
  const start = Math.min(Math.max(1, Math.floor(from)), total);
  const shown: string[] = [];
  let size = header.length;
  for (let i = start - 1; i < total; i++) {
    const entry = entries[i]!;
    if (shown.length > 0 && size + entry.length + 1 > maxChars) break;
    shown.push(entry);
    size += entry.length + 1;
  }
  const last = start + shown.length - 1;
  return { text: [header, ...shown].join('\n'), first: start, last, total };
}

/** What the model is told when a document was cut, e.g. `[Showing blocks 1–40 of 120. …]`. */
export function pageNote(page: BlockPage, docId: string): string | null {
  if (page.first <= 1 && page.last >= page.total) return null;
  const more = page.last < page.total ? ` Call read_document with doc_id ${docId} and from_block ${page.last + 1} to read on.` : '';
  return `[Showing blocks ${page.first}–${page.last} of ${page.total}.${more}]`;
}

/** Any tool output past `maxChars`, cut at a line boundary, with a note of how much was left out. */
export function truncateOutput(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.lastIndexOf('\n', maxChars);
  const head = text.slice(0, cut > maxChars / 2 ? cut : maxChars);
  return `${head}\n\n[Output cut to ${head.length} of ${text.length} characters.]`;
}
