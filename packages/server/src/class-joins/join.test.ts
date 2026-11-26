/**
 * Pupils join a class with its code on /r (issue #209), against a fake issuer: the numbers, the
 * refusals, the wrong-code counter shared with the access code, the sealed state, and what the
 * teacher's routes do.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../app.js';
import type { AppDeps } from '../deps.js';
import { tempDb, testDeps, testEnv, type TempDb } from '../test-helpers.js';
import { startFakeIssuer, type FakeIssuer } from '../accounts/fake-issuer.js';
import { createAccountStore } from '../accounts/store.js';
import { createClassService } from '../classes/service.js';
import { WRONG_LIMIT } from '../http/wrong-codes.js';
import { pupilCookieNames } from '../pupils/cookies.js';
import { classWithCode } from './test-class.js';

const BASE = 'https://edw.example';
const SECRET = 's'.repeat(40);
const PUPIL = pupilCookieNames(BASE);

let t: TempDb;
let app: FastifyInstance;
let deps: AppDeps;
let fake: FakeIssuer;
let n = 0;
let ip = 0;

beforeAll(async () => {
  fake = await startFakeIssuer();
  t = await tempDb();
  const base = testDeps(t.db);
  const providers = [{ kind: 'oidc' as const, id: 'test', label: 'Test', family: 'generic' as const, issuer: fake.url, clientId: fake.clientId, clientSecret: fake.clientSecret, allowHttp: true }];
  deps = { ...base, env: testEnv({ AUTH_SECRET: SECRET, AUTH_BASE_URL: BASE, PUPILS: 'on' }), signIn: { providers } };
  app = await buildApp(deps);
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await fake.close();
  t.cleanup();
});

const setCookie = (res: LightMyRequestResponse, name: string): string | null =>
  [res.headers['set-cookie'] ?? []].flat().map(String).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1).split(';')[0] || null;

/** Each test types codes from its own address, so the counter of one does not stop another. */
const address = () => `10.0.0.${++ip}`;

/** The start step with a code: the response (a 302 to the provider, or back to /r). */
const start = (code: string | null, from = address()) => app.inject({ url: `/api/pupil/auth/test/start${code === null ? '' : `?code=${encodeURIComponent(code)}`}`, remoteAddress: from });

/** Back from the provider as `sub`, with the state cookie `state`. */
async function finish(startRes: LightMyRequestResponse, sub: string, state = setCookie(startRes, PUPIL.state)!) {
  fake.next({ claims: { sub } });
  const back = new URL((await fetch(startRes.headers.location!, { redirect: 'manual' })).headers.get('location')!);
  return app.inject({ url: back.pathname + back.search, headers: { cookie: `${PUPIL.state}=${state}` } });
}

async function signIn(code: string | null, sub = `p-${++n}`) {
  const s = await start(code);
  expect(s.headers.location).toMatch(/^http/);
  return finish(s, sub);
}

const me = async (res: LightMyRequestResponse) => (await app.inject({ url: '/api/pupil/me', headers: { cookie: `${PUPIL.signIn}=${setCookie(res, PUPIL.signIn)}` } })).json();

