/** A class's pupil logins (#223 routes, #232 card): list them, make 1 to 40, delete one never used, a new password for one (#246). */
import { endpoints } from './endpoints';
import { api, type ApiOptions } from './http';
import type { Envelope } from './types';

/** The server's `MAX_LOGINS_A_BATCH`: the most logins one Make can ask for. */
export const MAX_LOGINS_A_BATCH = 40;

/** A login as the teacher's list shows it: never a password. */
export interface PupilLogin {
  id: string;
  username: string;
  used: boolean;
  /** "Pupil N" once used and in the class, else null. */
  label: string | null;
  /** Five wrong passwords in a row; a new password unlocks it. */
  locked: boolean;
}

/** A login just made, or just given a new password: the one time its password is seen. */
export interface MadeLogin {
  id: string;
  username: string;
  password: string;
}

export interface PupilLoginsApi {
  /** The class's logins in the order they were made. */
  listPupilLogins(classId: string): Promise<PupilLogin[]>;
  /** Makes `count` logins (1 to 40) and returns them with their passwords. */
  makePupilLogins(classId: string, count: number, envelope: Envelope): Promise<MadeLogin[]>;
  /** Deletes a login never used (409 `login_used` once used). */
  deletePupilLogin(classId: string, loginId: string): Promise<void>;
  /** A new password for one login, used or not: the old one stops, the login unlocks, its pupil is signed out. */
  newPupilPassword(classId: string, loginId: string, envelope: Envelope): Promise<MadeLogin>;
}

export function pupilLoginsApi(sessionId: string, opts: ApiOptions): PupilLoginsApi {
  return {
    listPupilLogins: (classId) => api<{ logins: PupilLogin[] }>('GET', endpoints.pupilLogins(sessionId, classId), undefined, opts).then((r) => r.logins),
    makePupilLogins: (classId, count, envelope) =>
      api<{ logins: MadeLogin[] }>('POST', endpoints.pupilLogins(sessionId, classId), { count, envelope }, opts).then((r) => r.logins),
    deletePupilLogin: (classId, loginId) => api<{ ok: true }>('DELETE', endpoints.pupilLogin(sessionId, classId, loginId), undefined, opts).then(() => undefined),
    newPupilPassword: (classId, loginId, envelope) =>
      api<{ login: MadeLogin }>('POST', endpoints.pupilLoginPassword(sessionId, classId, loginId), { envelope }, opts).then((r) => r.login),
  };
}

/** Whether this api has pupil logins (the make kit's has none). Kept with pupils off, so an unused login can always be deleted. */
export function hasPupilLogins<T extends Partial<PupilLoginsApi>>(a: T): a is T & PupilLoginsApi {
  return (
    typeof a.listPupilLogins === 'function' &&
    typeof a.makePupilLogins === 'function' &&
    typeof a.deletePupilLogin === 'function' &&
    typeof a.newPupilPassword === 'function'
  );
}
