/**
 * Pupil sign-in on /r (issue #179) against fake issuers: what is asked for, what is kept, the
 * refusals, the two kinds of sign-in kept apart, and nothing about a pupil anywhere but `pupils`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../app.js';
import type { AppDeps } from '../deps.js';
import { tempDb, testDeps, testEnv, type TempDb } from '../test-helpers.js';
import { cookieNames } from '../accounts/cookies.js';
import { startFakeIssuer, type FakeIssuer, type FakeLogin } from '../accounts/fake-issuer.js';
import { microsoftIssuer, type ProviderSettings } from '../accounts/providers.js';
import { createAccountStore, type AccountStore } from '../accounts/store.js';
import { pupilCookieNames } from './cookies.js';
import { createPupilStore, type PupilStore } from './store.js';
import { classWithCode } from '../class-joins/test-class.js';

const BASE = 'https://edw.example';
const SECRET = 's'.repeat(40);
const TENANT = '11111111-1111-1111-1111-111111111111';
const PUPIL = pupilCookieNames(BASE);
const TEACHER = cookieNames(BASE);

let t: TempDb;
let app: FastifyInstance;
let deps: AppDeps;
let accounts: AccountStore;
let pupils: PupilStore;
let fake: FakeIssuer;
let fakeMs: FakeIssuer;
let fakeGoogle: FakeIssuer;
const logs: string[] = [];
let n = 0;
/** A live class code: someone new signs in only with one (#209). */
let CODE: string;
let CLASS_ID: string;

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
  const toFakes: typeof fetch = (input, init) => fetch(String(input instanceof Request ? input.url : input).replace(msUrl, fakeMs.url), init);
  t = await tempDb();
  const base = testDeps(t.db);
  accounts = createAccountStore(t.db, base.sessions);
  pupils = createPupilStore(t.db);
  deps = { ...base, env: testEnv({ AUTH_SECRET: SECRET, AUTH_BASE_URL: BASE, PUPILS: 'on', AUTH_OPEN_GOOGLE_DOMAINS: ['open.example'] }), signIn: { providers, fetch: toFakes }, accounts, pupils };
  app = await buildApp(deps, { logger: true, logStream: { write: (line) => void logs.push(line) } });
  await app.ready();
  const first = await classWithCode(deps, { name: '8B' });
  CODE = first.code;
  CLASS_ID = first.cls.id;
});
afterAll(async () => {
  await app.close();
  await Promise.all([fake.close(), fakeMs.close(), fakeGoogle.close()]);
  t.cleanup();
});

const setCookies = (res: LightMyRequestResponse): string[] => [res.headers['set-cookie'] ?? []].flat().map(String);
const cookieValue = (res: LightMyRequestResponse, name: string): string | null => {
  const v = setCookies(res).find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1).split(';')[0];
  return v ? v : null;
};
const issuerFor = (id: string): FakeIssuer => (id === 'microsoft' ? fakeMs : id === 'google' ? fakeGoogle : fake);

/** A whole sign-in through `path` (`/api/pupil/auth` or the teachers' `/api/auth`): the callback's answer. */
async function signInAt(path: string, provider: string, login: FakeLogin, stateCookie: string, extra: Record<string, string> = {}, query = ''): Promise<LightMyRequestResponse> {
  const start = await app.inject({ url: `${path}/${provider}/start${query}` });
  expect(start.statusCode).toBe(302);
  issuerFor(provider).next(login);
  const auth = await fetch(start.headers.location!, { redirect: 'manual' });
  const back = new URL(auth.headers.get('location')!);
  const cookies = [`${stateCookie}=${cookieValue(start, stateCookie)}`, ...Object.entries(extra).map(([k, v]) => `${k}=${v}`)];
  return app.inject({ url: back.pathname + back.search, headers: { cookie: cookies.join('; ') } });
}
const pupilSignIn = (provider: string, login: FakeLogin, extra?: Record<string, string>) => signInAt('/api/pupil/auth', provider, login, PUPIL.state, extra, `?code=${CODE}`);

