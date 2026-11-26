/**
 * The two sign-in cookies.
 *
 * - The state cookie carries a sign-in from start to callback (provider, state, nonce, PKCE
 *   verifier, the invite code if any, and where to land after: only `then: 'admin'`, never an address). Signed with AUTH_SECRET, lasts ten minutes.
 * - The sign-in cookie says the person is signed in. An opaque random id; the server keeps only
 *   its hash (sign_ins), so signing out ends that sign-in on the server, not only in this browser.
 *
 * Both are HttpOnly and SameSite=Lax (the callback is a top-level navigation from the
 * provider). On an https site they are Secure and named with the `__Host-` prefix, which needs
 * `Path=/` and no Domain, so a page on a sibling subdomain cannot set them. On plain http
 * (localhost) browsers refuse that prefix, so they keep plain names on the /api paths.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { Checks } from './oidc.js';

export const STATE_MINUTES = 10;

export interface CookieNames {
  secure: boolean;
  state: string;
  statePath: string;
  signIn: string;
  signInPath: string;
}

/** The cookies' names and paths for a site at `base` (env.AUTH_BASE_URL). */
export function cookieNames(base: string | undefined): CookieNames {
  return base?.startsWith('https:')
    ? { secure: true, state: '__Host-edw_auth_state', statePath: '/', signIn: '__Host-edw_sign_in', signInPath: '/' }
    : { secure: false, state: 'edw_auth_state', statePath: '/api/auth', signIn: 'edw_sign_in', signInPath: '/api' };
}

/** The only places a sign-in can ask to land: an allowed list, so there is no open redirect. */
export type SignInThen = 'admin' | null;

/** The allowed value for `then`, or null for anything else (missing, or not on the list). */
export const readThen = (value: unknown): SignInThen => (value === 'admin' ? 'admin' : null);

export interface SignInState extends Checks {
  provider: string;
  /** The invite code the person arrived with, or null. */
  invite: string | null;
  /** Where to land after, from an allowed list: 'admin' (a sign-in started on /admin) or null (/w). */
  then: SignInThen;
  /** Milliseconds since the epoch after which the state is refused. */
  exp: number;
}

const mac = (body: string, secret: string): Buffer => createHmac('sha256', secret).update(body).digest();

export function sealState(state: SignInState, secret: string): string {
  const body = Buffer.from(JSON.stringify(state)).toString('base64url');
  return `${body}.${mac(body, secret).toString('base64url')}`;
}

/** The state, or null when it is missing, tampered with, malformed or expired. */
export function openState(value: string | null, secret: string, now = Date.now()): SignInState | null {
  if (!value) return null;
  const [body, sig, extra] = value.split('.');
  if (!body || !sig || extra !== undefined) return null;
  const given = Buffer.from(sig, 'base64url');
  const want = mac(body, secret);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<SignInState>;
    const strings = [s.provider, s.state, s.nonce, s.codeVerifier].every((x) => typeof x === 'string' && x.length > 0);
    if (!strings || typeof s.exp !== 'number' || (s.invite !== null && typeof s.invite !== 'string')) return null;
    // Missing in a cookie sealed before `then` existed: that reads as null.
    if (s.then !== undefined && s.then !== null && s.then !== 'admin') return null;
    if (s.exp <= now) return null;
    return { ...(s as SignInState), then: s.then ?? null };
  } catch {
    return null;
  }
}

/** One cookie's value from the request, or null. */
export function readCookie(req: Pick<FastifyRequest, 'headers'>, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      const v = part.slice(eq + 1).trim();
      return v.length > 0 ? v : null;
    }
  }
  return null;
}

/** A Set-Cookie value. `maxAge` 0 clears the cookie. */
export function cookie(name: string, value: string, opts: { path: string; maxAge: number; secure: boolean }): string {
  return [`${name}=${value}`, `Path=${opts.path}`, `Max-Age=${Math.max(0, Math.floor(opts.maxAge))}`, 'HttpOnly', 'SameSite=Lax', ...(opts.secure ? ['Secure'] : [])].join('; ');
}
