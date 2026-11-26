/**
 * How a run of a reading's text is drawn with the pupil's highlights on it (#213): cut where any
 * highlight starts or ends, each piece carrying its offset in the block's text and the highlight
 * on top there (the one made last, where they overlap). Pure.
 */
import type { Highlight, HighlightCategory, Inline, TextRun } from '@edw/shared';
import { HIGHLIGHT_CATEGORIES } from '@edw/shared';

export interface Piece extends Inline {
  /** Where the piece starts in the block's reader text. */
  at: number;
  highlight: Highlight | null;
}

/** The pieces of a run, given the block's highlights. */
export function cutRun(run: TextRun, highlights: readonly Highlight[]): Piece[] {
  const out: Piece[] = [];
  let at = run.from;
  for (const part of run.parts) {
    const end = at + part.text.length;
    const cuts = new Set([at, end]);
    for (const h of highlights) for (const x of [h.start, h.end]) if (x > at && x < end) cuts.add(x);
    const points = [...cuts].sort((a, b) => a - b);
    let last: Piece | null = null;
    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i]!;
      const text = part.text.slice(from - at, points[i + 1]! - at);
      const highlight = topAt(highlights, from);
      // The same highlight on both sides of a cut (another one ended under it): one piece.
      if (last && last.highlight === highlight) last.text += text;
      else out.push((last = { ...part, text, at: from, highlight }));
    }
    at = end;
  }
  return out;
}

/** The highlight drawn at an offset: the last made of those covering it. */
function topAt(highlights: readonly Highlight[], at: number): Highlight | null {
  let top: Highlight | null = null;
  for (const h of highlights) if (h.start <= at && at < h.end && (!top || h.created_at >= top.created_at)) top = h;
  return top;
}

/**
 * Each category's colour, light and dark, and unlabelled (the editor's highlight colour). Written
 * as values: the theme has no general palette (styles/theme.css).
 */
export const HIGHLIGHT_CLASS: Record<HighlightCategory | 'none', string> = {
  none: 'bg-[var(--text-highlight)]',
  dont_understand: 'bg-[#bae6fd] dark:bg-[rgba(56,189,248,0.4)]',
  may_be_inaccurate: 'bg-[#fed7aa] dark:bg-[rgba(251,146,60,0.4)]',
  possibly_biased: 'bg-[#ddd6fe] dark:bg-[rgba(167,139,250,0.45)]',
  missing_sources: 'bg-[#bbf7d0] dark:bg-[rgba(74,222,128,0.35)]',
  poor_quality: 'bg-[#fecdd3] dark:bg-[rgba(251,113,133,0.4)]',
};

export const categoryClass = (c: HighlightCategory | null) => HIGHLIGHT_CLASS[c ?? 'none'];
export const categoryLabel = (c: HighlightCategory | null) => HIGHLIGHT_CATEGORIES.find((x) => x.id === c)?.label ?? 'Highlight';