const me = (headers: Record<string, string>) => app.inject({ url: '/api/pupil/me', headers });
const pupilCookie = (res: LightMyRequestResponse) => `${PUPIL.signIn}=${cookieValue(res, PUPIL.signIn)}`;

describe('a pupil signs in', () => {
  it('asks the provider for openid only, lands on /r and is signed in as a pupil', async () => {
    const res = await pupilSignIn('test', { claims: { sub: `pupil-${++n}` } });
    expect(fake.authorizeRequests.at(-1)!.searchParams.get('scope')).toBe('openid');
    expect(fake.authorizeRequests.at(-1)!.searchParams.get('redirect_uri')).toBe(`${BASE}/api/pupil/auth/test/callback`);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/r');
    const set = setCookies(res).find((c) => c.startsWith(`${PUPIL.signIn}=`))!;
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/Secure/);
    expect(set).toMatch(/Max-Age=86400/);
    const who = await me({ cookie: pupilCookie(res) });
    expect(who.statusCode).toBe(200);
    expect(who.json()).toEqual({ pupil: { provider: 'test', test: false }, classes: [{ class_id: CLASS_ID, class_name: '8B', label: 'Pupil 1' }] });
  });

  it('keeps only the provider, subject and tenant, even when the token carries a name and email', async () => {
    const sub = `ms-pupil-${++n}`;
    const res = await pupilSignIn('microsoft', { claims: { sub, tid: TENANT, name: 'Ada Pupil', email: 'ada@school.example', preferred_username: 'ada@school.example' } });
    expect(res.headers.location).toBe('/r');
    const row = (await t.db.execute('SELECT * FROM pupils WHERE subject = ?', [sub])).rows[0]!;
    expect(Object.keys(row).sort()).toEqual(['created_at', 'id', 'last_sign_in_at', 'provider', 'subject', 'tenant']);
    expect({ provider: row.provider, tenant: row.tenant }).toEqual({ provider: 'microsoft', tenant: TENANT });

    const google = `g-pupil-${++n}`;
    await pupilSignIn('google', { claims: { sub: google, hd: 'School.Example', email: 'bo@school.example', name: 'Bo' } });
    expect((await t.db.execute('SELECT tenant FROM pupils WHERE subject = ?', [google])).rows[0]!.tenant).toBe('school.example');
  });

  it('is the same pupil next time, and a new sign-in in the browser ends the old one', async () => {
    const sub = `again-${++n}`;
    const first = await pupilSignIn('test', { claims: { sub } });
    const second = await pupilSignIn('test', { claims: { sub } }, { [PUPIL.signIn]: cookieValue(first, PUPIL.signIn)! });
    expect((await t.db.execute('SELECT COUNT(*) AS c FROM pupils WHERE subject = ?', [sub])).rows[0]!.c).toBe(1);
    expect((await me({ cookie: pupilCookie(first) })).statusCode).toBe(401);
    expect((await me({ cookie: pupilCookie(second) })).statusCode).toBe(200);
  });

  it('signs out from this site only', async () => {
    const res = await pupilSignIn('test', { claims: { sub: `out-${++n}` } });
    const cookie = pupilCookie(res);
    expect((await app.inject({ method: 'POST', url: '/api/pupil/sign-out', headers: { cookie, origin: 'https://other.example' } })).statusCode).toBe(403);
    expect((await me({ cookie })).statusCode).toBe(200);
    const out = await app.inject({ method: 'POST', url: '/api/pupil/sign-out', headers: { cookie, origin: BASE } });
    expect(out.statusCode).toBe(204);
    expect(setCookies(out).some((c) => c.startsWith(`${PUPIL.signIn}=;`) && c.includes('Max-Age=0'))).toBe(true);
    expect((await me({ cookie })).statusCode).toBe(401);
  });

  it('comes back to /r with a reason when the provider says no or the state is missing', async () => {
    const cancelled = await pupilSignIn('test', { error: 'access_denied' });
    expect(cancelled.headers.location).toBe('/r?error=cancelled');
    const noState = await app.inject({ url: '/api/pupil/auth/test/callback?code=x&state=y' });
    expect(noState.headers.location).toBe('/r?error=failed');
  });
});

