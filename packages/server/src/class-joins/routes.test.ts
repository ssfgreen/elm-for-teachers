/**
 * The teacher's class-code routes (issue #209), and what reaches research data once a pupil has
 * joined: `class_code_set` carries ids only, and nothing about a pupil is in events, the call log
 * or the export.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { AppDeps } from '../deps.js';
import { tempDb, testDeps, testEnv, type TempDb } from '../test-helpers.js';
import { buildBundle } from '../export/bundle.js';
import { createClassService } from '../classes/service.js';
import { createPupilStore } from '../pupils/store.js';
import { createClassJoinStore } from './store.js';
import { classWithCode } from './test-class.js';

let t: TempDb;
let app: FastifyInstance;
let deps: AppDeps;
const logs: string[] = [];

beforeAll(async () => {
  t = await tempDb();
  deps = { ...testDeps(t.db), env: testEnv({ PUPILS: 'on' }) };
  app = await buildApp(deps, { logger: true, logStream: { write: (line) => void logs.push(line) } });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  t.cleanup();
});

type Ctx = Awaited<ReturnType<typeof classWithCode>>;
const auth = (c: Ctx) => ({ authorization: `Bearer ${c.session.participant_token}` });
const url = (c: Ctx, tail: string) => `/api/sessions/${c.session.session_id}/classes/${c.cls.id}/${tail}`;
const setCode = (c: Ctx, action: string) => app.inject({ method: 'POST', url: url(c, 'code'), headers: auth(c), payload: { action, envelope: c.env } });
const readCode = async (c: Ctx) => (await app.inject({ url: url(c, 'code'), headers: auth(c) })).json().code;
const codeEvents = async (sid: string) => (await t.db.execute("SELECT payload FROM events WHERE session_id = ? AND kind = 'class_code_set' ORDER BY seq", [sid])).rows.map((r) => JSON.parse(String(r.payload)));

describe('the teacher makes, renews, closes and reads a class code', () => {
  it('make keeps the code it has, renew replaces it, close removes it; each change is logged with ids only', async () => {
    const c = await classWithCode(deps);
    expect(await readCode(c)).toBe(c.code);
    expect(c.code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect((await setCode(c, 'make')).json().code).toBe(c.code);
    const renewed = (await setCode(c, 'renew')).json().code;
    expect(renewed).not.toBe(c.code);
    expect(await readCode(c)).toBe(renewed);
    expect((await setCode(c, 'close')).json().code).toBeNull();
    expect(await readCode(c)).toBeNull();
    const logged = await codeEvents(c.session.session_id);
    expect(logged).toEqual([
      { class_id: c.cls.id, action: 'make' },
      { class_id: c.cls.id, action: 'renew' },
      { class_id: c.cls.id, action: 'close' },
    ]);
    expect(JSON.stringify(logged)).not.toContain(renewed.replace('-', ''));
  });

  it('make after close gives a new code, and the closed one stays shut', async () => {
    const c = await classWithCode(deps);
    await setCode(c, 'close');
    const made = (await setCode(c, 'make')).json().code;
    expect(made).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(made).not.toBe(c.code);
    expect(await readCode(c)).toBe(made);
    expect((await codeEvents(c.session.session_id)).map((e) => e.action)).toEqual(['make', 'close', 'make']);
  });

  it('will not make a code with pupils off, nor for an archived class or another workspace’s', async () => {
    const off = await classWithCode(deps, { pupils: false });
    const res = await setCode(off, 'renew');
    expect([res.statusCode, res.json().code]).toEqual([403, 'feature_off']);
    expect((await setCode(off, 'close')).statusCode).toBe(200);

    const other = await classWithCode(deps);
    const mine = await classWithCode(deps);
    const theirs = await app.inject({ url: `/api/sessions/${mine.session.session_id}/classes/${other.cls.id}/code`, headers: auth(mine) });
    expect(theirs.statusCode).toBe(404);
  });

  it('lists the class’s members: id, label, provider and the day they joined', async () => {
    const c = await classWithCode(deps);
    const pupils = createPupilStore(t.db);
    const joins = createClassJoinStore(t.db, deps.events);
    for (const sub of ['m-1', 'm-2']) await joins.join((await pupils.signIn({ provider: 'test', subject: `${c.cls.id}-${sub}`, tenant: null })).id, { class_id: c.cls.id, session_id: c.session.session_id });
    const members = (await app.inject({ url: url(c, 'members'), headers: auth(c) })).json().members;
    expect(members.map((m: { label: string; provider: string }) => [m.label, m.provider])).toEqual([
      ['Pupil 1', 'test'],
      ['Pupil 2', 'test'],
    ]);
    expect(Object.keys(members[0]).sort()).toEqual(['id', 'joined_on', 'label', 'provider']);
    expect(members[0].joined_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

let subjects = 0;
/** Pupils signed in and joined to the class, in order: Pupil 1, Pupil 2, ... */
async function joined(c: Ctx, count: number) {
  const pupils = createPupilStore(t.db);
  const joins = createClassJoinStore(t.db, deps.events);
  const out = [];
  for (let i = 0; i < count; i++) {
    const pupil = await pupils.signIn({ provider: 'test', subject: `${c.cls.id}-r${++subjects}`, tenant: null });
    out.push({ pupil, member: await joins.join(pupil.id, { class_id: c.cls.id, session_id: c.session.session_id }) });
  }
  return out;
}
const removeUrl = (c: Ctx, memberId: string) => url(c, `members/${memberId}`);
const removeAs = (c: Ctx, memberId: string, headers: Record<string, string> = auth(c)) => app.inject({ method: 'DELETE', url: removeUrl(c, memberId), headers, payload: { envelope: c.env } });
const labels = async (c: Ctx) => (await app.inject({ url: url(c, 'members'), headers: auth(c) })).json().members.map((m: { label: string }) => m.label);

