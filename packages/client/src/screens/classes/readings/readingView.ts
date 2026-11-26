/** Pure helpers for a class's readings (#187): the override, the ticks and what a refusal says. */
import { READING_FOLLOW_UPS_MAX, READING_FOLLOW_UPS_MIN, type ReaderPrompt } from '@edw/shared';
import { errorCode } from '../../../api/http';

/** The override as typed: empty is "the same as the class" (null); anything else must be a whole number 0 to 10. */
export function parseOverride(text: string): number | null | 'invalid' {
  const t = text.trim();
  if (t === '') return null;
  if (!/^\d+$/.test(t)) return 'invalid';
  const n = Number(t);
  return n >= READING_FOLLOW_UPS_MIN && n <= READING_FOLLOW_UPS_MAX ? n : 'invalid';
}

export const overrideText = (n: number | null) => (n === null ? '' : String(n));

/** The ticked prompts in the library's order; ids no longer in the library drop out. */
export function ticked(library: ReaderPrompt[], ids: readonly string[]): string[] {
  const on = new Set(ids);
  return library.filter((p) => on.has(p.id)).map((p) => p.id);
}

/** Ticks or unticks one prompt, keeping the library's order. */
export function toggled(library: ReaderPrompt[], ids: readonly string[], id: string): string[] {
  return ticked(library, ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
}

/** "Explain, I don't understand": the labels of the ticked prompts still in the library. */
export function promptLabels(library: ReaderPrompt[], ids: readonly string[]): string {
  const on = new Set(ids);
  return library.filter((p) => on.has(p.id)).map((p) => p.label).join(', ');
}

export const followUpsText = (n: number | null) => (n === null ? 'Same as the class' : n === 1 ? '1 follow-up' : `${n} follow-ups`);

/** What to tell the teacher when the server refuses, and what to load again. */
export function refusal(e: unknown): { message: string; reload: boolean } {
  switch (errorCode(e)) {
    case 'not_found':
      return { message: 'That doc or reading is no longer there, so the list has been reloaded.', reload: true };
    case 'prompt_unavailable':
      return { message: 'A prompt you ticked has been removed from the library, so the prompts have been reloaded. Please check the ticks.', reload: true };
    case 'class_archived':
      return { message: 'This class is archived, so it cannot have new readings.', reload: false };
    case 'invalid_request':
      return { message: `Tick at least one prompt, and give follow-ups as a whole number from ${READING_FOLLOW_UPS_MIN} to ${READING_FOLLOW_UPS_MAX}, or leave it empty.`, reload: false };
    default:
      return { message: 'That change could not be saved. Please try again.', reload: false };
  }
}
