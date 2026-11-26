/**
 * A new password for a pupil login (issue #246): the old one stops at once, even for a sign-in
 * already checking it; the login unlocks; its pupil is signed out everywhere; one
 * `pupil_password_reset` with the class id only, and no username, password or hash anywhere.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../app.js';
import type { AppDeps } from '../deps.js';
import { tempDb, testDeps, testEnv, type TempDb } from '../test-helpers.js';
import { buildBundle } from '../export/bundle.js';
import { classWithCode } from '../class-joins/test-class.js';
import { pupilCookieNames } from '../pupils/cookies.js';
import { verifyPassword } from './hash.js';
import { createPupilLoginStore, MAX_WRONG_TRIES } from './store.js';

vi.mock('./hash.js', async (original) => {
  const real = await original<typeof import('./hash.js')>();
  return { ...real, verifyPassword: vi.fn(real.verifyPassword) };
});

const BASE = 'https://edw.example';
const PUPIL = pupilCookieNames(BASE).signIn;

let t: TempDb;
let app: FastifyInstance;
let deps: AppDeps;
const logs: string[] = [];
let nextIp = 1;
/** Runs, when set, just after a sign-in's `signedIn` succeeds: before the route starts its sign-in. */
let afterSignedIn: (() => Promise<unknown>) | null = null;

