/**
 * Signing in with Google or Microsoft (issue #23). Shapes are in docs/HANDOVER.md 4a15.
 *
 *   GET  /api/auth/providers                -> { providers: [{ id, label, kind }] }, only those set up
 *   GET  /api/auth/:provider/start?invite=&then=admin -> 302 to the provider; sets the state cookie
 *   GET  /api/auth/:provider/callback       -> 302 to /w, or /admin (an admin who started with then=admin), or /signin?error=<reason>
 *   POST /api/auth/sign-out                 -> 204; 403 from another origin
 *   GET  /api/account/workspace             -> { session_id, token, account }   (signed in; account.is_admin)
 *   POST /api/account/notice { version }    -> 204; 403 from another origin    (signed in)
 *
 * Redirect addresses are built on env.AUTH_BASE_URL, never the request's Host header.
 * Privacy: no log line, error or redirect carries a subject, email or name.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { fromSite, requireAccount } from '../auth.js';
import type { AppDeps } from '../deps.js';
import { notFound } from '../http-error.js';
import { parseOr400 } from '../http/request.js';
import { cookie, cookieNames, openState, readCookie, readThen, sealState, STATE_MINUTES } from './cookies.js';
import { createOidcProvider, newChecks, reduceClaims, type OidcProvider } from './oidc.js';
import { createAdminStore } from './admins.js';
import { admit, type Refusal } from './policy.js';
import { providersFromEnv, publicProvider, type ProviderSettings } from './providers.js';
import { createAccountStore, SIGN_IN_DAYS, type AccountStore } from './store.js';

/** Why /signin was sent back to: the client shows a message for each. */
export type SignInError = Refusal | 'cancelled' | 'provider_error' | 'failed';

// Spaces too: a typed code is forgiven when it is claimed (access/codes.ts).
const INVITE_CODE = /^[A-Za-z0-9_ -]{8,64}$/;
const NoticeBody = z.object({ version: z.string().trim().min(1).max(40) });

