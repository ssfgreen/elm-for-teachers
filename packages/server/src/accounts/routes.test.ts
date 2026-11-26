import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../app.js';
import type { AppDeps } from '../deps.js';
import { tempDb, testDeps, testEnv, type TempDb } from '../test-helpers.js';
import { cookieNames, sealState, type SignInState } from './cookies.js';
import { startFakeIssuer, type FakeIssuer, type FakeLogin } from './fake-issuer.js';
import { microsoftIssuer, type ProviderSettings } from './providers.js';
import { createAccountStore, type AccountStore } from './store.js';

const BASE = 'https://edw.example';
const { state: STATE_COOKIE, signIn: SIGN_IN_COOKIE } = cookieNames(BASE);
const SECRET = 's'.repeat(40);
const TENANT_OK = '11111111-1111-1111-1111-111111111111';
const TENANT_OTHER = '22222222-2222-2222-2222-222222222222';

let t: TempDb;
let app: FastifyInstance;
let store: AccountStore;
let deps: AppDeps;
let fake: FakeIssuer;
let fakeMs: FakeIssuer;
let fakeGoogle: FakeIssuer;
let n = 0;

beforeAll(async () => {
  fake = await startFakeIssuer();
  fakeMs = await startFakeIssuer({ issuer: 'https://login.microsoftonline.com/{tenantid}/v2.0' });
  fakeGoogle = await startFakeIssuer();
  const msUrl = microsoftIssuer('organizations');
  const providers: ProviderSettings[] = [
    { kind: 'oidc', id: 'test', label: 'Test', family: 'generic', issuer: fake.url, clientId: fake.clientId, clientSecret: fake.clientSecret, allowHttp: true },
    { kind: 'oidc', id: 'microsoft', label: 'Microsoft', family: 'microsoft', issuer: msUrl, clientId: fakeMs.clientId, clientSecret: fakeMs.clientSecret, allowHttp: true },
    { kind: 'oidc', id: 'google', label: 'Google', family: 'google', issuer: fakeGoogle.url, clientId: fakeGoogle.clientId, clientSecret: fakeGoogle.clientSecret, allowHttp: true },
  ];
  // The Microsoft provider names the real Entra address; this sends its discovery to the fake.
  const toFakes: typeof fetch = (input, init) => fetch(String(input instanceof Request ? input.url : input).replace(msUrl, fakeMs.url), init);
  t = await tempDb();
  const base = testDeps(t.db);
  const env = testEnv({ AUTH_SECRET: SECRET, AUTH_BASE_URL: BASE, AUTH_OPEN_MICROSOFT_TENANTS: [TENANT_OK], AUTH_OPEN_GOOGLE_DOMAINS: ['school.example'] });
  store = createAccountStore(t.db, base.sessions);
  deps = { ...base, env, signIn: { providers, fetch: toFakes }, accounts: store };
  app = await buildApp(deps);
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await Promise.all([fake.close(), fakeMs.close(), fakeGoogle.close()]);
  t.cleanup();
});

const setCookies = (res: LightMyRequestResponse): string[] => [res.headers['set-cookie'] ?? []].flat().map(String);
const cookieValue = (res: LightMyRequestResponse, name: string): string | null => {
  const c = setCookies(res).find((x) => x.startsWith(`${name}=`));
  const v = c?.slice(name.length + 1).split(';')[0];
  return v ? v : null;
};
const issuerFor = (id: string): FakeIssuer => (id === 'microsoft' ? fakeMs : id === 'google' ? fakeGoogle : fake);

interface Flow {
  start: LightMyRequestResponse;
  state: string;
  /** The address the provider sent the browser back to (path and query). */
  callback: string;
}

async function startFlow(provider: string, opts: { invite?: string; login?: FakeLogin; host?: string } = {}): Promise<Flow> {
  const start = await app.inject({ url: `/api/auth/${provider}/start${opts.invite ? `?invite=${opts.invite}` : ''}`, headers: opts.host ? { host: opts.host } : {} });
  expect(start.statusCode).toBe(302);
  issuerFor(provider).next(opts.login ?? { claims: { sub: `person-${++n}` } });
  const auth = await fetch(start.headers.location!, { redirect: 'manual' });
  const back = new URL(auth.headers.get('location')!);
  return { start, state: cookieValue(start, STATE_COOKIE)!, callback: back.pathname + back.search };
}

const finish = (f: Flow, state: string | null = f.state, url = f.callback): Promise<LightMyRequestResponse> =>
  app.inject({ url, headers: state ? { cookie: `${STATE_COOKIE}=${state}` } : {} });