describe('joining with a class code', () => {
  it('a new pupil with a live code joins as Pupil 1, the next as Pupil 2', async () => {
    const { code, cls } = await classWithCode(deps, { name: '8B' });
    const first = await signIn(code.toLowerCase().replace('-', ' '));
    expect(first.headers.location).toBe('/r');
    expect((await me(first)).classes).toEqual([{ class_id: cls.id, class_name: '8B', label: 'Pupil 1' }]);
    const second = await signIn(code);
    expect((await me(second)).classes).toEqual([{ class_id: cls.id, class_name: '8B', label: 'Pupil 2' }]);
  });

  it('a known pupil signs in again without a code and is still in the class; someone new without one is refused', async () => {
    const { code } = await classWithCode(deps);
    const sub = `again-${++n}`;
    await signIn(code, sub);
    const again = await signIn(null, sub);
    expect(again.headers.location).toBe('/r');
    expect((await me(again)).classes.map((c: { label: string }) => c.label)).toEqual(['Pupil 1']);
    const stranger = await signIn(null);
    expect(stranger.headers.location).toBe('/r?error=code_needed');
    expect(setCookie(stranger, PUPIL.signIn)).toBeNull();
  });

  it('refuses a wrong, renewed-away or closed code before the provider, and counts each', async () => {
    const a = await classWithCode(deps);
    const b = await classWithCode(deps);
    const renewed = (await app.inject({ method: 'POST', url: `/api/sessions/${a.session.session_id}/classes/${a.cls.id}/code`, headers: { authorization: `Bearer ${a.session.participant_token}` }, payload: { action: 'renew', envelope: a.env } })).json().code;
    expect(renewed).not.toBe(a.code);
    await app.inject({ method: 'POST', url: `/api/sessions/${b.session.session_id}/classes/${b.cls.id}/code`, headers: { authorization: `Bearer ${b.session.participant_token}` }, payload: { action: 'close', envelope: b.env } });
    const from = address();
    for (const wrong of ['ZZZZ-ZZZZ', a.code, b.code]) expect((await start(wrong, from)).headers.location).toBe('/r?error=code_unknown');
    // A code given twice is not one.
    const twice = await app.inject({ url: `/api/pupil/auth/test/start?code=${renewed}&code=${renewed}`, remoteAddress: from });
    expect(twice.headers.location).toBe('/r?error=code_unknown');
    for (let i = 4; i < WRONG_LIMIT; i++) await start('ZZZZ-ZZZZ', from);
    // The counter is the access code's too: that door is shut for this address now.
    expect((await start(renewed, from)).headers.location).toBe('/r?error=too_many_codes');
    const access = await app.inject({ method: 'POST', url: '/api/access', payload: { code: 'AAAA-AAAA-AAAA' }, remoteAddress: from });
    expect(access.statusCode).toBe(429);
    // Another address is not held back.
    expect((await start(renewed)).headers.location).toMatch(/^http/);
  });

  it('refuses an archived class, a workspace with pupils off, and a server with PUPILS off', async () => {
    const archived = await classWithCode(deps);
    await createClassService(deps.db, deps.events).archive(archived.session.session_id, archived.cls.id, archived.env);
    expect((await start(archived.code)).headers.location).toBe('/r?error=class_archived');

    const off = await classWithCode(deps, { pupils: false });
    expect((await start(off.code)).headers.location).toBe('/r?error=feature_off');

    const on = await classWithCode(deps);
    const shut = await buildApp({ ...deps, env: { ...deps.env, PUPILS: 'off' } });
    try {
      expect((await shut.inject({ url: `/api/pupil/auth/test/start?code=${on.code}` })).headers.location).toBe('/r?error=pupils_off');
    } finally {
      await shut.close();
    }
  });

  it('checks the code again on the way back: closed while the pupil was at the provider', async () => {
    const c = await classWithCode(deps);
    const s = await start(c.code);
    await app.inject({ method: 'POST', url: `/api/sessions/${c.session.session_id}/classes/${c.cls.id}/code`, headers: { authorization: `Bearer ${c.session.participant_token}` }, payload: { action: 'close', envelope: c.env } });
    const sub = `late-${++n}`;
    const back = await finish(s, sub);
    expect(back.headers.location).toBe('/r?error=code_unknown');
    expect((await t.db.execute('SELECT COUNT(*) AS c FROM pupils WHERE subject = ?', [sub])).rows[0]!.c).toBe(0);
  });

  it('signs a known pupil in, without joining, when their code was renewed while they were at the provider', async () => {
    const first = await classWithCode(deps);
    const sub = `known-late-${++n}`;
    await signIn(first.code, sub);
    const next = await classWithCode(deps);
    const s = await start(next.code);
    await app.inject({ method: 'POST', url: `/api/sessions/${next.session.session_id}/classes/${next.cls.id}/code`, headers: { authorization: `Bearer ${next.session.participant_token}` }, payload: { action: 'renew', envelope: next.env } });
    const back = await finish(s, sub);
    expect(back.headers.location).toBe('/r');
    expect((await me(back)).classes.map((c: { class_id: string }) => c.class_id)).toEqual([first.cls.id]);
  });

  it("still refuses a teacher's own account at /r, code or not", async () => {
    const { code } = await classWithCode(deps);
    const subject = `teacher-${++n}`;
    await createAccountStore(deps.db, deps.sessions).openAccount({ provider: 'test', subject, email: null, displayName: null }, 'T');
    expect((await signIn(code, subject)).headers.location).toBe('/r?error=teacher_account');
    expect((await t.db.execute("SELECT COUNT(*) AS c FROM pupils WHERE subject = ?", [subject])).rows[0]!.c).toBe(0);
  });

  it('the sealed state cannot be changed to name another class', async () => {
    const mine = await classWithCode(deps);
    const other = await classWithCode(deps);
    const s = await start(mine.code);
    const [body, sig] = setCookie(s, PUPIL.state)!.split('.');
    const state = JSON.parse(Buffer.from(body!, 'base64url').toString('utf8'));
    expect(state.class_code).toBe(mine.code.replace('-', ''));
    const forged = Buffer.from(JSON.stringify({ ...state, class_code: other.code.replace('-', '') })).toString('base64url');
    const sub = `forger-${++n}`;
    expect((await finish(s, sub, `${forged}.${sig}`)).headers.location).toBe('/r?error=failed');
    expect((await t.db.execute('SELECT COUNT(*) AS c FROM class_members WHERE class_id = ?', [other.cls.id])).rows[0]!.c).toBe(0);
  });

  it('a signed-in pupil with no class types a code on /r', async () => {
    const first = await classWithCode(deps);
    const sub = `later-${++n}`;
    const res = await signIn(first.code, sub);
    // Their only class is archived: they can join another with its code.
    await createClassService(deps.db, deps.events).archive(first.session.session_id, first.cls.id, first.env);
    expect((await me(res)).classes).toEqual([]);
    const next = await classWithCode(deps, { name: '9C' });
    const cookie = `${PUPIL.signIn}=${setCookie(res, PUPIL.signIn)}`;
    const from = address();
    expect((await app.inject({ method: 'POST', url: '/api/pupil/join', headers: { cookie, origin: 'https://other.example' }, payload: { code: next.code }, remoteAddress: from })).statusCode).toBe(403);
    const wrong = await app.inject({ method: 'POST', url: '/api/pupil/join', headers: { cookie, origin: BASE }, payload: { code: 'ZZZZ-ZZZZ' }, remoteAddress: from });
    expect([wrong.statusCode, wrong.json().code]).toEqual([404, 'code_unknown']);
    const ok = await app.inject({ method: 'POST', url: '/api/pupil/join', headers: { cookie, origin: BASE }, payload: { code: next.code }, remoteAddress: from });
    expect(ok.json()).toEqual({ class: { class_id: next.cls.id, class_name: '9C', label: 'Pupil 1' } });
    expect((await me(res)).classes).toEqual([{ class_id: next.cls.id, class_name: '9C', label: 'Pupil 1' }]);
  });
});