export function registerSignInRoutes(app: FastifyInstance, deps: AppDeps): void {
  const accounts: AccountStore = deps.accounts ?? createAccountStore(deps.db, deps.sessions);
  const admins = createAdminStore(deps.db);
  const { AUTH_SECRET: secret, AUTH_BASE_URL: base } = deps.env;
  const settings: ProviderSettings[] = secret && base ? (deps.signIn?.providers ?? providersFromEnv(deps.env)) : [];
  const providers = new Map<string, OidcProvider>(settings.map((s) => [s.id, createOidcProvider(s, { fetch: deps.signIn?.fetch })]));
  const names = cookieNames(base);
  const { secure } = names;
  const doors = { microsoftTenants: deps.env.AUTH_OPEN_MICROSOFT_TENANTS ?? [], googleDomains: deps.env.AUTH_OPEN_GOOGLE_DOMAINS ?? [] };
  const redirectUri = (id: string): string => `${base}/api/auth/${id}/callback`;
  const clearState = cookie(names.state, '', { path: names.statePath, maxAge: 0, secure });
  const clearSignIn = cookie(names.signIn, '', { path: names.signInPath, maxAge: 0, secure });

  const back = (reply: FastifyReply, error: SignInError): FastifyReply =>
    reply.header('set-cookie', clearState).header('cache-control', 'no-store').redirect(`/signin?error=${error}`);
  const refuse = (req: FastifyRequest, reply: FastifyReply, error: SignInError, err?: unknown): FastifyReply => {
    // The library's error code and name only: its messages and causes can carry claims.
    const e = err as { code?: unknown; name?: unknown } | undefined;
    req.log.warn({ reason: error, code: typeof e?.code === 'string' ? e.code : undefined, name: typeof e?.name === 'string' ? e.name : undefined }, 'sign-in refused');
    return back(reply, error);
  };

  app.get('/api/auth/providers', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return { providers: settings.map(publicProvider) };
  });

  app.get<{ Params: { provider: string }; Querystring: { invite?: string; then?: string } }>('/api/auth/:provider/start', async (req, reply) => {
    const provider = providers.get(req.params.provider);
    if (!provider || !secret) throw notFound('sign-in provider');
    const invite = req.query.invite ?? null;
    if (invite !== null && !INVITE_CODE.test(invite)) return back(reply, 'invite_unknown');
    const checks = newChecks();
    let url: URL;
    try {
      url = await provider.authorizationUrl(redirectUri(provider.settings.id), checks);
    } catch (err) {
      return refuse(req, reply, 'provider_error', err);
    }
    const state = sealState({ ...checks, provider: provider.settings.id, invite, then: readThen(req.query.then), exp: Date.now() + STATE_MINUTES * 60_000 }, secret);
    return reply
      .header('set-cookie', cookie(names.state, state, { path: names.statePath, maxAge: STATE_MINUTES * 60, secure }))
      .header('cache-control', 'no-store')
      .redirect(url.toString());
  });

  app.get<{ Params: { provider: string }; Querystring: Record<string, string | undefined> }>('/api/auth/:provider/callback', async (req, reply) => {
    const provider = providers.get(req.params.provider);
    if (!provider || !secret) throw notFound('sign-in provider');
    // The state cookie first: an error from the provider counts only for a sign-in this browser started.
    const state = openState(readCookie(req, names.state), secret);
    if (!state || state.provider !== provider.settings.id) return refuse(req, reply, 'failed');
    if (req.query.error) return refuse(req, reply, req.query.error === 'access_denied' ? 'cancelled' : 'provider_error');

    let who;
    try {
      // The address the provider sent the browser to, rebuilt on our own base, not the Host header.
      const claims = await provider.finish(new URL(req.url, base), state);
      who = reduceClaims(provider.settings, claims);
    } catch (err) {
      return refuse(req, reply, 'failed', err);
    }
    const result = await admit(accounts, provider.settings, who, state.invite, doors);
    if (!result.ok) return refuse(req, reply, result.reason);

    // A sign-in this browser already had is ended, not left working beside the new one.
    const previous = readCookie(req, names.signIn);
    if (previous) await accounts.endSignIn(previous);
    await accounts.recordSignIn(result.account.id);
    const signIn = await accounts.startSignIn(result.account);
    // Everyone lands on /w; /admin only when the sign-in began there and the account is an admin.
    const landing = state.then === 'admin' && (await admins.isAdmin(result.account.id)) ? '/admin' : '/w';
    return reply
      .header('set-cookie', [clearState, cookie(names.signIn, signIn.id, { path: names.signInPath, maxAge: SIGN_IN_DAYS * 86_400, secure })])
      .header('cache-control', 'no-store')
      .redirect(landing);
  });

  // A page on another site must not be able to change what a signed-in person has (auth.ts fromSite).
  const fromThisSite = (req: FastifyRequest): boolean => fromSite(req, base);

  app.post('/api/auth/sign-out', async (req, reply) => {
    if (!fromThisSite(req)) return reply.code(403).send({ error: 'sign-out must come from this site' });
    const id = readCookie(req, names.signIn);
    if (id) await accounts.endSignIn(id);
    return reply.header('set-cookie', clearSignIn).code(204).send();
  });

  void app.register(
    async (account) => {
      account.addHook('preHandler', requireAccount(accounts, names.signIn));
      account.addHook('onSend', async (_req, reply) => {
        reply.header('cache-control', 'no-store');
      });

      account.get('/workspace', async (req) => {
        const a = req.account!;
        const session = await deps.sessions.get(a.session_id);
        if (!session) throw notFound('workspace');
        return {
          session_id: session.session_id,
          token: session.participant_token,
          account: { provider: a.provider, email: a.email, display_name: a.display_name, notice_version: a.notice_version, is_admin: await admins.isAdmin(a.id) },
        };
      });

      account.post('/notice', async (req, reply) => {
        if (!fromThisSite(req)) return reply.code(403).send({ error: 'must come from this site' });
        const { version } = parseOr400(NoticeBody, req.body);
        await accounts.recordNoticeAccepted(req.account!.id, version);
        return reply.code(204).send();
      });
    },
    { prefix: '/api/account' },
  );
}
