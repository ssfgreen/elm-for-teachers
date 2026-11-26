/**
 * A reading's frozen copy as plain text (what the model reads) and the check that a pupil's
 * highlighted passage is in it. Pure.
 *
 * Each block's words are its reader text (shared `readerBlock`, #247): exactly what the pupil's
 * page shows, so the model reads what the pupil reads and a passage cut from the page is found
 * here. A table is laid out one row per line, its cells apart by three spaces. Pictures, dividers
 * and page breaks have no words, so they are left out.
 */
import { READER_HIGHLIGHT_MAX, readerBlock, type ReadingBlock } from '@edw/shared';

/** One block's words, or '' for a block with none. */
export function blockText(b: ReadingBlock): string {
  const r = readerBlock(b);
  if (r.view.kind !== 'table') return r.text;
  return r.view.rows.map((row) => row.map((cell) => cell.parts.map((p) => p.text).join('')).join('   ')).join('\n');
}

/** The reading as the model reads it: each block's words, a blank line between blocks. */
export function readingText(blocks: readonly ReadingBlock[]): string {
  return blocks
    .map(blockText)
    .filter((t) => t.trim() !== '')
    .join('\n\n');
}

/** Characters a reader never sees: the soft hyphen, zero-width space, joiners and the word joiner, and the byte-order mark. */
const INVISIBLE = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;

/**
 * Text as compared: the same letters whatever the typography (NFKC, curly quotes and apostrophes
 * as straight ones, any dash as a hyphen, no soft hyphens), runs of space as one, no case.
 */
export function normalise(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export type HighlightCheck = { ok: true; text: string } | { ok: false; reason: 'highlight_too_long' | 'highlight_not_in_reading' };

/**
 * The passage as it is kept and sent: the pupil's own string without characters a reader never
 * sees (zero-width characters, soft hyphens), with each run of space as one. A `*` or backtick
 * stays: in the reader's text it is a word the pupil sees.
 */
export function cleanPassage(text: string): string {
  return text.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
}

/**
 * Whether `reading` holds `passage` once both are normalised and `*` and backticks are set aside
 * on both sides (comparison only), so a passage carrying marks the reading lacks, or lacking ones
 * it has, is still found. A passage of marks alone is looked for as it is.
 */
function holds(reading: string, passage: string): boolean {
  const wanted = normalise(passage.replace(/[*`]/g, ''));
  if (wanted === '') return normalise(reading).includes(normalise(passage));
  return normalise(reading.replace(/[*`]/g, '')).includes(wanted);
}

/**
 * Whether the pupil's passage is one the reading has: not empty, at most READER_HIGHLIGHT_MAX
 * characters, and found in the reading's words (`holds`; a passage may run across blocks). Gives
 * the passage cleaned (`cleanPassage`), as it is kept and sent.
 */
export function checkHighlight(blocks: readonly ReadingBlock[], highlighted: string): HighlightCheck {
  if (highlighted.trim().length > READER_HIGHLIGHT_MAX) return { ok: false, reason: 'highlight_too_long' };
  const text = cleanPassage(highlighted);
  if (normalise(text) === '' || !holds(readingText(blocks), text)) return { ok: false, reason: 'highlight_not_in_reading' };
  return { ok: true, text };
}
