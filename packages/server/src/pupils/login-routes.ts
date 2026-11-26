/**
 * A pupil signs in with a login the teacher made (issue #231):
 *
 *   POST /api/pupil/login {username, password, code?}  -> 204, sets the pupil sign-in cookie
 *
 * The steps are in login.ts. A plugin of its own, so it repeats the gate of pupils/routes.ts:
 * not cached, and 403 `pupils_off` unless `PUPILS=on`. It sets a cookie, so it answers only to
 * this site's `Origin`. Unknown usernames and unknown class codes count in the wrong-code counter
 * shared with `/api/access` and `/api/pupil/join` (app.ts).
 *
 * Research data: not a research event. Log lines carry the reason code only, never a username,
 * password, hash or code.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { fromSite } from '../auth.js';
import { cookie, readCookie } from '../accounts/cookies.js';
import { createAccountStore } from '../accounts/store.js';
import { JOIN_STATUS } from '../class-joins/join.js';
import { createClassJoinStore } from '../class-joins/store.js';
import type { AppDeps } from '../deps.js';
import { parseOr400 } from '../http/request.js';
import { clientAddress, createWrongCodeCounter, type WrongCodeCounter } from '../http/wrong-codes.js';
import { createPupilLoginStore } from '../pupil-logins/store.js';
import { PUPIL_SIGN_IN_DAYS, pupilCookieNames } from './cookies.js';
import { pupilsRefusal } from './gate.js';
import { pupilLogin, type LoginRefusal } from './login.js';
import { createPupilStore } from './store.js';

const LoginBody = z.object({ username: z.string().max(64), password: z.string().max(64), code: z.string().max(64).optional() });

/** The status for each refusal; the pupil page words each code. */
export const LOGIN_STATUS: Record<LoginRefusal, number> = {
  ...JOIN_STATUS,
  login_wrong: 401,
  login_locked: 403,
  code_other_class: 403,
  code_needed: 403,
  teacher_account: 403,
  login_taken: 409,
};

export interface PupilLoginRouteOptions {
  /** Wrong codes per address, shared with the access code and the class code (app.ts). */
  counter?: WrongCodeCounter;
}

export function registerPupilLoginSignIn(app: FastifyInstance, deps: AppDeps, opts: PupilLoginRouteOptions = {}): void {
  const pupils = deps.pupils ?? createPupilStore(deps.db);
  const loginDeps = {
    joins: deps.classJoins ?? createClassJoinStore(deps.db, deps.events),
    logins: deps.pupilLogins ?? createPupilLoginStore(deps.db, deps.events),
    accounts: deps.accounts ?? createAccountStore(deps.db, deps.sessions),
    pupils,
    sessions: deps.sessions,
    env: deps.env,
    counter: opts.counter ?? createWrongCodeCounter(),
  };
  const trustProxy = deps.env.TRUST_PROXY === true;
  const base = deps.env.AUTH_BASE_URL;
  const names = pupilCookieNames(base);

  void app.register(
    async (pupil) => {
      pupil.addHook('onRequest', async (_req, reply) => {
        reply.header('cache-control', 'no-store');
        const off = pupilsRefusal(deps.env);
        if (off) return reply.code(403).send({ error: 'pupil sign-in is switched off', code: off });
      });

      pupil.post('/login', async (req, reply) => {
        if (!fromSite(req, base)) return reply.code(403).send({ error: 'signing in must come from this site' });
        const body = parseOr400(LoginBody, req.body);
        const result = await pupilLogin(loginDeps, clientAddress(req, trustProxy), body);
        if (!result.ok) {
          req.log.info({ reason: result.reason }, 'pupil login refused');
          // The same body for an unknown username and a wrong password: only the code is sent.
          return reply.code(LOGIN_STATUS[result.reason]).send({ error: 'that login does not let you in', code: result.reason });
        }
        // A pupil sign-in this browser already had is ended, not left working beside the new one.
        const previous = readCookie(req, names.signIn);
        if (previous) await pupils.endSignIn(previous);
        // Only while the password checked is still the login's: a new one made since refuses it (#246).
        const signIn = await pupils.startLoginSignIn(result.pupil.id, result.checked);
        if (!signIn) return reply.code(LOGIN_STATUS.login_wrong).send({ error: 'that login does not let you in', code: 'login_wrong' });
        return reply
          .header('set-cookie', cookie(names.signIn, signIn.id, { path: names.signInPath, maxAge: PUPIL_SIGN_IN_DAYS * 86_400, secure: names.secure }))
          .code(204)
          .send();
      });
    },
    { prefix: '/api/pupil' },
  );
}
