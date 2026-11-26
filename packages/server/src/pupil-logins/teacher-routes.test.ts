/**
 * The teacher's pupil-login routes (issue #223), and what reaches research data: one
 * `pupil_logins_made` a batch with the class id and count only, and no username, password or
 * hash in events, log lines, the call log or the export.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { AppDeps } from '../deps.js';
import { tempDb, testDeps, testEnv, type TempDb } from '../test-helpers.js';
import { buildBundle } from '../export/bundle.js';
import { classWithCode } from '../class-joins/test-class.js';
import { createClassJoinStore } from '../class-joins/store.js';
import { createPupilStore } from '../pupils/store.js';
import { createPupilLoginStore } from './store.js';

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
type Made = { id: string; username: string; password: string };
const auth = (c: Ctx) => ({ authorization: `Bearer ${c.session.participant_token}` });
const url = (c: Ctx, tail = '') => `/api/sessions/${c.session.session_id}/classes/${c.cls.id}/logins${tail}`;
const make = (c: Ctx, count: unknown) => app.inject({ method: 'POST', url: url(c), headers: auth(c), payload: { count, envelope: c.env } });
const list = async (c: Ctx) => (await app.inject({ url: url(c), headers: auth(c) })).json().logins;
const hashOf = async (id: string) => String((await t.db.execute('SELECT password_hash FROM pupil_logins WHERE id = ?', [id])).rows[0]!.password_hash);
const madeEvents = async (sid: string) => (await t.db.execute("SELECT payload FROM events WHERE session_id = ? AND kind = 'pupil_logins_made' ORDER BY seq", [sid])).rows.map((r) => JSON.parse(String(r.payload)));

describe('making logins', () => {
  it('makes 1 and 40, each with a username and password, not cached, logged once a batch with ids and count only', async () => {
    const c = await classWithCode(deps);
    const one = await make(c, 1);
    expect(one.statusCode).toBe(200);
    expect(one.headers['cache-control']).toBe('no-store');
    const forty = await make(c, 40);
    const all: Made[] = [...one.json().logins, ...forty.json().logins];
    expect(all).toHaveLength(41);
    for (const l of all) {
      expect(Object.keys(l).sort()).toEqual(['id', 'password', 'username']);
      expect(l.username).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
      expect(l.password).toMatch(/^[a-z]+-[a-z]+-\d{3}$/);
    }
    expect(new Set(all.map((l) => l.username)).size).toBe(41);
    const logged = await madeEvents(c.session.session_id);
    expect(logged).toEqual([
      { class_id: c.cls.id, count: 1 },
      { class_id: c.cls.id, count: 40 },
    ]);
  });

  it('refuses 0, 41 and a count that is not a whole number, logging nothing', async () => {
    const c = await classWithCode(deps);
    for (const count of [0, 41, 2.5, '3']) expect((await make(c, count)).statusCode).toBe(400);
    expect(await madeEvents(c.session.session_id)).toEqual([]);
  });

  it('refuses with pupils off, for an archived class and for another workspace’s class', async () => {
    const off = await classWithCode(deps, { pupils: false });
    const res = await make(off, 1);
    expect([res.statusCode, res.json().code]).toEqual([403, 'feature_off']);

    const archived = await classWithCode(deps);
    await t.db.execute('UPDATE classes SET archived_at = ? WHERE id = ?', [new Date().toISOString(), archived.cls.id]);
    const a = await make(archived, 1);
    expect([a.statusCode, a.json().code]).toEqual([409, 'class_archived']);

    const mine = await classWithCode(deps);
    const other = await classWithCode(deps);
    const theirs = await app.inject({ method: 'POST', url: `/api/sessions/${mine.session.session_id}/classes/${other.cls.id}/logins`, headers: auth(mine), payload: { count: 1, envelope: mine.env } });
    expect(theirs.statusCode).toBe(404);
    expect((await app.inject({ url: `/api/sessions/${mine.session.session_id}/classes/${other.cls.id}/logins`, headers: auth(mine) })).statusCode).toBe(404);
  });

  it('refuses on a server with pupils off', async () => {
    const t2 = await tempDb();
    try {
      const d = { ...testDeps(t2.db), env: testEnv({ PUPILS: 'off' }) };
      const a = await buildApp(d);
      const c = await classWithCode(d);
      const res = await a.inject({ method: 'POST', url: url(c), headers: auth(c), payload: { count: 1, envelope: c.env } });
      expect([res.statusCode, res.json().code]).toEqual([403, 'pupils_off']);
      await a.close();
    } finally {
      t2.cleanup();
    }
  });

  it('gives usernames unique across two classes', async () => {
    const a = await classWithCode(deps);
    const b = await classWithCode(deps);
    const names = [...(await make(a, 40)).json().logins, ...(await make(b, 40)).json().logins].map((l: Made) => l.username);
    expect(new Set(names).size).toBe(80);
  });
});

describe('listing and deleting', () => {
  it('lists id, username, used, label and locked, never a password or hash; "Pupil N" once used', async () => {
    const c = await classWithCode(deps);
    const made: Made[] = (await make(c, 2)).json().logins;
    const pupil = await createPupilStore(t.db).signIn({ provider: 'test', subject: `used-${c.cls.id}`, tenant: null });
    await createPupilLoginStore(t.db, deps.events).signedIn(made[0]!.id, pupil.id, await hashOf(made[0]!.id));
    await createClassJoinStore(t.db, deps.events).join(pupil.id, { class_id: c.cls.id, session_id: c.session.session_id });
    const listed = await list(c);
    expect(listed).toEqual([
      { id: made[0]!.id, username: made[0]!.username, used: true, label: 'Pupil 1', locked: false },
      { id: made[1]!.id, username: made[1]!.username, used: false, label: null, locked: false },
    ]);
    const hash = String((await t.db.execute('SELECT password_hash FROM pupil_logins WHERE id = ?', [made[0]!.id])).rows[0]!.password_hash);
    for (const s of [made[0]!.password, made[1]!.password, hash]) expect(JSON.stringify(listed)).not.toContain(s);
  });

  it('deletes a login never used, refuses one used (409 login_used) and one of another class (404)', async () => {
    const c = await classWithCode(deps);
    const other = await classWithCode(deps);
    const made: Made[] = (await make(c, 2)).json().logins;
    const pupil = await createPupilStore(t.db).signIn({ provider: 'test', subject: `del-${c.cls.id}`, tenant: null });
    await createPupilLoginStore(t.db, deps.events).signedIn(made[0]!.id, pupil.id, await hashOf(made[0]!.id));
    const del = (cx: Ctx, id: string) => app.inject({ method: 'DELETE', url: url(cx, `/${id}`), headers: auth(cx) });
    const used = await del(c, made[0]!.id);
    expect([used.statusCode, used.json().code]).toEqual([409, 'login_used']);
    expect((await del(other, made[1]!.id)).statusCode).toBe(404);
    expect((await del(c, made[1]!.id)).json()).toEqual({ ok: true });
    expect((await list(c)).map((l: { id: string }) => l.id)).toEqual([made[0]!.id]);
  });
});

describe('research data', () => {
  it('no username, password or hash in any event, log line, the call log or the export', async () => {
    const c = await classWithCode(deps);
    const made: Made[] = (await make(c, 3)).json().logins;
    await list(c);
    const hashes = (await t.db.execute('SELECT password_hash FROM pupil_logins WHERE class_id = ?', [c.cls.id])).rows.map((r) => String(r.password_hash));
    const secrets = [...made.flatMap((l) => [l.username, l.password]), ...hashes];
    const events = JSON.stringify((await t.db.execute('SELECT * FROM events')).rows);
    const calls = JSON.stringify((await t.db.execute('SELECT * FROM gateway_calls')).rows);
    const { files } = await buildBundle(deps, c.session.session_id);
    const exported = JSON.stringify(Object.values(files).map((f) => (typeof f === 'string' ? f : Buffer.from(f).toString('latin1'))));
    const logged = logs.join('\n');
    for (const s of secrets) {
      expect(events).not.toContain(s);
      expect(calls).not.toContain(s);
      expect(exported).not.toContain(s);
      expect(logged).not.toContain(s);
    }
    expect(exported).toContain(c.cls.id);
  });
});