describe('teachers and pupils are kept apart', () => {
  it('refuses a pupil sign-in from someone with a teacher account', async () => {
    const subject = `teacher-${++n}`;
    await accounts.openAccount({ provider: 'test', subject, email: null, displayName: null }, 'T');
    const res = await pupilSignIn('test', { claims: { sub: subject } });
    expect(res.headers.location).toBe('/r?error=teacher_account');
    expect(cookieValue(res, PUPIL.signIn)).toBeNull();
    expect((await pupils.findPupil('test', subject))).toBeNull();
  });

  it('refuses a teacher sign-in from someone known as a pupil, even with a good invite', async () => {
    const subject = `known-pupil-${++n}`;
    await pupilSignIn('test', { claims: { sub: subject } });
    const { code } = await accounts.createInvite({ label: 'Invite' });
    const start = await app.inject({ url: `/api/auth/test/start?invite=${code}` });
    fake.next({ claims: { sub: subject } });
    const back = new URL((await fetch(start.headers.location!, { redirect: 'manual' })).headers.get('location')!);
    const res = await app.inject({ url: back.pathname + back.search, headers: { cookie: `${TEACHER.state}=${cookieValue(start, TEACHER.state)}` } });
    expect(res.headers.location).toBe('/signin?error=pupil_account');
    expect(await accounts.findAccount('test', subject)).toBeNull();
    expect((await accounts.listInvites()).find((i) => i.label === 'Invite')!.status).toBe('open');
  });

  it('refuses a teacher sign-in from someone known as a pupil, even from an open-door domain', async () => {
    const sub = `open-pupil-${++n}`;
    await pupilSignIn('google', { claims: { sub, hd: 'open.example' } });
    const start = await app.inject({ url: '/api/auth/google/start' });
    fakeGoogle.next({ claims: { sub, hd: 'open.example' } });
    const back = new URL((await fetch(start.headers.location!, { redirect: 'manual' })).headers.get('location')!);
    const res = await app.inject({ url: back.pathname + back.search, headers: { cookie: `${TEACHER.state}=${cookieValue(start, TEACHER.state)}` } });
    expect(res.headers.location).toBe('/signin?error=pupil_account');
    expect(await accounts.findAccount('google', sub)).toBeNull();
    // Someone new from that domain still gets in as a teacher: the door is open.
    const other = await app.inject({ url: '/api/auth/google/start' });
    fakeGoogle.next({ claims: { sub: `open-teacher-${++n}`, hd: 'open.example' } });
    const otherBack = new URL((await fetch(other.headers.location!, { redirect: 'manual' })).headers.get('location')!);
    const ok = await app.inject({ url: otherBack.pathname + otherBack.search, headers: { cookie: `${TEACHER.state}=${cookieValue(other, TEACHER.state)}` } });
    expect(ok.headers.location).toBe('/w');
  });

  it('a pupil cookie opens no teacher route, and a teacher cookie no pupil route', async () => {
    const res = await pupilSignIn('test', { claims: { sub: `apart-${++n}` } });
    const pupilId = cookieValue(res, PUPIL.signIn)!;
    // The pupil's id, under either name, is not a teacher's sign-in.
    expect((await app.inject({ url: '/api/account/workspace', headers: { cookie: `${PUPIL.signIn}=${pupilId}` } })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/account/workspace', headers: { cookie: `${TEACHER.signIn}=${pupilId}` } })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/admin/sessions', headers: { cookie: `${TEACHER.signIn}=${pupilId}` } })).statusCode).toBe(401);

    // A teacher's sign-in, under either name, is not a pupil's.
    const { account } = await accounts.openAccount({ provider: 'test', subject: `t-${++n}`, email: null, displayName: null }, 'T');
    const teacherId = (await accounts.startSignIn(account)).id;
    expect((await app.inject({ url: '/api/account/workspace', headers: { cookie: `${TEACHER.signIn}=${teacherId}` } })).statusCode).toBe(200);
    expect((await me({ cookie: `${TEACHER.signIn}=${teacherId}` })).statusCode).toBe(401);
    expect((await me({ cookie: `${PUPIL.signIn}=${teacherId}` })).statusCode).toBe(401);
  });

  it('a teacher who signs in through the teachers’ door is still refused at the pupils’ one', async () => {
    const subject = `door-${++n}`;
    const { code } = await accounts.createInvite({ label: 'Door' });
    const start = await app.inject({ url: `/api/auth/test/start?invite=${code}` });
    fake.next({ claims: { sub: subject } });
    const back = new URL((await fetch(start.headers.location!, { redirect: 'manual' })).headers.get('location')!);
    const res = await app.inject({ url: back.pathname + back.search, headers: { cookie: `${TEACHER.state}=${cookieValue(start, TEACHER.state)}` } });
    expect(res.headers.location).toBe('/w');
    expect((await pupilSignIn('test', { claims: { sub: subject } })).headers.location).toBe('/r?error=teacher_account');
  });
});

