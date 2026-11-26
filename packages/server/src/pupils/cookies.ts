/**
 * The pupil sign-in cookies, apart from the teachers' (accounts/cookies.ts), so a teacher's
 * sign-in is never a pupil's and the other way round. The state cookie is sealed and opened by
 * the teachers' code (`sealState`, `openState`): one way to carry an OpenID Connect sign-in.
 * Same rules: HttpOnly, SameSite=Lax, `__Host-` and Secure on https; plain names on the pupil
 * /api paths on plain http (localhost).
 */
import type { CookieNames } from '../accounts/cookies.js';

/** A pupil stays signed in for a day: school laptops are shared, and signing in again is one click. */
export const PUPIL_SIGN_IN_DAYS = 1;

export function pupilCookieNames(base: string | undefined): CookieNames {
  return base?.startsWith('https:')
    ? { secure: true, state: '__Host-edw_pupil_state', statePath: '/', signIn: '__Host-edw_pupil', signInPath: '/' }
    : { secure: false, state: 'edw_pupil_state', statePath: '/api/pupil/auth', signIn: 'edw_pupil', signInPath: '/api/pupil' };
}
