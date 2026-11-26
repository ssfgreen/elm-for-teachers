/** The "Pupil logins" card's wording and decisions (#232), without React. */
import { MAX_LOGINS_A_BATCH, type PupilLogin } from '../../../api/pupilLogins';
import { errorCode } from '../../../api/http';

export const LOGINS_HINT = 'A username and password for each pupil who signs in without Google or Microsoft.';
export const SHOWN_ONCE = 'These passwords are shown only now. Print the slips or write them down before you leave this page.';
export const CONFIRM_DONE = 'Hide the passwords? They cannot be shown again.';
export const CONFIRM_DELETE = 'Delete this login? Its slip will stop working.';
export const CONFIRM_NEW_PASSWORD = 'Make a new password? The old one stops working at once and the pupil is signed out.';
/** The once-only panel's heading: after Make, and after New password. */
export const NEW_LOGINS_TITLE = 'New logins';
export const NEW_PASSWORD_TITLE = 'New password';
export const LOCKED = 'Locked';
export const LOCKED_HINT = 'Five wrong passwords in a row. A new password will unlock it.';
export const NOT_USED = 'Not used yet';
/** A Make went through but the list could not load again. The passwords stay on screen. */
export const MADE_RELOAD_FAILED = 'The logins were made, but the list could not reload.';
/** A New password went through but the list could not load again. The password stays on screen. */
export const NEW_PASSWORD_RELOAD_FAILED = 'The new password was made, but the list could not reload.';
/** A Delete went through but the list could not load again, so it may still show the login. */
export const DELETED_RELOAD_FAILED = 'Deleted, but the list could not reload. Reload the page.';

/** The count typed in "How many", or null when it is not a whole number from 1 to 40. */
export function loginCount(typed: string): number | null {
  if (!/^\s*\d+\s*$/.test(typed)) return null;
  const n = Number(typed);
  return n >= 1 && n <= MAX_LOGINS_A_BATCH ? n : null;
}

/** "Make 1 login", "Make 12 logins"; plain "Make logins" while the count is not one Make takes. */
export function makeLabel(count: number | null): string {
  if (count === null) return 'Make logins';
  return count === 1 ? 'Make 1 login' : `Make ${count} logins`;
}

/** What the list says of a login: "Not used yet", or the pupil's label once used. */
export function loginStatus(l: PupilLogin): string {
  if (!l.used) return NOT_USED;
  return l.label ?? 'Used';
}

/** Only a login never used can be deleted; a used one goes with its pupil under "Pupils who joined". */
export const canDelete = (l: PupilLogin): boolean => !l.used;

/** Whether the card is drawn: whenever the class has logins, so an unused one can always be deleted; otherwise only while pupils can join. */
export function showLoginsCard(count: number, canJoin: boolean): boolean {
  return count > 0 || canJoin;
}

/** What the teacher reads when the server refuses a Make, by the refusal's code. */
export function makeRefusal(e: unknown): string {
  switch (errorCode(e)) {
    case 'pupils_off':
      return 'Pupils cannot sign in on this site yet, so no logins were made.';
    case 'feature_off':
      return 'Pupils are switched off for this workspace, so no logins were made.';
    case 'class_archived':
      return 'This class is archived, so it cannot have new logins.';
    default:
      return 'The logins could not be made. Try again.';
  }
}

/** What the teacher reads when the server refuses a New password, by the refusal's code. */
export function newPasswordRefusal(e: unknown): string {
  switch (errorCode(e)) {
    case 'pupils_off':
      return 'Pupils cannot sign in on this site yet, so the password was not changed.';
    case 'feature_off':
      return 'Pupils are switched off for this workspace, so the password was not changed.';
    case 'class_archived':
      return 'This class is archived, so its passwords cannot change.';
    case 'not_found':
      return 'That login is no longer in this class.';
    default:
      return 'The new password could not be made. Try again.';
  }
}

/** What the teacher reads when the server refuses a Delete, by the refusal's code. */
export function deleteRefusal(e: unknown): string {
  switch (errorCode(e)) {
    case 'login_used':
      return 'This login has been used. Remove the pupil under Pupils who joined instead.';
    case 'not_found':
      return 'That login is no longer in this class.';
    default:
      return 'The login could not be deleted. Try again.';
  }
}
