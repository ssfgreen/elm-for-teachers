/**
 * What the teacher types into the Pupil reader card (#186), read as a value. Pure.
 * A blank box means "go back to the default" (null); anything that is not a value in limits is
 * `invalid`, and the card puts back the last good value.
 */
import { FOLLOW_UPS_MAX_LIMIT, PUPIL_BUDGET_GBP_LIMIT, SAFETY_INSTRUCTION_MAX, isWholePence } from '@edw/shared';

export type Parsed = number | null | 'invalid';

/** Whole follow-ups, 0 to 10. */
export function parseFollowUps(text: string): Parsed {
  const t = text.trim();
  if (!t) return null;
  if (!/^\d+$/.test(t)) return 'invalid';
  const n = Number(t);
  return n <= FOLLOW_UPS_MAX_LIMIT ? n : 'invalid';
}

/** Pounds, to the penny, £0 to £5: "0.5", "£0.50", "50p", "1", "£1.2". */
export function parsePounds(text: string): Parsed {
  const t = text.trim().replace(/\s+/g, '').toLowerCase();
  if (!t) return null;
  const pence = /^(\d+)p$/.exec(t);
  const pounds = /^£?(\d+(?:\.\d*)?|\.\d+)$/.exec(t);
  const gbp = pence ? Number(pence[1]) / 100 : pounds ? Number(pounds[1]) : NaN;
  if (!Number.isFinite(gbp) || gbp > PUPIL_BUDGET_GBP_LIMIT || !isWholePence(gbp)) return 'invalid';
  return Math.round(gbp * 100) / 100;
}

/** "£0.50", "£2", "£1.25". */
export function formatPounds(gbp: number): string {
  return Number.isInteger(gbp) ? `£${gbp}` : `£${gbp.toFixed(2)}`;
}

/** What leaving a box does: nothing, put the shown value back, refuse it, or save a value (null: the default). */
export type Commit = { kind: 'none' } | { kind: 'reset' } | { kind: 'invalid' } | { kind: 'save'; value: number | null };

/** Decides what a box's text means when the teacher leaves it. Pure. */
export function decideCommit(text: string, shown: string, isDefault: boolean, parse: (text: string) => Parsed): Commit {
  const typed = text.trim();
  if (typed === shown) return { kind: 'none' };
  // Emptying a box that already shows the default changes nothing.
  if (!typed && isDefault) return { kind: 'reset' };
  const value = parse(typed);
  if (value === 'invalid') return { kind: 'invalid' };
  // "75p" in a box set to £0.75: the same value, so only the text is tidied.
  if (!isDefault && value === parse(shown)) return { kind: 'reset' };
  return { kind: 'save', value };
}

/**
 * What leaving the safety instruction box does (#195). Pure. Trimmed text is compared, as the
 * server keeps it trimmed. Empty is refused (the teacher uses "Back to the default"), as is text
 * over the limit; the default's own text goes back to the default (null), so the class keeps
 * following config.
 */
export type SafetyCommit = { kind: 'none' } | { kind: 'empty' } | { kind: 'long' } | { kind: 'save'; value: string | null };

export function decideSafetyCommit(text: string, shown: string, isDefault: boolean, defaultText: string): SafetyCommit {
  const typed = text.trim();
  if (typed === shown.trim()) return { kind: 'none' };
  if (!typed) return { kind: 'empty' };
  if (typed.length > SAFETY_INSTRUCTION_MAX) return { kind: 'long' };
  if (typed === defaultText.trim()) return isDefault ? { kind: 'none' } : { kind: 'save', value: null };
  return { kind: 'save', value: typed };
}
