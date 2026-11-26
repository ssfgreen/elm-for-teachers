/**
 * Route guards. Admin routes take the sign-in cookie of a fresh admin sign-in (accounts/admins.ts),
 * or, outside production (`deployEnv`), `Authorization: Bearer <ADMIN_PASSWORD>`; participant
 * routes use the session's participant token, from the Authorization header or the `token`
 * query parameter (sendBeacon and <img> cannot set headers).
 *
 * Signed-in teachers (accounts/routes.ts) carry the sign-in cookie (accounts/cookies.ts); `requireAccount`
 * resolves it to the account, whose workspace token then works like any participant link.
 * Pupils (pupils/routes.ts) carry their own cookie (pupils/cookies.ts); `requirePupil` resolves it
 * to the pupil. Neither cookie opens the other's routes: they are looked up in separate tables.
 *
 * This is the one place that decides who is asking.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { PARTICIPANT_TOKEN_QUERY, type AppDeps, type SessionRow } from './deps.js';
import { cookieNames, readCookie } from './accounts/cookies.js';
import { createAdminStore } from './accounts/admins.js';
import type { Account, AccountStore } from './accounts/store.js';
import type { DeployEnv } from './env.js';
import { vercelDeployEnv } from './env/vercel.js';

/** Who passed `requireAdmin`: the password (where `passwordAllowed`) or an admin's sign-in. */
export type AdminCaller =
  | { via: 'password' }
  | { via: 'account'; account: { id: string; name: string | null; email: string | null; provider: string } };

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `requireParticipant`: the session the participant token resolved to. */
    session?: SessionRow;
    /** Set by `requireAccount`: the signed-in account. */
    account?: Account;
    /** Set by `requireAccount`: the sign-in cookie's id (sign-out ends it). */
    signInId?: string;
    /** Set by `requireAdmin`. */
    admin?: AdminCaller;
  }
}

/** Constant-time string comparison (hashing first so lengths never leak or throw). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1] ? m[1].trim() : null;
}

function queryToken(req: FastifyRequest): string | null {
  const q = req.query as Record<string, unknown> | undefined;
  const v = q?.[PARTICIPANT_TOKEN_QUERY];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Token from the Authorization header, else the `token` query parameter. */
export function requestToken(req: FastifyRequest): string | null {
  return bearer(req) ?? queryToken(req);
}

function deny(reply: FastifyReply, status: 401 | 403, error: string, extra: Record<string, unknown> = {}): FastifyReply {
  return reply.code(status).send({ error, ...extra });
}

type PasswordEnv = Pick<AppDeps['env'], 'VERCEL_ENV' | 'ON_VERCEL' | 'DEPLOY_ENV' | 'ADMIN_PASSWORD'>;

/**
 * Where this deployment sits. On Vercel, VERCEL_ENV decides (env/vercel.ts), whatever DEPLOY_ENV
 * says, so a setting cannot turn the password on in Vercel production. Elsewhere (a laptop,
 * Docker, Kubernetes) DEPLOY_ENV decides, and unset is `local`.
 */
export function deployEnv(env: Omit<PasswordEnv, 'ADMIN_PASSWORD'>): DeployEnv {
  return vercelDeployEnv(env.VERCEL_ENV, env.ON_VERCEL) ?? env.DEPLOY_ENV ?? 'local';
}

/**
 * Where the admin password works: anywhere but production (`deployEnv`), so locally, in e2e and
 * on a Vercel preview (the development site). An empty password never works: env/admin.ts leaves it
 * empty on Vercel and in production when none is set.
 */
export function passwordAllowed(env: PasswordEnv): boolean {
  if (!env.ADMIN_PASSWORD) return false;
  return deployEnv(env) !== 'production';
}

export function isAdminToken(deps: Pick<AppDeps, 'env'>, token: string | null): boolean {
  return !!token && passwordAllowed(deps.env) && safeEqual(token, deps.env.ADMIN_PASSWORD);
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Whether a request came from a page on this site: its `Origin` is `base` (env.AUTH_BASE_URL).
 * Writes the sign-in cookie allows need it, as the cookie is SameSite=Lax, which still lets
 * some cross-site requests through. Browsers send `Origin` on every POST, PUT and DELETE.
 */
export function fromSite(req: Pick<FastifyRequest, 'headers'>, base: string | undefined): boolean {
  return base !== undefined && req.headers.origin === base;
}

/**
 * Admin guard. The sign-in cookie of an admin whose sign-in started within ADMIN_SIGN_IN_HOURS,
 * or the admin password where `passwordAllowed`. A write the cookie allows must carry `Origin` equal to the
 * site's: the cookie is SameSite=Lax, which still lets some cross-site requests through.
 * `allowQuery` lets an <img> (images in exported or mirrored docs) pass the password as `?token=`;
 * with the cookie an <img> needs nothing. Sets `request.admin`.
 */
export function requireAdmin(deps: Pick<AppDeps, 'env' | 'db'>, opts: { allowQuery?: boolean } = {}): preHandlerAsyncHookHandler {
  const admins = createAdminStore(deps.db);
  const signInCookie = cookieNames(deps.env.AUTH_BASE_URL).signIn;
  const base = deps.env.AUTH_BASE_URL;
  return async function (req, reply) {
    let crossSite = false;
    const id = readCookie(req, signInCookie);
    if (id) {
      const account = await admins.adminForSignIn(id);
      if (account && (SAFE_METHODS.has(req.method) || fromSite(req, base))) {
        req.admin = { via: 'account', account };
        return;
      }
      crossSite = account !== null;
    }
    const token = opts.allowQuery ? requestToken(req) : bearer(req);
    if (token && isAdminToken(deps, token)) {
      req.admin = { via: 'password' };
      return;
    }
    if (crossSite) return deny(reply, 403, 'admin changes must come from this site');
    // `password` tells /admin whether to offer the password form (local, e2e and previews).
    const password = passwordAllowed(deps.env);
    if (!token) return deny(reply, 401, 'admin sign-in required', { password });
    return deny(reply, 401, password ? 'invalid admin password' : 'admin sign-in required', { password });
  };
}

/** Participant guard: resolves the token, checks it belongs to `:sessionId`, sets `request.session`. */
export function requireParticipant(deps: Pick<AppDeps, 'sessions'>): preHandlerAsyncHookHandler {
  return async function (req, reply) {
    const token = requestToken(req);
    if (!token) return deny(reply, 401, 'participant token required');
    const session = await deps.sessions.byParticipantToken(token);
    if (!session) return deny(reply, 401, 'invalid participant token');
    const { sessionId } = (req.params ?? {}) as { sessionId?: string };
    if (sessionId !== session.session_id) return deny(reply, 403, 'token does not belong to this session');
    req.session = session;
  };
}

/** Signed-in guard: the sign-in cookie (named `cookie`) must name a sign-in that has not ended or expired. Sets `request.account`. */
export function requireAccount(accounts: Pick<AccountStore, 'accountForSignIn'>, cookie: string): preHandlerAsyncHookHandler {
  return async function (req, reply) {
    const id = readCookie(req, cookie);
    if (!id) return deny(reply, 401, 'sign-in required');
    const account = await accounts.accountForSignIn(id);
    if (!account) return deny(reply, 401, 'sign-in required');
    req.account = account;
    req.signInId = id;
  };
}

/**
 * The URL as the request log shows it. Sign-in addresses lose their query string: it carries an
 * invite code, the provider's code and state, and the provider's own error text.
 */
export function logUrl(url: string): string {
  return url.startsWith('/api/auth/') ? (url.split('?')[0] ?? url) : url;
}