describe('the teacher removes a pupil (#220)', () => {
  it('204, and the list has the others; 401 with no token, 403 for another workspace’s token, 404 for a member of another class or another workspace’s class', async () => {
    const c = await classWithCode(deps);
    const [one, two] = await joined(c, 2);
    expect((await app.inject({ method: 'DELETE', url: removeUrl(c, one!.member.id), payload: { envelope: c.env } })).statusCode).toBe(401);
    const other = await classWithCode(deps);
    expect((await removeAs(c, one!.member.id, auth(other))).statusCode).toBe(403);
    const [elsewhere] = await joined(other, 1);
    expect((await removeAs(c, elsewhere!.member.id)).statusCode).toBe(404);
    const theirs = await app.inject({ method: 'DELETE', url: `/api/sessions/${c.session.session_id}/classes/${other.cls.id}/members/${elsewhere!.member.id}`, headers: auth(c), payload: { envelope: c.env } });
    expect(theirs.statusCode).toBe(404);

    expect((await removeAs(c, one!.member.id)).statusCode).toBe(204);
    expect(await labels(c)).toEqual(['Pupil 2']);
    expect((await removeAs(c, one!.member.id)).statusCode).toBe(404);
    expect(two!.member.number).toBe(2);
  });

  it('409 test_pupil for the teacher’s test member, who is not in the list', async () => {
    const c = await classWithCode(deps);
    const teacher = await createPupilStore(t.db).signIn({ provider: 'test', subject: `${c.cls.id}-teacher`, tenant: null });
    const test = await createClassJoinStore(t.db, deps.events).join(teacher.id, { class_id: c.cls.id, session_id: c.session.session_id }, 'teacher_test');
    await joined(c, 1);
    expect(await labels(c)).toEqual(['Pupil 1']);
    const res = await removeAs(c, test.id);
    expect([res.statusCode, res.json().code]).toEqual([409, 'test_pupil']);
  });

  it('works for an archived class and with pupils switched off', async () => {
    const off = await classWithCode(deps, { pupils: false });
    const [a] = await joined(off, 1);
    expect((await removeAs(off, a!.member.id)).statusCode).toBe(204);
    const archived = await classWithCode(deps);
    const [b] = await joined(archived, 1);
    await createClassService(t.db, deps.events).archive(archived.session.session_id, archived.cls.id, archived.env);
    expect((await removeAs(archived, b!.member.id)).statusCode).toBe(204);
  });

  it('never gives a number twice: remove Pupil 3 of 3, and the next to join is Pupil 4', async () => {
    const c = await classWithCode(deps);
    const three = await joined(c, 3);
    expect((await removeAs(c, three[2]!.member.id)).statusCode).toBe(204);
    const [next] = await joined(c, 1);
    expect(next!.member.number).toBe(4);
    expect(await labels(c)).toEqual(['Pupil 1', 'Pupil 2', 'Pupil 4']);
  });

  it('logs one class_pupil_remove with the class id only; the export has neither the member, the pupil nor removed_pupils', async () => {
    const c = await classWithCode(deps);
    const [one] = await joined(c, 1);
    expect((await removeAs(c, one!.member.id)).statusCode).toBe(204);
    const logged = (await t.db.execute("SELECT payload FROM events WHERE session_id = ? AND kind = 'class_pupil_remove'", [c.session.session_id])).rows.map((r) => JSON.parse(String(r.payload)));
    expect(logged).toEqual([{ class_id: c.cls.id }]);
    expect(Object.keys(logged[0])).toEqual(['class_id']);
    const anon = String((await t.db.execute('SELECT id FROM removed_pupils WHERE class_id = ?', [c.cls.id])).rows[0]!.id);
    const { files } = await buildBundle(deps, c.session.session_id);
    expect(Object.keys(files).some((f) => f.includes('removed_pupils'))).toBe(false);
    const exported = JSON.stringify(Object.values(files).map((f) => (typeof f === 'string' ? f : Buffer.from(f).toString('latin1'))));
    expect(exported).toContain('class_pupil_remove');
    for (const s of [one!.member.id, one!.pupil.id, anon]) expect(exported).not.toContain(s);
  });
});