beforeAll(async () => {
  t = await tempDb();
  const base = testDeps(t.db);
  const real = createPupilLoginStore(t.db, base.events);
  const pupilLogins = {
    ...real,
    async signedIn(loginId: string, pupilId: string, hash: string) {
      const ok = await real.signedIn(loginId, pupilId, hash);
      const then = afterSignedIn;
      afterSignedIn = null;
      if (then) await then();
      return ok;
    },
  };
  deps = { ...base, pupilLogins, env: testEnv({ AUTH_SECRET: 's'.repeat(40), AUTH_BASE_URL: BASE, PUPILS: 'on' }) };
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
const makeLogin = async (c: Ctx): Promise<Made> => ((await createPupilLoginStore(t.db, deps.events).make(c.session.session_id, c.cls.id, 1, c.env)) as Made[])[0]!;
const renew = (c: Ctx, loginId: string, classId = c.cls.id) =>
  app.inject({ method: 'POST', url: `/api/sessions/${c.session.session_id}/classes/${classId}/logins/${loginId}/password`, headers: auth(c), payload: { envelope: c.env } });
const login = (body: { username: string; password: string; code?: string }) =>
  app.inject({ method: 'POST', url: '/api/pupil/login', remoteAddress: `10.9.0.${nextIp++}`, headers: { origin: BASE }, payload: body });
const cookieOf = (res: LightMyRequestResponse): string => {
  const set = [res.headers['set-cookie'] ?? []].flat().map(String).find((x) => x.startsWith(`${PUPIL}=`));
  return set!.slice(PUPIL.length + 1).split(';')[0]!;
};
const me = (cookie: string) => app.inject({ url: '/api/pupil/me', headers: { cookie: `${PUPIL}=${cookie}` } });
const row = async (id: string) => (await t.db.execute('SELECT * FROM pupil_logins WHERE id = ?', [id])).rows[0]!;
const resets = async (sid: string) =>
  (await t.db.execute("SELECT payload FROM events WHERE session_id = ? AND kind = 'pupil_password_reset' ORDER BY seq", [sid])).rows.map((r) => JSON.parse(String(r.payload)));
const signInsOf = async (pupilId: unknown) => Number((await t.db.execute('SELECT COUNT(*) AS c FROM pupil_sign_ins WHERE pupil_id = ?', [String(pupilId)])).rows[0]!.c);

/** A login the pupil has signed in with once, and that sign-in's cookie. */
async function usedLogin(c: Ctx) {
  const l = await makeLogin(c);
  const first = await login({ username: l.username, password: l.password, code: c.code });
  expect(first.statusCode).toBe(204);
  return { l, cookie: cookieOf(first), pupilId: (await row(l.id)).pupil_id };
}

describe('a new password', () => {
  it('replaces the old one at once and signs the pupil out everywhere; not cached; logged once with the class id', async () => {
    const c = await classWithCode(deps);
    const { l, cookie, pupilId } = await usedLogin(c);
    const second = cookieOf(await login({ username: l.username, password: l.password }));
    expect(await signInsOf(pupilId)).toBe(2);

    const res = await renew(c, l.id);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const made: Made = res.json().login;
    expect(Object.keys(made).sort()).toEqual(['id', 'password', 'username']);
    expect([made.id, made.username]).toEqual([l.id, l.username]);
    expect(made.password).toMatch(/^[a-z]+-[a-z]+-\d{3}$/);
    expect(made.password).not.toBe(l.password);

    expect((await me(cookie)).statusCode).toBe(401);
    expect((await me(second)).statusCode).toBe(401);
    expect(await signInsOf(pupilId)).toBe(0);
    const old = await login({ username: l.username, password: l.password });
    expect([old.statusCode, old.json().code]).toEqual([401, 'login_wrong']);
    const fresh = await login({ username: l.username, password: made.password });
    expect(fresh.statusCode).toBe(204);
    expect((await me(cookieOf(fresh))).statusCode).toBe(200);
    // Still the same pupil: their work stays theirs.
    expect((await row(l.id)).pupil_id).toBe(pupilId);

    const logged = await resets(c.session.session_id);
    expect(logged).toEqual([{ class_id: c.cls.id }]);
    expect(Object.keys(logged[0]!)).toEqual(['class_id']);
  });

  it('unlocks a locked login and starts its wrong tries again', async () => {
    const c = await classWithCode(deps);
    const { l } = await usedLogin(c);
    for (let i = 0; i < MAX_WRONG_TRIES; i++) await login({ username: l.username, password: 'wrong-wrong-000' });
    expect((await row(l.id)).locked_at).not.toBeNull();
    const made: Made = (await renew(c, l.id)).json().login;
    const after = await row(l.id);
    expect([after.locked_at, after.wrong_tries]).toEqual([null, 0]);
    expect((await login({ username: l.username, password: made.password })).statusCode).toBe(204);
  });

  it('gives a login never used a new password and changes nothing else', async () => {
    const c = await classWithCode(deps);
    const l = await makeLogin(c);
    const before = await row(l.id);
    const made: Made = (await renew(c, l.id)).json().login;
    const after = await row(l.id);
    expect(after.password_hash).not.toBe(before.password_hash);
    expect({ ...after, password_hash: null }).toEqual({ ...before, password_hash: null });
    expect((await login({ username: l.username, password: l.password, code: c.code })).statusCode).toBe(401);
    expect((await login({ username: l.username, password: made.password, code: c.code })).statusCode).toBe(204);
  });

  it('refuses another workspace’s class, a login of another class, an archived class and pupils off, changing nothing', async () => {
    const mine = await classWithCode(deps);
    const other = await classWithCode(deps);
    const theirs = await makeLogin(other);
    const hash = (await row(theirs.id)).password_hash;
    expect((await renew(mine, theirs.id, other.cls.id)).statusCode).toBe(404);
    expect((await renew(mine, theirs.id)).statusCode).toBe(404);
    expect((await renew(mine, 'nope')).statusCode).toBe(404);

    const archived = await classWithCode(deps);
    const a = await makeLogin(archived);
    await t.db.execute('UPDATE classes SET archived_at = ? WHERE id = ?', [new Date().toISOString(), archived.cls.id]);
    const res = await renew(archived, a.id);
    expect([res.statusCode, res.json().code]).toEqual([409, 'class_archived']);

    const off = await classWithCode(deps, { pupils: false });
    const o = await makeLogin(off);
    const offRes = await renew(off, o.id);
    expect([offRes.statusCode, offRes.json().code]).toEqual([403, 'feature_off']);

    expect((await row(theirs.id)).password_hash).toBe(hash);
    for (const c of [mine, other, archived, off]) expect(await resets(c.session.session_id)).toEqual([]);
  });

  it('refuses a sign-in that checked the old password while the new one was made, and starts no sign-in', async () => {
    const c = await classWithCode(deps);
    const { l, pupilId } = await usedLogin(c);
    let renewed: Promise<LightMyRequestResponse> | null = null;
    vi.mocked(verifyPassword).mockImplementationOnce(async (password, stored) => {
      const real = await vi.importActual<typeof import('./hash.js')>('./hash.js');
      const right = await real.verifyPassword(password, stored);
      renewed = renew(c, l.id);
      await renewed;
      return right;
    });
    const res = await login({ username: l.username, password: l.password });
    expect((await renewed!)?.statusCode).toBe(200);
    expect([res.statusCode, res.json().code]).toEqual([401, 'login_wrong']);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await signInsOf(pupilId)).toBe(0);
  });

  it('a new password made after the old one signed in but before its sign-in starts: no sign-in starts', async () => {
    const c = await classWithCode(deps);
    const { l, pupilId } = await usedLogin(c);
    let renewed: LightMyRequestResponse | null = null;
    afterSignedIn = async () => (renewed = await renew(c, l.id));
    const res = await login({ username: l.username, password: l.password });
    expect(renewed!.statusCode).toBe(200);
    expect([res.statusCode, res.json().code]).toEqual([401, 'login_wrong']);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await signInsOf(pupilId)).toBe(0);
  });

  it('the same on first use, with the class join between', async () => {
    const c = await classWithCode(deps);
    const l = await makeLogin(c);
    afterSignedIn = () => renew(c, l.id);
    const res = await login({ username: l.username, password: l.password, code: c.code });
    expect([res.statusCode, res.json().code]).toEqual([401, 'login_wrong']);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await signInsOf((await row(l.id)).pupil_id)).toBe(0);
  });
});

describe('research data', () => {
  it('no username, password or hash in any event, log line or the export', async () => {
    const c = await classWithCode(deps);
    const { l } = await usedLogin(c);
    const oldHash = String((await row(l.id)).password_hash);
    const made: Made = (await renew(c, l.id)).json().login;
    const newHash = String((await row(l.id)).password_hash);
    const events = JSON.stringify((await t.db.execute('SELECT * FROM events')).rows);
    const { files } = await buildBundle(deps, c.session.session_id);
    const exported = JSON.stringify(Object.values(files).map((f) => (typeof f === 'string' ? f : Buffer.from(f).toString('latin1'))));
    const logged = logs.join('\n');
    for (const s of [l.username, l.password, made.password, oldHash, newHash]) {
      expect(events).not.toContain(s);
      expect(exported).not.toContain(s);
      expect(logged).not.toContain(s);
    }
    expect(exported).toContain('pupil_password_reset');
  });
});
