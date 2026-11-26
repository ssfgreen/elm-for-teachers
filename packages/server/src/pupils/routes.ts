/**
 * Pupils sign in with Google or Microsoft on the pupil page `/r` (issue #179), apart from the
 * teachers' sign-in. The same providers and the same OpenID Connect code (accounts/oidc.ts), asking
 * for `openid` only; their own cookies (cookies.ts), tables (store.ts) and guard (`requirePupil`).
 *
 *   GET  /api/pupil/providers                -> { providers: [{ id, label, kind }] }
 *   GET  /api/pupil/auth/:provider/start?code=  -> 302 to the provider; sets the pupil state cookie
 *   GET  /api/pupil/auth/:provider/callback     -> 302 to /r, or /r?error=<reason>
 *   GET  /api/pupil/me                          -> { pupil: { provider, test }, classes: [{ class_id, class_name, label }] }
 *   POST /api/pupil/join {code}                 -> { class: { class_id, class_name, label } }   (signed-in pupil; 403 `test_pupil` for a test pupil)
 *   POST /api/pupil/sign-out                    -> 204; 403 from another origin
 *
 * Joining a class (issue #209): someone new comes in only with a live class code, typed on /r
 * before the provider and carried through the round trip in the sealed state cookie, so it cannot
 * be swapped on the way back. A known pupil signs in without one, and one with no class can type a
 * code on /r (`/join`). Wrong codes count in the counter shared with the access code.
 *
 * A teacher's test pupil (class-joins/view-as-pupil.ts, #215) sees its one class on /me, with
 * `test: true` so /r shows the banner; it never joins another class.
 *
 * Only `PUPILS=on` opens them: unset or `off` answers every one with 403 `pupils_off` (the two
 * sign-in steps, which are page loads, send the browser to /r?error=pupils_off instead). The
 * landing page asks `/providers` to decide whether to show its "Pupils: sign in".
 *
 * Research data: a pupil signing in is not a research event. Nothing here writes to `events`, the
 * call log or the export. Log lines carry reason codes only: never a subject, a token or a claim.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { fromSite, requirePupil } from '../auth.js';
import { checkClassCode, JOIN_STATUS, liveClass, type JoinRefusal } from '../class-joins/join.js';
import { classOpen } from '../class-joins/member.js';
import { createClassJoinStore, memberLabel, type ClassJoinStore, type Member } from '../class-joins/store.js';
import { TEST_PUPIL_PROVIDER } from '../class-joins/view-as-pupil.js';
import { clientAddress, createWrongCodeCounter, type WrongCodeCounter } from '../http/wrong-codes.js';
import { parseOr400 } from '../http/request.js';
import { z } from 'zod';
import type { AppDeps } from '../deps.js';
import { notFound } from '../http-error.js';
import { cookie, openState, readCookie, sealState, STATE_MINUTES, type SignInState } from '../accounts/cookies.js';
import { createOidcProvider, newChecks, type OidcProvider } from '../accounts/oidc.js';
import { providersFromEnv, publicProvider, type ProviderSettings } from '../accounts/providers.js';
import { createAccountStore } from '../accounts/store.js';
import { admitPupil, pupilIdentity, type PupilRefusal } from './admit.js';
import { PUPIL_SIGN_IN_DAYS, pupilCookieNames } from './cookies.js';
import { pupilsRefusal, type PupilsOff } from './gate.js';
import type { Pupil } from './store.js';
import { createPupilStore } from './store.js';

/** Why /r was sent back to: the pupil page shows a message for each. */
export type PupilSignInError = PupilRefusal | PupilsOff | JoinRefusal | 'cancelled' | 'provider_error' | 'failed';

/** Pupils are asked for nothing but who they are to the provider: no name, no email. */
export const PUPIL_SCOPE = 'openid';

/** The teachers' sealed state, with the class code (canonical) the pupil typed, if any. */
type PupilState = SignInState & { class_code?: string | null };

const JoinBody = z.object({ code: z.string().max(64) });