describe('joining twice at once', () => {
  it('gives the one membership, not an error', async () => {
    const c = await classWithCode(deps);
    const pupil = await createPupilStore(t.db).signIn({ provider: 'test', subject: `${c.cls.id}-twice`, tenant: null });
    const joins = createClassJoinStore(t.db, deps.events);
    const into = { class_id: c.cls.id, session_id: c.session.session_id };
    const [a, b] = await Promise.all([joins.join(pupil.id, into), joins.join(pupil.id, into)]);
    expect(a.id).toBe(b.id);
    expect(a.number).toBe(1);
  });
});

describe('a class has at most one test member', () => {
  it('refuses a second teacher_test, and the test member takes no pupil number', async () => {
    const c = await classWithCode(deps);
    const pupils = createPupilStore(t.db);
    const joins = createClassJoinStore(t.db, deps.events);
    const into = { class_id: c.cls.id, session_id: c.session.session_id };
    const one = await pupils.signIn({ provider: 'test', subject: `${c.cls.id}-t1`, tenant: null });
    const two = await pupils.signIn({ provider: 'test', subject: `${c.cls.id}-t2`, tenant: null });
    const real = await pupils.signIn({ provider: 'test', subject: `${c.cls.id}-p`, tenant: null });
    expect((await joins.join(one.id, into, 'teacher_test')).number).toBeNull();
    await expect(joins.join(two.id, into, 'teacher_test')).rejects.toThrow();
    expect((await joins.join(real.id, into)).number).toBe(1);
  });
});

describe('research data', () => {
  it('nothing about a joined pupil is in events, the call log or the export, and no log line has the code', async () => {
    const c = await classWithCode(deps);
    const pupils = createPupilStore(t.db);
    const sub = `private-${c.cls.id}`;
    const pupil = await pupils.signIn({ provider: 'test', subject: sub, tenant: 'school.example' });
    const before = (await t.db.execute('SELECT COUNT(*) AS c FROM events WHERE session_id = ?', [c.session.session_id])).rows[0]!.c;
    await createClassJoinStore(t.db, deps.events).join(pupil.id, { class_id: c.cls.id, session_id: c.session.session_id });
    await app.inject({ url: url(c, 'members'), headers: auth(c) });
    expect((await t.db.execute('SELECT COUNT(*) AS c FROM events WHERE session_id = ?', [c.session.session_id])).rows[0]!.c).toBe(before);

    const member = (await t.db.execute('SELECT id FROM class_members WHERE pupil_id = ?', [pupil.id])).rows[0]!.id as string;
    const secrets = [pupil.id, sub, member, 'school.example'];
    const events = JSON.stringify((await t.db.execute('SELECT * FROM events')).rows);
    const calls = JSON.stringify((await t.db.execute('SELECT * FROM gateway_calls')).rows);
    const { files } = await buildBundle(deps, c.session.session_id);
    const exported = JSON.stringify(Object.values(files).map((f) => (typeof f === 'string' ? f : Buffer.from(f).toString('latin1'))));
    for (const s of secrets) {
      expect(events).not.toContain(s);
      expect(calls).not.toContain(s);
      expect(exported).not.toContain(s);
    }
    expect(exported).toContain(c.cls.id);
    expect(logs.join('\n')).not.toContain(c.code.replace('-', ''));
  });
});