async function signIn(provider: string, opts: { invite?: string; login?: FakeLogin } = {}): Promise<LightMyRequestResponse> {
  return finish(await startFlow(provider, opts));
}

const workspace = (signInId: string | null) => app.inject({ url: '/api/account/workspace', headers: signInId ? { cookie: `${SIGN_IN_COOKIE}=${signInId}` } : {} });
const invite = async (label = 'Year 9') => (await store.createInvite({ label })).code;

function refused(res: LightMyRequestResponse, reason: string): void {
  expect(res.statusCode).toBe(302);
  expect(res.headers.location).toBe(`/signin?error=${reason}`);
  expect(cookieValue(res, SIGN_IN_COOKIE)).toBeNull();
}

describe('providers', () => {
  it('lists the providers set up, with no client id or secret', async () => {
    const res = await app.inject({ url: '/api/auth/providers' });
    expect(res.json()).toEqual({ providers: [{ id: 'test', label: 'Test', kind: 'oidc' }, { id: 'microsoft', label: 'Microsoft', kind: 'oidc' }, { id: 'google', label: 'Google', kind: 'oidc' }] });
    expect(res.body).not.toContain(fake.clientSecret);
    expect(res.body).not.toContain(fake.clientId);
  });

  it('offers none without AUTH_SECRET, and an unknown provider is a 404', async () => {
    const t2 = await tempDb();
    const bare = await buildApp({ ...testDeps(t2.db), env: testEnv({ AUTH_BASE_URL: BASE }), signIn: { providers: [{ kind: 'oidc', id: 'test', label: 'Test', family: 'generic', issuer: fake.url, clientId: 'x', clientSecret: 'y' }] } });
    expect((await bare.inject({ url: '/api/auth/providers' })).json()).toEqual({ providers: [] });
    expect((await bare.inject({ url: '/api/auth/test/start' })).statusCode).toBe(404);
    await bare.close();
    t2.cleanup();
    expect((await app.inject({ url: '/api/auth/nobody/start' })).statusCode).toBe(404);
  });
});