describe('PUPILS=off, or unset', () => {
  it('unset stops pupil sign-in: it fails closed', async () => {
    const unset = await buildApp({ ...deps, env: { ...deps.env, PUPILS: undefined } });
    await unset.ready();
    try {
      expect((await unset.inject({ url: '/api/pupil/providers' })).json().code).toBe('pupils_off');
      expect((await unset.inject({ url: '/api/pupil/auth/test/start' })).headers.location).toBe('/r?error=pupils_off');
    } finally {
      await unset.close();
    }
  });

  it('off stops every pupil route at once', async () => {
    const off = await buildApp({ ...deps, env: { ...deps.env, PUPILS: 'off' } });
    await off.ready();
    try {
      const providers = await off.inject({ url: '/api/pupil/providers' });
      expect(providers.statusCode).toBe(403);
      expect(providers.json().code).toBe('pupils_off');
      expect((await off.inject({ url: '/api/pupil/auth/test/start' })).headers.location).toBe('/r?error=pupils_off');
      expect((await off.inject({ url: '/api/pupil/auth/test/callback?code=x' })).headers.location).toBe('/r?error=pupils_off');
      expect((await off.inject({ url: '/api/pupil/me' })).json().code).toBe('pupils_off');
      expect((await off.inject({ method: 'POST', url: '/api/pupil/sign-out', headers: { origin: BASE } })).statusCode).toBe(403);
      // A signed-in pupil is stopped too.
      const res = await pupilSignIn('test', { claims: { sub: `off-${++n}` } });
      expect((await off.inject({ url: '/api/pupil/me', headers: { cookie: pupilCookie(res) } })).statusCode).toBe(403);
    } finally {
      await off.close();
    }
  });
});

describe('research data', () => {
  it('nothing about a pupil is in events, the call log or any table but pupils, and no log line names them', async () => {
    const before = (await t.db.execute('SELECT COUNT(*) AS c FROM events')).rows[0]!.c;
    const sub = `private-subject-${++n}`;
    const res = await pupilSignIn('microsoft', { claims: { sub, tid: TENANT, email: 'cy@school.example' } });
    const id = cookieValue(res, PUPIL.signIn)!;
    await me({ cookie: `${PUPIL.signIn}=${id}` });
    expect((await t.db.execute('SELECT COUNT(*) AS c FROM events')).rows[0]!.c).toBe(before);

    // Every table, every row: the subject is only in `pupils`.
    const tables = (await t.db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.map((r) => String(r.name));
    expect(tables).toContain('gateway_calls');
    const holding: string[] = [];
    for (const name of tables) {
      const rows = (await t.db.execute(`SELECT * FROM "${name}"`)).rows;
      if (JSON.stringify(rows).includes(sub)) holding.push(name);
    }
    expect(holding).toEqual(['pupils']);

    const logged = logs.join('\n');
    expect(logged).not.toContain(sub);
    expect(logged).not.toContain(id);
    expect(logged).not.toContain('cy@school.example');
    // The callback's code and state are dropped from the request log.
    expect(logged).toContain('/api/pupil/auth/microsoft/callback"');
  });
});