export interface PupilRouteOptions {
  /** Wrong codes per address, shared with the access code (app.ts). */
  counter?: WrongCodeCounter;
}

/** What /r shows of one class: its name and who the pupil is in it. */
const classView = (m: Member & { class_name: string }) => ({ class_id: m.class_id, class_name: m.class_name, label: memberLabel(m) });

export function registerPupilRoutes(app: FastifyInstance, deps: AppDeps, opts: PupilRouteOptions = {}): void {
  const pupils = deps.pupils ?? createPupilStore(deps.db);
  const joins: ClassJoinStore = deps.classJoins ?? createClassJoinStore(deps.db, deps.events);
  const counter = opts.counter ?? createWrongCodeCounter();
  const trustProxy = deps.env.TRUST_PROXY === true;
  const codeDeps = { joins, sessions: deps.sessions, env: deps.env };
  /** The pupil's classes that are open to them now (not archived, pupils on in the workspace); the test pupil's one class too. */
  const openClasses = async (pupil: Pupil) => {
    const all = await joins.classesOf(pupil.id);
    const open = [];
    for (const m of all) if ((await classOpen(codeDeps, m)).ok) open.push(classView(m));
    return open;
  };
  const accounts = deps.accounts ?? createAccountStore(deps.db, deps.sessions);
  const { AUTH_SECRET: secret, AUTH_BASE_URL: base } = deps.env;
  const settings: ProviderSettings[] = secret && base ? (deps.signIn?.providers ?? providersFromEnv(deps.env)) : [];
  const providers = new Map<string, OidcProvider>(settings.map((s) => [s.id, createOidcProvider(s, { fetch: deps.signIn?.fetch, scope: PUPIL_SCOPE })]));
  const names = pupilCookieNames(base);
  const { secure } = names;
  const redirectUri = (id: string): string => `${base}/api/pupil/auth/${id}/callback`;
  const clearState = cookie(names.state, '', { path: names.statePath, maxAge: 0, secure });
  const clearSignIn = cookie(names.signIn, '', { path: names.signInPath, maxAge: 0, secure });

  const back = (reply: FastifyReply, error: PupilSignInError): FastifyReply =>
    reply.header('set-cookie', clearState).header('cache-control', 'no-store').redirect(`/r?error=${error}`);
  const refuse = (req: FastifyRequest, reply: FastifyReply, error: PupilSignInError, err?: unknown): FastifyReply => {
    // The library's error code and name only: its messages and causes can carry claims.
    const e = err as { code?: unknown; name?: unknown } | undefined;
    req.log.warn({ reason: error, code: typeof e?.code === 'string' ? e.code : undefined, name: typeof e?.name === 'string' ? e.name : undefined }, 'pupil sign-in refused');
    return back(reply, error);
  };

  void app.register(
    async (pupil) => {
      pupil.addHook('onRequest', async (req, reply) => {
        reply.header('cache-control', 'no-store');
        const off = pupilsRefusal(deps.env);
        if (!off) return;
        if (req.url.startsWith('/api/pupil/auth/')) return back(reply, off);
        return reply.code(403).send({ error: 'pupil sign-in is switched off', code: off });
      });

      pupil.get('/providers', async () => ({ providers: settings.map(publicProvider) }));

      pupil.get<{ Params: { provider: string }; Querystring: { code?: unknown } }>('/auth/:provider/start', async (req, reply) => {
        const provider = providers.get(req.params.provider);
        if (!provider || !secret) throw notFound('sign-in provider');
        let classCode: string | null = null;
        const typed = req.query.code;
        if (typed !== undefined && typed !== '') {
          // Given twice it is an array: not a code.
          const check = await checkClassCode({ ...codeDeps, counter }, clientAddress(req, trustProxy), typeof typed === 'string' ? typed : '');
          if (!check.ok) return refuse(req, reply, check.reason);
          classCode = check.canonical;
        }
        const checks = newChecks();
        let url: URL;
        try {
          url = await provider.authorizationUrl(redirectUri(provider.settings.id), checks);
        } catch (err) {
          return refuse(req, reply, 'provider_error', err);
        }
        // No invite and nowhere else to land: a pupil sign-in always comes back to /r.
        const sealed: PupilState = { ...checks, provider: provider.settings.id, invite: null, then: null, exp: Date.now() + STATE_MINUTES * 60_000, class_code: classCode };
        const state = sealState(sealed, secret);
        return reply.header('set-cookie', cookie(names.state, state, { path: names.statePath, maxAge: STATE_MINUTES * 60, secure })).redirect(url.toString());
      });

      pupil.get<{ Params: { provider: string }; Querystring: Record<string, string | undefined> }>('/auth/:provider/callback', async (req, reply) => {
        const provider = providers.get(req.params.provider);
        if (!provider || !secret) throw notFound('sign-in provider');
        // The state cookie first: an error from the provider counts only for a sign-in this browser started.
        const state = openState(readCookie(req, names.state), secret) as PupilState | null;
        if (!state || state.provider !== provider.settings.id) return refuse(req, reply, 'failed');
        const classCode = typeof state.class_code === 'string' ? state.class_code : null;
        if (req.query.error) return refuse(req, reply, req.query.error === 'access_denied' ? 'cancelled' : 'provider_error');

        let who;
        try {
          who = pupilIdentity(provider.settings, await provider.finish(new URL(req.url, base), state));
        } catch (err) {
          return refuse(req, reply, 'failed', err);
        }
        // The code is looked at again: it may have been renewed or closed while the pupil was away.
        // Someone new is then refused; a known pupil is signed in without joining.
        const check = classCode ? await liveClass(codeDeps, classCode) : null;
        if (check && !check.ok && !(await pupils.findPupil(who.provider, who.subject))) return refuse(req, reply, check.reason);
        const joining = check?.ok ? check.cls : null;
        const result = await admitPupil(accounts, pupils, who, joining !== null);
        if (!result.ok) return refuse(req, reply, result.reason);
        if (joining) await joins.join(result.pupil.id, joining);

        // A pupil sign-in this browser already had is ended, not left working beside the new one.
        const previous = readCookie(req, names.signIn);
        if (previous) await pupils.endSignIn(previous);
        const signIn = await pupils.startSignIn(result.pupil.id);
        return reply.header('set-cookie', [clearState, cookie(names.signIn, signIn.id, { path: names.signInPath, maxAge: PUPIL_SIGN_IN_DAYS * 86_400, secure })]).redirect('/r');
      });

      const signedIn = { preHandler: requirePupil(pupils, names.signIn) };
      pupil.get('/me', signedIn, async (req) => ({
        pupil: { provider: req.pupil!.provider, test: req.pupil!.provider === TEST_PUPIL_PROVIDER },
        classes: await openClasses(req.pupil!),
      }));

      pupil.post('/join', signedIn, async (req, reply) => {
        if (!fromSite(req, base)) return reply.code(403).send({ error: 'joining must come from this site' });
        if (req.pupil!.provider === TEST_PUPIL_PROVIDER) return reply.code(403).send({ error: 'a test pupil stays in its own class', code: 'test_pupil' });
        const { code } = parseOr400(JoinBody, req.body);
        const check = await checkClassCode({ ...codeDeps, counter }, clientAddress(req, trustProxy), code);
        if (!check.ok) return reply.code(JOIN_STATUS[check.reason]).send({ error: 'that class code does not let you in', code: check.reason });
        const member = await joins.join(req.pupil!.id, check.cls);
        return { class: classView({ ...member, class_name: check.cls.name }) };
      });

      pupil.post('/sign-out', async (req, reply) => {
        // A page on another site must not be able to sign a pupil out (auth.ts fromSite).
        if (!fromSite(req, base)) return reply.code(403).send({ error: 'sign-out must come from this site' });
        const id = readCookie(req, names.signIn);
        if (id) await pupils.endSignIn(id);
        return reply.header('set-cookie', clearSignIn).code(204).send();
      });
    },
    { prefix: '/api/pupil' },
  );
}
