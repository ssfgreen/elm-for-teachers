/**
 * "View as pupil" (issue #215): one test pupil a class, its cookie, its refusals, what /me and
 * /join say to it, and that its highlights and asks stay out of research data while their cost
 * counts and the per-pupil budget holds across clicks.
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../app.js';
import { providersFromEnv } from '../accounts/providers.js';
import { spendGbp } from '../budget/store.js';
import { createClassService } from '../classes/service.js';
import { createReaderSettingsStore } from '../classes/reader-settings.js';
import type { AppDeps } from '../deps.js';
import { buildBundle } from '../export/bundle.js';
import { createPupilStore } from '../pupils/store.js';
import { BASE, pupilIn, readingWorld, RecordingProvider } from '../reader-asks/test-reading.js';
import { tempDb, testDeps, testEnv, type TempDb } from '../test-helpers.js';
import { usageReport } from '../usage/routes.js';
import { memberOf } from './member.js';
import { createClassJoinStore } from './store.js';
import { classWithCode } from './test-class.js';

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
const lines: string[] = [];

beforeAll(async () => {
  t = await tempDb();
  deps = { ...testDeps(t.db, new RecordingProvider()), env: testEnv({ AUTH_BASE_URL: BASE, PUPILS: 'on' }) };
  app = await buildApp(deps, { logger: true, logStream: { write: (l) => void lines.push(l) } });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  t.cleanup();
});

type Ctx = Awaited<ReturnType<typeof classWithCode>>;
const auth = (c: Ctx) => ({ authorization: `Bearer ${c.session.participant_token}` });
const view = (c: Ctx, opts: { cookie?: string; on?: FastifyInstance; classId?: string; headers?: Record<string, string> } = {}) =>
  (opts.on ?? app).inject({
    method: 'POST',
    url: `/api/sessions/${c.session.session_id}/classes/${opts.classId ?? c.cls.id}/view-as-pupil`,
    headers: { ...(opts.headers ?? auth(c)), ...(opts.cookie ? { cookie: opts.cookie } : {}) },
    payload: { envelope: c.env },
  });
const pupilCookie = (res: LightMyRequestResponse): string => {
  const set = [res.headers['set-cookie'] ?? []].flat().map(String).find((x) => x.startsWith('edw_pupil='));
  expect(set).toBeDefined();
  return set!.split(';')[0]!;
};
const rows = async (sql: string, args: unknown[]) => (await t.db.execute(sql, args as never)).rows;
const testMembers = (classId: string) => rows("SELECT * FROM class_members WHERE class_id = ? AND role = 'teacher_test'", [classId]);
const testPupils = (classId: string) => rows("SELECT * FROM pupils WHERE provider = 'teacher_test' AND subject = ?", [classId]);
const viewEvents = async (sid: string) => (await rows("SELECT payload FROM events WHERE session_id = ? AND kind = 'class_view_as_pupil' ORDER BY seq", [sid])).map((r) => JSON.parse(String(r.payload)));
const me = (cookie: string) => app.inject({ url: '/api/pupil/me', headers: { cookie } });
const outcome = (r: LightMyRequestResponse) => [r.statusCode, r.json().code];

describe('the click', () => {
  it('makes one test pupil and member, with no number, and sets the pupil cookie on the pupil path', async () => {
    const c = await classWithCode(deps);
    const res = await view(c);
    expect(res.statusCode).toBe(204);
    const set = [res.headers['set-cookie']].flat().map(String).find((x) => x.startsWith('edw_pupil='))!;
    expect(set).toContain('Path=/api/pupil');
    expect(set).toContain('HttpOnly');
    const member = await testMembers(c.cls.id);
    expect(member).toHaveLength(1);
    expect(member[0]!.number).toBeNull();
    expect(await testPupils(c.cls.id)).toHaveLength(1);
    expect((await me(pupilCookie(res))).statusCode).toBe(200);
  });

  it('a second click, and two at once, leave one pupil and one member; the first real pupil is Pupil 1', async () => {
    const c = await classWithCode(deps);
    await view(c);
    await view(c);
    const both = await Promise.all([view(c), view(c)]);
    expect(both.map((r) => r.statusCode)).toEqual([204, 204]);
    expect(await testMembers(c.cls.id)).toHaveLength(1);
    expect(await testPupils(c.cls.id)).toHaveLength(1);
    const real = await pupilIn(deps, c);
    expect(real.member.number).toBe(1);
  });

  it('ends the pupil sign-in this browser already had', async () => {
    const c = await classWithCode(deps);
    const real = await pupilIn(deps, c);
    expect((await me(real.cookie)).statusCode).toBe(200);
    const res = await view(c, { cookie: real.cookie });
    expect(res.statusCode).toBe(204);
    expect((await me(real.cookie)).statusCode).toBe(401);
    expect((await me(pupilCookie(res))).json().pupil.test).toBe(true);
  });

  it('logs class_view_as_pupil once a click, the class id only; no pupil or member id in events, the call log or the export', async () => {
    const c = await classWithCode(deps);
    await view(c);
    await view(c);
    expect(await viewEvents(c.session.session_id)).toEqual([{ class_id: c.cls.id }, { class_id: c.cls.id }]);
    const member = (await testMembers(c.cls.id))[0]!;
    const all = JSON.stringify([
      await rows('SELECT * FROM events WHERE session_id = ?', [c.session.session_id]),
      await rows('SELECT * FROM gateway_calls WHERE session_id = ?', [c.session.session_id]),
      (await buildBundle(deps, c.session.session_id)).files,
    ]);
    for (const id of [String(member.id), String(member.pupil_id)]) expect(all).not.toContain(id);
    // Nor in the server's log lines.
    const log = lines.join('');
    expect(log).toContain('view-as-pupil');
    for (const id of [String(member.id), String(member.pupil_id)]) expect(log).not.toContain(id);
  });
});

describe('refusals', () => {
  it('401 without a token, 403 with another workspace’s, 404 for another workspace’s class, 409 archived', async () => {
    const c = await classWithCode(deps);
    const other = await classWithCode(deps);
    expect((await view(c, { headers: {} })).statusCode).toBe(401);
    expect((await view(c, { headers: auth(other) })).statusCode).toBe(403);
    expect((await view(c, { classId: other.cls.id })).statusCode).toBe(404);
    await createClassService(t.db, deps.events).archive(c.session.session_id, c.cls.id, c.env);
    expect(outcome(await view(c))).toEqual([409, 'class_archived']);
    expect(await testMembers(c.cls.id)).toHaveLength(0);
    expect(await testMembers(other.cls.id)).toHaveLength(0);
  });

  it('403 pupils_off with PUPILS off, feature_off with the workspace’s switch off', async () => {
    const off = await classWithCode(deps, { pupils: false });
    expect(outcome(await view(off))).toEqual([403, 'feature_off']);
    const c = await classWithCode(deps);
    const shut = await buildApp({ ...deps, env: { ...deps.env, PUPILS: 'off' } });
    try {
      expect(outcome(await view(c, { on: shut }))).toEqual([403, 'pupils_off']);
    } finally {
      await shut.close();
    }
    expect(await testMembers(off.cls.id)).toHaveLength(0);
    expect(await testMembers(c.cls.id)).toHaveLength(0);
    expect(await viewEvents(c.session.session_id)).toEqual([]);
  });

  it('nobody signs in as teacher_test from /r: no such provider, and providersFromEnv never makes one', async () => {
    expect((await app.inject({ url: '/api/pupil/auth/teacher_test/start' })).statusCode).toBe(404);
    const env = testEnv({ AUTH_SECRET: 's'.repeat(40), AUTH_BASE_URL: BASE, GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 'g', MICROSOFT_CLIENT_ID: 'm', MICROSOFT_CLIENT_SECRET: 'm', AUTH_TEST_ISSUER: 'http://localhost:1', NODE_ENV: 'test' });
    expect(providersFromEnv(env).map((p) => p.id)).not.toContain('teacher_test');
  });
});

describe('what the test pupil sees', () => {
  it('/me: "Test pupil" in its class and test true; a real pupil test false', async () => {
    const c = await classWithCode(deps, { name: '8B' });
    const cookie = pupilCookie(await view(c));
    expect((await me(cookie)).json()).toEqual({ pupil: { provider: 'teacher_test', test: true }, classes: [{ class_id: c.cls.id, class_name: '8B', label: 'Test pupil' }] });
    const real = await pupilIn(deps, c);
    expect((await me(real.cookie)).json().pupil).toEqual({ provider: 'test', test: false });
  });

  it('memberOf accepts the test pupil for its own class only', async () => {
    const c = await classWithCode(deps);
    const other = await classWithCode(deps);
    await view(c);
    const pupil = (await createPupilStore(t.db).findPupil('teacher_test', c.cls.id))!;
    const mdeps = { joins: createClassJoinStore(t.db, deps.events), sessions: deps.sessions, env: deps.env };
    expect((await memberOf(mdeps, pupil.id, c.cls.id)).ok).toBe(true);
    expect(await memberOf(mdeps, pupil.id, other.cls.id)).toEqual({ ok: false, reason: 'not_member' });
  });

  it('/join with another class’s code: 403 test_pupil, and no member', async () => {
    const c = await classWithCode(deps);
    const other = await classWithCode(deps);
    const cookie = pupilCookie(await view(c));
    const res = await app.inject({ method: 'POST', url: '/api/pupil/join', headers: { cookie, origin: BASE }, payload: { code: other.code } });
    expect(outcome(res)).toEqual([403, 'test_pupil']);
    expect(await rows('SELECT * FROM class_members WHERE class_id = ?', [other.cls.id])).toHaveLength(0);
  });

  it('the teacher’s member list leaves it out, and removing it is still 409 test_pupil', async () => {
    const c = await classWithCode(deps);
    await view(c);
    const base = `/api/sessions/${c.session.session_id}/classes/${c.cls.id}/members`;
    expect((await app.inject({ url: base, headers: auth(c) })).json().members).toEqual([]);
    const member = (await testMembers(c.cls.id))[0]!;
    const del = await app.inject({ method: 'DELETE', url: `${base}/${String(member.id)}`, headers: auth(c), payload: { envelope: c.env } });
    expect(outcome(del)).toEqual([409, 'test_pupil']);
  });
});

describe('its highlights and asks (answer 106)', () => {
  const exported = async (sid: string) => {
    const { files } = await buildBundle(deps, sid);
    return Object.fromEntries(Object.entries(files).map(([name, body]) => [name, createHash('sha256').update(body).digest('hex')]));
  };

  it('land in their own tables, none in events, gateway_calls or the export; the cost counts in spend and Usage', async () => {
    const w = await readingWorld(deps);
    const c = { ...w } as Ctx;
    const cookie = pupilCookie(await view(c));
    const member = (await testMembers(w.cls.id))[0]!;
    const listed = (await app.inject({ url: '/api/pupil/readings', headers: { cookie } })).json().readings;
    expect(listed.map((r: { id: string }) => r.id)).toEqual([w.reading.id]);
    const opened = await app.inject({ url: `/api/pupil/readings/${w.reading.id}`, headers: { cookie } });
    expect(opened.statusCode).toBe(200);
    const block = (opened.json().reading.blocks as { id: string; type: string }[]).find((b) => b.type === 'paragraph')!;

    const events = (await rows('SELECT COUNT(*) AS n FROM events WHERE session_id = ?', [w.sid]))[0]!.n;
    const before = await exported(w.sid);
    const hl = await app.inject({ method: 'POST', url: `/api/pupil/readings/${w.reading.id}/highlights`, headers: { cookie, origin: BASE }, payload: { block_id: block.id, start: 0, end: 3, category: null } });
    expect(hl.statusCode).toBe(201);
    const ask = await app.inject({ method: 'POST', url: `/api/pupil/readings/${w.reading.id}/asks`, headers: { cookie, origin: BASE }, payload: { prompt_id: w.explain.id, highlighted_text: 'roads were straight' } });
    expect(ask.statusCode).toBe(200);

    expect(await rows('SELECT id FROM reader_highlights WHERE member_id = ?', [member.id])).toHaveLength(1);
    expect(await rows('SELECT id FROM reader_asks WHERE member_id = ?', [member.id])).toHaveLength(1);
    expect((await rows('SELECT COUNT(*) AS n FROM events WHERE session_id = ?', [w.sid]))[0]!.n).toBe(events);
    expect(await rows('SELECT * FROM gateway_calls WHERE session_id = ?', [w.sid])).toHaveLength(0);
    expect(await exported(w.sid)).toEqual(before);
    expect(await spendGbp(t.db, w.sid)).toBeGreaterThan(0);
    expect((await usageReport(deps, w.sid, 'all')).spent_gbp).toBeCloseTo(await spendGbp(t.db, w.sid), 12);
  });

  it('with the pupil budget at £0 the ask is refused pupil_budget_spent, and still after a second click', async () => {
    const w = await readingWorld(deps);
    const c = { ...w } as Ctx;
    await createReaderSettingsStore(t.db, deps.events, () => deps.loaded.config.reader).set(w.sid, w.cls.id, { pupil_budget_gbp: 0 }, w.env);
    const askAs = (cookie: string) =>
      app.inject({ method: 'POST', url: `/api/pupil/readings/${w.reading.id}/asks`, headers: { cookie, origin: BASE }, payload: { prompt_id: w.explain.id, highlighted_text: 'roads were straight' } });
    expect(outcome(await askAs(pupilCookie(await view(c))))).toEqual([429, 'pupil_budget_spent']);
    expect(outcome(await askAs(pupilCookie(await view(c))))).toEqual([429, 'pupil_budget_spent']);
  });
});
