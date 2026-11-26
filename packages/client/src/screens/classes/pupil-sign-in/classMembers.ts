/** The "Pupils who joined" card's wording and decisions (#220), without React. */
import { errorCode } from '../../../api/http';

/** The second click's question. Removing does not shut the door: the code does. */
export const CONFIRM_REMOVE = 'Remove this pupil and their work from the class? Renew the code to stop them joining again.';

/** "1 pupil has joined", "3 pupils have joined". */
export function joinedCount(n: number): string {
  return n === 1 ? '1 pupil has joined' : `${n} pupils have joined`;
}

/** `login` is a teacher's login (#223); "Teacher login" is question 119's default. */
const PROVIDERS: Record<string, string> = { google: 'Google', microsoft: 'Microsoft', login: 'Teacher login' };

/** The sign-in provider as the teacher reads it. */
export function providerName(id: string): string {
  return PROVIDERS[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/** `2026-11-24` as "24 Nov 2026". */
export function joinedDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** A Remove went through but the list could not be loaded again, so it may still show the pupil. */
export const RELOAD_FAILED = 'Removed, but the list could not reload. Reload the page.';

/** What the teacher reads when the server refuses a Remove, by the refusal's code. */
export function removeRefusal(e: unknown): string {
  switch (errorCode(e)) {
    case 'not_found':
      return 'That pupil is no longer in this class.';
    case 'test_pupil':
      return 'The test pupil cannot be removed here.';
    default:
      return 'The pupil could not be removed. Try again.';
  }
}

/** Whether the card is drawn: whenever someone has joined, so a child's data can always be removed; otherwise only while pupils can join. */
export function showJoinedCard(count: number, canJoin: boolean): boolean {
  return count > 0 || canJoin;
}
