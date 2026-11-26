/** The pupil table's cells as text, and what an edited cell changes (pure, tested alone). */
import type { Pupil, PupilFields } from '@edw/shared';

/** Needs and working_at are no longer columns (#243): they stay in the database, unshown. */
export type PupilColumn = 'label' | 'helps' | 'note';

export function cellText(p: Pupil, column: PupilColumn): string {
  return p[column] ?? '';
}

/** The change an edited cell makes, or null when it makes none (or would clear the label). */
export function cellChange(p: Pupil, column: PupilColumn, text: string): PupilFields | null {
  const value = text.trim();
  if (column === 'label') return value && value !== p.label ? { label: value } : null;
  return value === (p[column] ?? '') ? null : { [column]: value || null };
}

/**
 * Whether a label looks like a person's name rather than a made-up label or a code: two or more
 * capitalised words ("Callum Reid"), or one capitalised word with nothing else ("Callum").
 * A hint for the teacher, not a check: the server takes any label.
 */
export function looksLikeName(label: string): boolean {
  const words = label.trim().split(/\s+/);
  return words.every((w) => /^[A-Z][a-z'’-]+$/.test(w)) && words.length <= 3;
}
