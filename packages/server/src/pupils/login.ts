/**
 * A pupil signs in with a login the teacher made (issue #231, B of #221): username, password and,
 * the first time, the class code. The steps, in order, with no Fastify (login-routes.ts answers):
 *
 *   1. an address the wrong-code counter has blocked is refused before anything is looked up;
 *   2. an unknown username costs one dummy hash and counts on the address;
 *   3. a locked login is refused without a password check;
 *   4. each try is claimed on the login before its password is checked (`claimTry`, atomic), so
 *      a burst cannot get past the limit; a wrong one counts on the login only (five in a row
 *      lock it), not on the address;
 *   5. first use needs the login's own class's live code; a later log-in ignores any code sent;
 *   6. the pupil is admitted as provider `login`, subject the login's id (never the username).
 *
 * A wrong password and an unknown username give the same refusal, so a pupil page cannot tell
 * which usernames exist. Nothing here is a research event, and no value typed is ever logged.
 */
import { checkClassCode, type CodeCheckDeps, type JoinRefusal } from '../class-joins/join.js';
import type { ClassJoinStore } from '../class-joins/store.js';
import type { AccountStore } from '../accounts/store.js';
import type { WrongCodeCounter } from '../http/wrong-codes.js';
import { dummyVerify, verifyPassword } from '../pupil-logins/hash.js';
import type { PupilLoginStore } from '../pupil-logins/store.js';
import { admitPupil, type PupilRefusal } from './admit.js';
import type { Pupil, PupilStore } from './store.js';

/** The provider a pupil signed in with a teacher's login has in `pupils`. */
export const LOGIN_PROVIDER = 'login';

export type LoginRefusal = 'login_wrong' | 'login_locked' | 'code_other_class' | 'login_taken' | JoinRefusal | PupilRefusal;

/**
 * The login and the password hash this sign-in checked: the route starts the sign-in only while
 * the login still has it (`startLoginSignIn`, #246). Server-side only, never sent.
 */
export interface CheckedLogin {
  id: string;
  password_hash: string;
}

export type LoginResult = { ok: true; pupil: Pupil; checked: CheckedLogin } | { ok: false; reason: LoginRefusal };

export interface LoginInput {
  username: string;
  password: string;
  code?: string;
}

export interface LoginDeps extends CodeCheckDeps {
  joins: Pick<ClassJoinStore, 'classForCode' | 'join'>;
  logins: Pick<PupilLoginStore, 'byUsername' | 'claimTry' | 'releaseTry' | 'wrongTry' | 'signedIn'>;
  pupils: Pick<PupilStore, 'signIn' | 'findPupil'>;
  accounts: Pick<AccountStore, 'findAccount'>;
  counter: WrongCodeCounter;
}

/** Every made password is lower case: what was typed, tidied the same way. */
export const normalisePassword = (typed: string): string => typed.trim().toLowerCase();

/** The steps above for a pupil at address `ip`. */
export async function pupilLogin(deps: LoginDeps, ip: string, input: LoginInput): Promise<LoginResult> {
  if (deps.counter.blocked(ip)) return { ok: false, reason: 'too_many_codes' };

  const login = await deps.logins.byUsername(input.username);
  if (!login) {
    await dummyVerify(input.password);
    deps.counter.record(ip);
    return { ok: false, reason: 'login_wrong' };
  }
  // Locked, or every try in a row taken by tries still being checked.
  if (login.locked || !(await deps.logins.claimTry(login.id))) return { ok: false, reason: 'login_locked' };

  let right: boolean;
  try {
    right = await verifyPassword(normalisePassword(input.password), login.password_hash);
  } catch (err) {
    // Not a wrong try: given back, so a failure cannot use up a login's tries unseen.
    // The check's own error is the one that goes up, even if giving the try back fails too.
    await deps.logins.releaseTry(login.id).catch(() => undefined);
    throw err;
  }
  if (!right) {
    const tried = await deps.logins.wrongTry(login.id);
    return { ok: false, reason: tried?.locked ? 'login_locked' : 'login_wrong' };
  }
  // The right password is not a wrong try, even if the code below refuses the sign-in.
  await deps.logins.releaseTry(login.id);

  const firstUse = login.pupil_id === null;
  let joining = null;
  if (firstUse) {
    const typed = input.code?.trim() ?? '';
    if (!typed) return { ok: false, reason: 'code_needed' };
    const check = await checkClassCode(deps, ip, typed);
    if (!check.ok) return check;
    // A code of another class is not a wrong code: the pupil has a real one, for the wrong class.
    if (check.cls.class_id !== login.class_id) return { ok: false, reason: 'code_other_class' };
    joining = check.cls;
  }

  const admitted = await admitPupil(deps.accounts, deps.pupils, { provider: LOGIN_PROVIDER, subject: login.id, tenant: null }, firstUse);
  if (!admitted.ok) return admitted;
  // Every good sign-in: the wrong tries start again, and the first makes the login the pupil's.
  // Before joining, so a login locked meanwhile by wrong tries in the same burst joins no class.
  // The hash checked above, so a password the teacher replaced meanwhile (#246) signs nobody in.
  if (!(await deps.logins.signedIn(login.id, admitted.pupil.id, login.password_hash))) {
    const now = await deps.logins.byUsername(input.username);
    if (!now || now.password_hash !== login.password_hash) return { ok: false, reason: 'login_wrong' };
    return { ok: false, reason: now.locked ? 'login_locked' : 'login_taken' };
  }
  if (joining) await deps.joins.join(admitted.pupil.id, joining);
  return { ...admitted, checked: { id: login.id, password_hash: login.password_hash } };
}