describe('signing in', () => {
  it('claims an invite, sets an opaque sign-in cookie, and the workspace answers with its token', async () => {
    const res = await signIn('test', { invite: await invite() });
    expect(res.headers.location).toBe('/w');
    const set = setCookies(res).find((c) => c.startsWith(`${SIGN_IN_COOKIE}=`))!;
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/SameSite=Lax/);
    expect(set).toMatch(/Secure/);
    expect(set).toMatch(/^__Host-edw_sign_in=[^;]+; Path=\/;/);
    const ws = await workspace(cookieValue(res, SIGN_IN_COOKIE));
    expect(ws.statusCode).toBe(200);
    expect(ws.headers['cache-control']).toBe('no-store');
    const { session_id, token } = ws.json<{ session_id: string; token: string }>();
    // The token is an ordinary workspace token: requireParticipant is unchanged.
    expect((await app.inject({ url: `/api/sessions/${session_id}`, headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(200);
  });

  it('claims a typed invite code with spaces and small letters', async () => {
    const typed = (await invite('Typed')).replace(/-/g, ' ').toLowerCase();
    const res = await signIn('test', { invite: encodeURIComponent(typed) });
    expect(res.headers.location).toBe('/w');
  });

  it('gives the same identity the same workspace on a second sign-in, with no invite', async () => {
    const who = { claims: { sub: 'returning-teacher' } };
    const first = await workspace(cookieValue(await signIn('test', { invite: await invite(), login: who }), SIGN_IN_COOKIE));
    const second = await workspace(cookieValue(await signIn('test', { login: who }), SIGN_IN_COOKIE));
    expect(second.json().session_id).toBe(first.json().session_id);
    // Found before any invite is looked at: an unknown or used code does not turn them away.
    const third = await signIn('test', { invite: 'no-such-invite-code', login: who });
    expect((await workspace(cookieValue(third, SIGN_IN_COOKIE))).json().session_id).toBe(first.json().session_id);
  });

  it('ends the sign-in the browser already had when it signs in again', async () => {
    const who = { claims: { sub: 'signs-in-twice' } };
    const first = cookieValue(await signIn('test', { invite: await invite(), login: who }), SIGN_IN_COOKIE)!;
    const flow = await startFlow('test', { login: who });
    const again = await app.inject({ url: flow.callback, headers: { cookie: `${STATE_COOKIE}=${flow.state}; ${SIGN_IN_COOKIE}=${first}` } });
    const second = cookieValue(again, SIGN_IN_COOKIE);
    expect(second).not.toBeNull();
    expect((await workspace(first)).statusCode).toBe(401);
    expect((await workspace(second)).statusCode).toBe(200);
  });

  it('builds the redirect address on AUTH_BASE_URL, never the Host header', async () => {
    const flow = await startFlow('test', { host: 'evil.example' });
    const asked = new URL(flow.start.headers.location!);
    expect(asked.searchParams.get('redirect_uri')).toBe(`${BASE}/api/auth/test/callback`);
    expect(flow.start.body).not.toContain('evil.example');
  });

  it('records the notice version accepted, only from this site', async () => {
    const id = cookieValue(await signIn('test', { invite: await invite() }), SIGN_IN_COOKIE);
    const notice = (origin?: string) =>
      app.inject({ method: 'POST', url: '/api/account/notice', payload: { version: '2026-11' }, headers: { cookie: `${SIGN_IN_COOKIE}=${id}`, ...(origin ? { origin } : {}) } });
    expect((await notice('https://evil.example')).statusCode).toBe(403);
    expect((await notice()).statusCode).toBe(403);
    expect((await workspace(id)).json().account.notice_version).toBeNull();
    expect((await notice(BASE)).statusCode).toBe(204);
    expect((await workspace(id)).json().account.notice_version).toBe('2026-11');
  });
});

describe('refused', () => {
  it('a state that does not match', async () => {
    const flow = await startFlow('test', { invite: await invite() });
    refused(await finish(flow, flow.state, flow.callback.replace(/state=[^&]+/, 'state=forged')), 'failed');
  });

  it('a missing state, or no state cookie', async () => {
    const flow = await startFlow('test', { invite: await invite() });
    refused(await finish(flow, flow.state, flow.callback.replace(/&?state=[^&]+/, '')), 'failed');
    const again = await startFlow('test', { invite: await invite() });
    refused(await finish(again, null), 'failed');
  });

  it('a nonce that does not match', async () => {
    refused(await signIn('test', { invite: await invite(), login: { nonce: 'replayed' } }), 'failed');
  });

  it('a token for another audience, or signed with an unknown key', async () => {
    refused(await signIn('test', { invite: await invite(), login: { aud: 'another-app' } }), 'failed');
    refused(await signIn('test', { invite: await invite(), login: { unknownKey: true } }), 'failed');
  });

  it('an expired state cookie', async () => {
    const flow = await startFlow('test', { invite: await invite() });
    const state = JSON.parse(Buffer.from(flow.state.split('.')[0]!, 'base64url').toString()) as SignInState;
    refused(await finish(flow, sealState({ ...state, exp: Date.now() - 1000 }, SECRET)), 'failed');
    // A state cookie someone edited is refused the same way.
    refused(await finish(await startFlow('test'), sealState({ ...state, exp: Date.now() + 60_000 }, 'another-secret-another-secret-another')), 'failed');
  });

  it('a Microsoft tenant not listed, without an invite; a listed one is let in', async () => {
    const before = (await t.db.execute('SELECT COUNT(*) AS n FROM accounts')).rows[0]!.n;
    refused(await signIn('microsoft', { login: { claims: { sub: 'ms-1', tid: TENANT_OTHER } } }), 'not_allowed');
    expect((await t.db.execute('SELECT COUNT(*) AS n FROM accounts')).rows[0]!.n).toBe(before);
    const ok = await signIn('microsoft', { login: { claims: { sub: 'ms-2', tid: TENANT_OK } } });
    const ws = (await workspace(cookieValue(ok, SIGN_IN_COOKIE))).json();
    expect((await t.db.execute('SELECT label, access FROM sessions WHERE session_id = ?', [ws.session_id])).rows[0]).toMatchObject({ label: 'Microsoft sign-in', access: 'account' });
  });

  it('a Microsoft token whose issuer is not its tid', async () => {
    refused(await signIn('microsoft', { login: { claims: { sub: 'ms-3', tid: TENANT_OK, iss: microsoftIssuer(TENANT_OTHER) } } }), 'failed');
  });

  it('a Google domain not listed, and an email at a listed domain with no hd', async () => {
    refused(await signIn('google', { login: { claims: { sub: 'g-1', hd: 'elsewhere.example' } } }), 'not_allowed');
    refused(await signIn('google', { login: { claims: { sub: 'g-2', email: 'p@school.example', email_verified: true } } }), 'not_allowed');
    expect((await signIn('google', { login: { claims: { sub: 'g-3', hd: 'school.example' } } })).headers.location).toBe('/w');
  });

  it('an unknown, used or expired invite', async () => {
    refused(await signIn('test', { invite: 'no-such-invite-code' }), 'invite_unknown');
    const code = await invite();
    expect((await signIn('test', { invite: code })).headers.location).toBe('/w');
    refused(await signIn('test', { invite: code }), 'invite_used');
    const old = await store.createInvite({ label: 'Old' });
    await t.db.execute('UPDATE account_invites SET expires_at = ? WHERE code_hash = ?', ['2000-01-01T00:00:00.000Z', old.invite.id]);
    refused(await signIn('test', { invite: old.code }), 'invite_expired');
  });

  it('a cancelled sign-in comes back as cancelled, only with the state cookie', async () => {
    refused(await signIn('test', { login: { error: 'access_denied' } }), 'cancelled');
    // With no sign-in started in this browser, the provider's error is not believed.
    refused(await app.inject({ url: '/api/auth/test/callback?error=access_denied' }), 'failed');
  });
});

describe('signing out', () => {
  it('ends the sign-in: the old cookie no longer works', async () => {
    const id = cookieValue(await signIn('test', { invite: await invite() }), SIGN_IN_COOKIE);
    expect((await workspace(id)).statusCode).toBe(200);
    const out = await app.inject({ method: 'POST', url: '/api/auth/sign-out', headers: { origin: BASE, cookie: `${SIGN_IN_COOKIE}=${id}` } });
    expect(out.statusCode).toBe(204);
    expect(setCookies(out).some((c) => c.startsWith(`${SIGN_IN_COOKIE}=;`) && c.includes('Max-Age=0'))).toBe(true);
    expect((await workspace(id)).statusCode).toBe(401);
    expect((await workspace(null)).statusCode).toBe(401);
  });

  it('is refused from another origin, or with no origin, and the sign-in carries on', async () => {
    const id = cookieValue(await signIn('test', { invite: await invite() }), SIGN_IN_COOKIE);
    for (const headers of [{ origin: 'https://evil.example' }, {}]) {
      const out = await app.inject({ method: 'POST', url: '/api/auth/sign-out', headers: { ...headers, cookie: `${SIGN_IN_COOKIE}=${id}` } });
      expect(out.statusCode).toBe(403);
    }
    expect((await workspace(id)).statusCode).toBe(200);
  });
});

it("keeps a signed-in account's email, name and subject out of every table but accounts and account_invites, and out of its export", async () => {
  const EMAIL = 'signed.in@school.example';
  const NAME = 'Morag Signedin';
  const SUBJECT = 'subject-signed-in-0987654321';
  const res = await signIn('test', { invite: await invite('Privacy'), login: { claims: { sub: SUBJECT, email: EMAIL, name: NAME } } });
  const ws = await workspace(cookieValue(res, SIGN_IN_COOKIE));
  expect(ws.json().account).toMatchObject({ email: EMAIL, display_name: NAME });
  const { session_id } = ws.json<{ session_id: string }>();
  const exported = await app.inject({ url: `/api/admin/sessions/${session_id}/export.json`, headers: { authorization: `Bearer ${testEnv().ADMIN_PASSWORD}` } });
  expect(exported.statusCode).toBe(200);
  for (const secret of [EMAIL, NAME, SUBJECT]) expect(exported.body).not.toContain(secret);
  const tables = (await t.db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.map((r) => String(r.name));
  for (const table of tables.filter((x) => x !== 'accounts' && x !== 'account_invites')) {
    const rows = JSON.stringify((await t.db.execute(`SELECT * FROM ${table}`)).rows);
    for (const secret of [EMAIL, NAME, SUBJECT]) expect(rows.includes(secret), `${table} holds ${secret}`).toBe(false);
  }
});

it('keeps the query string of sign-in addresses out of the request log', async () => {
  const lines: string[] = [];
  const logged = await buildApp(deps, { logger: true, logStream: { write: (line) => void lines.push(line) } });
  const code = await invite();
  const start = await logged.inject({ url: `/api/auth/test/start?invite=${code}` });
  fake.next({ claims: { sub: 'logged-person' } });
  const back = new URL((await fetch(start.headers.location!, { redirect: 'manual' })).headers.get('location')!);
  const done = await logged.inject({ url: back.pathname + back.search, headers: { cookie: `${STATE_COOKIE}=${cookieValue(start, STATE_COOKIE)}` } });
  expect(done.headers.location).toBe('/w');
  await logged.inject({ url: '/api/auth/test/callback?error=access_denied&error_description=private-words' });
  await logged.close();
  const log = lines.join('');
  expect(log).toContain('/api/auth/test/callback');
  for (const secret of [code, back.searchParams.get('code')!, back.searchParams.get('state')!, 'private-words', 'logged-person']) expect(log).not.toContain(secret);
});
