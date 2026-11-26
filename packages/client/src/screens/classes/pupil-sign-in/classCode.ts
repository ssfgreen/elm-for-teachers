/** The class code card's wording and decisions (#212), without React. */
import { errorCode } from '../../../api/http';
import type { ClassCodeAction } from '../../../api/classCode';

/** Renew and Close ask first; Make does not. */
export type Confirmable = Exclude<ClassCodeAction, 'make'>;

/** The question a second click answers. Renew says the old code stops at once. */
export const CONFIRM: Record<Confirmable, string> = {
  renew: 'Give the class a new code? The old code stops working at once.',
  close: 'Close the code? No one can join with it until you make a new one.',
};

/** What the teacher reads when the server refuses a change, by the refusal's code. */
export function refusalMessage(e: unknown): string {
  switch (errorCode(e)) {
    case 'pupils_off':
      return 'Pupils cannot sign in on this site yet, so the code was not changed.';
    case 'feature_off':
      return 'Pupils are switched off for this workspace, so the code was not changed.';
    case 'class_archived':
      return 'This class is archived, so it cannot have a code.';
    default:
      return 'The code could not be changed. Try again.';
  }
}

/** Where pupils go: this site's address without `https://`, then `/r/join`, the sign-up page (#245). */
export function pupilAddress(origin: string): string {
  return `${origin.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/r/join`;
}

/** This site's address without `https://` or a trailing slash, as a pupil types it (the login slips). */
export function siteAddress(origin: string): string {
  return origin.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}
