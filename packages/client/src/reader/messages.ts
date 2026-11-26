/**
 * What the pupil's reader says when the server refuses something, by the refusal's reason code.
 * Words only; the screens pick them.
 */

/** Why a reading is not open to the pupil (the membership codes, and a removed reading). */
export const REFUSED: Record<string, string> = {
  not_member: 'This reading is not open to you.',
  class_archived: 'This class has finished, so its readings are closed.',
  pupils_off: 'Pupil sign-in is switched off here.',
  feature_off: 'Your teacher has not opened pupil reading in this class.',
  not_found: 'Your teacher has taken this reading away.',
};

/** Why asks are not offered on a passage (asks.ts `askable`). */
export const NOT_ASKABLE: Record<'too_long' | 'not_here', string> = {
  too_long: 'Select less to ask about it.',
  not_here: 'This part cannot be asked about.',
};

export const NO_MORE_FOLLOW_UPS = 'No more follow-ups on this answer.';

/**
 * An ask's refusal (shared `READER_ASK_REFUSALS`). The budget words are the server's own
 * (`PUPIL_BUDGET_MESSAGE`, `WORKSPACE_BUDGET_MESSAGE` in server/src/reader-asks/service.ts).
 */
export const ASK_REFUSED: Record<string, string> = {
  highlight_too_long: 'That part cannot be asked about. Try selecting less.',
  highlight_not_in_reading: 'That part cannot be asked about. Try selecting less.',
  prompt_unavailable: 'That button has changed. Reload the page to see the new ones.',
  prompt_not_offered: 'That button has changed. Reload the page to see the new ones.',
  follow_ups_used: NO_MORE_FOLLOW_UPS,
  pupil_budget_spent: 'You have used all the help you can ask for in this class. Please ask your teacher.',
  budget_spent: 'Your teacher’s helper has used all of its budget. Please ask your teacher.',
  no_zero_retention: 'Asking is not ready here yet. Please ask your teacher.',
  provider_error: 'The helper could not answer just now. Please try again.',
};

/** The words for an ask's refusal code: the ask's own, else a membership one, else general words. */
export const askRefusal = (code: string | null): string => (code ? (ASK_REFUSED[code] ?? REFUSED[code]) : undefined) ?? 'That did not work. Please try again.';
