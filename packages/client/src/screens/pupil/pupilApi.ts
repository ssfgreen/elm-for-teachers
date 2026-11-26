/** The pupil page's calls (server/src/pupils/routes.ts). The pupil sign-in cookie rides along; no token. */
import type { SignInProvider } from '../../api/auth';
import { api, ApiError, errorCode } from '../../api/http';

const e = encodeURIComponent;

/** One of the pupil's classes, as /r shows it: "You are Pupil 3 in 8B". */
export interface PupilClass {
  class_id: string;
  class_name: string;
  label: string;
}

export interface SignedInPupil {
  provider: string;
  /** The class's test pupil a teacher opened with "View as pupil" (#215): /r shows the banner. */
  test: boolean;
  classes: PupilClass[];
}

/** Absolute, for a link: starts a pupil sign-in with the provider (a full page load), with the class code typed, if any. */
export const pupilStartUrl = (providerId: string, classCode = ''): string =>
  `/api/pupil/auth/${e(providerId)}/start${classCode.trim() ? `?code=${e(classCode.trim())}` : ''}`;

/** The providers, or 'off' when the server has pupil sign-in shut (only `PUPILS=on` opens it). */
export async function pupilProviders(): Promise<SignInProvider[] | 'off'> {
  try {
    return (await api<{ providers: SignInProvider[] }>('GET', '/pupil/providers')).providers;
  } catch (err) {
    if (errorCode(err) === 'pupils_off') return 'off';
    throw err;
  }
}

/** The signed-in pupil (which provider, and their classes), or null when no pupil is signed in in this browser. */
export async function currentPupil(): Promise<SignedInPupil | null> {
  try {
    const me = await api<{ pupil: { provider: string; test?: boolean }; classes?: PupilClass[] }>('GET', '/pupil/me');
    return { provider: me.pupil.provider, test: me.pupil.test === true, classes: me.classes ?? [] };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return null;
    throw err;
  }
}

export const signOutPupil = () => api<void>('POST', '/pupil/sign-out');

/** A signed-in pupil types a class code: the class joined, or the server's reason code when it was refused. */
export async function joinClass(code: string): Promise<{ joined: PupilClass } | { refused: string }> {
  try {
    return { joined: (await api<{ class: PupilClass }>('POST', '/pupil/join', { code })).class };
  } catch (err) {
    return { refused: errorCode(err) ?? 'failed' };
  }
}
