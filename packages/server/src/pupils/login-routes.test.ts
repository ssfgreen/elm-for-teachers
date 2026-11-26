/**
 * A pupil signs in with a teacher's login (issue #231): first use with the class code, later
 * log-ins without, the refusals, wrong passwords locking the login, unknown usernames counting on
 * the address, and nothing about the login anywhere but `pupil_logins`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../app.js';
import type { AppDeps } from '../deps.js';
import { tempDb, testDeps, testEnv, type TempDb } from '../test-helpers.js';
import { buildBundle } from '../export/bundle.js';
import { classWithCode } from '../class-joins/test-class.js';
import { createClassJoinStore } from '../class-joins/store.js';
import { createPupilLoginStore } from '../pupil-logins/store.js';
import { dummyVerify, verifyPassword } from '../pupil-logins/hash.js';
import { pupilCookieNames } from './cookies.js';
import { createPupilStore } from './store.js';

vi.mock('../pupil-logins/hash.js', async (original) => {
  const real = await original<typeof import('../pupil-logins/hash.js')>();
  return { ...real, dummyVerify: vi.fn(real.dummyVerify), verifyPassword: vi.fn(real.verifyPassword) };
});

const BASE = 'https://edw.example';
const PUPIL = pupilCookieNames(BASE).signIn;

let t: TempDb;
let app: FastifyInstance;
let deps: AppDeps;
const logs: string[] = [];
/** Each test its own address, so the wrong-code counter of one does not reach another. */
let nextIp = 1;
const freshIp = () => `10.0.${Math.floor(nextIp / 250)}.${(nextIp++ % 250) + 1}`;

beforeAll(async () => {
  t = await tempDb();
  deps = { ...testDeps(t.db), env: testEnv({ AUTH_SECRET: 's'.repeat(40), AUTH_BASE_URL: BASE, PUPILS: 'on' }) };
  app = await buildApp(deps, { logger: true, logStream: { write: (line) => void logs.push(line) } });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  t.cleanup();
});

type Ctx = Awaited<ReturnType<typeof classWithCode>>;
type Made = { id: string; username: string; password: string };
type Body = { username: string; password: string; code?: string };
const auth = (c: Ctx) => ({ authorization: `Bearer ${c.session.participant_token}` });

/** Logins for the class, made through the store so a workspace with pupils off can have some. */
const makeLogins = async (c: Ctx, count = 1): Promise<Made[]> => (await createPupilLoginStore(t.db, deps.events).make(c.session.session_id, c.cls.id, count, c.env)) as Made[];
const login = (body: Body, opts: { ip?: string; cookie?: string; origin?: string } = {}) =>
  app.inject({
    method: 'POST',
    url: '/api/pupil/login',
    remoteAddress: opts.ip ?? freshIp(),
    headers: { origin: opts.origin ?? BASE, ...(opts.cookie ? { cookie: `${PUPIL}=${opts.cookie}` } : {}) },
    payload: body,
  });
const signInCookie = (res: LightMyRequestResponse): string | null => {
  const set = [res.headers['set-cookie'] ?? []].flat().map(String).find((x) => x.startsWith(`${PUPIL}=`));
  return set ? set.slice(PUPIL.length + 1).split(';')[0]! : null;
};
const me = (cookie: string) => app.inject({ url: '/api/pupil/me', headers: { cookie: `${PUPIL}=${cookie}` } });
const refusal = (res: LightMyRequestResponse) => [res.statusCode, res.json().code];
const loginRow = async (id: string) => (await t.db.execute('SELECT * FROM pupil_logins WHERE id = ?', [id])).rows[0]!;
const membersOf = async (c: Ctx) => (await app.inject({ url: `/api/sessions/${c.session.session_id}/classes/${c.cls.id}/members`, headers: auth(c) })).json().members;
const loginPupils = async (loginId: string) => (await t.db.execute("SELECT id FROM pupils WHERE provider = 'login' AND subject = ?", [loginId])).rows;

describe('first use and later log-ins', () => {
  it('first use with the live code makes one pupil and one membership after a Google pupil, marks the login used, sets the cookie', async () => {
    const c = await classWithCode(deps);
    const google = await createPupilStore(t.db).signIn({ provider: 'google', subject: `g-${c.cls.id}`, tenant: null });
    await createClassJoinStore(t.db, deps.events).join(google.id, { class_id: c.cls.id, session_id: c.session.session_id });
    const [l] = await makeLogins(c);
    const res = await login({ username: l!.username, password: l!.password, code: c.code });
    expect(res.statusCode).toBe(204);
    expect(res.headers['cache-control']).toBe('no-store');
    const cookie = signInCookie(res);
    expect(cookie).toBeTruthy();
    const pupils = await loginPupils(l!.id);
    expect(pupils).toHaveLength(1);
    const row = await loginRow(l!.id);
    expect(row.pupil_id).toBe(pupils[0]!.id);
    expect(row.used_at).not.toBeNull();
    const body = (await me(cookie!)).json();
    expect(body.pupil).toEqual({ provider: 'login', test: false });
    expect(body.classes).toEqual([{ class_id: c.cls.id, class_name: '8B', label: 'Pupil 2' }]);
  });

  it('a later log-in needs no code, and makes no second pupil or membership; a code sent then is ignored', async () => {
    const c = await classWithCode(deps);
    const [l] = await makeLogins(c);
    expect((await login({ username: l!.username, password: l!.password, code: c.code })).statusCode).toBe(204);
    const again = await login({ username: l!.username, password: l!.password });
    expect(again.statusCode).toBe(204);
    expect((await me(signInCookie(again)!)).json().classes).toHaveLength(1);
    const ip = freshIp();
    for (let i = 0; i < 12; i++) expect((await login({ username: l!.username, password: l!.password, code: 'NOPE-NOPE' }, { ip })).statusCode).toBe(204);
    expect(await loginPupils(l!.id)).toHaveLength(1);
    expect(await membersOf(c)).toHaveLength(1);
  });

  it('two first uses at once leave one pupil and one membership', async () => {
    const c = await classWithCode(deps);
    const [l] = await makeLogins(c);
    const body = { username: l!.username, password: l!.password, code: c.code };
    const both = await Promise.all([login(body), login(body)]);
    expect(both.map((r) => r.statusCode)).toEqual([204, 204]);
    expect(await loginPupils(l!.id)).toHaveLength(1);
    expect(await membersOf(c)).toHaveLength(1);
  });

  it('takes capitals and spaces round the username and the password', async () => {
    const c = await classWithCode(deps);
    const [l] = await makeLogins(c);
    expect((await login({ username: `  ${l!.username.toUpperCase()} `, password: ` ${l!.password.toUpperCase()}  `, code: c.code })).statusCode).toBe(204);
  });

  it('ends a pupil sign-in the browser already had', async () => {
    const c = await classWithCode(deps);
    const [l] = await makeLogins(c);
    const first = signInCookie(await login({ username: l!.username, password: l!.password, code: c.code }))!;
    const second = signInCookie(await login({ username: l!.username, password: l!.password }, { cookie: first }))!;
    expect((await me(first)).statusCode).toBe(401);
    expect((await me(second)).statusCode).toBe(200);
  });

  it('a login removed with its pupil (#220) no longer signs in', async () => {
    const c = await classWithCode(deps);
    const [l] = await makeLogins(c);
    expect((await login({ username: l!.username, password: l!.password, code: c.code })).statusCode).toBe(204);
    const [member] = await membersOf(c);
    const removed = await app.inject({ method: 'DELETE', url: `/api/sessions/${c.session.session_id}/classes/${c.cls.id}/members/${member.id}`, headers: auth(c), payload: { envelope: c.env } });
    expect(removed.statusCode).toBe(204);
    expect(refusal(await login({ username: l!.username, password: l!.password }))).toEqual([401, 'login_wrong']);
    expect(refusal(await login({ username: l!.username, password: l!.password, code: c.code }))).toEqual([401, 'login_wrong']);
  });
});

describe('refusals', () => {
  it('first use with no code, or a blank one', async () => {
    const c = await classWithCode(deps);
    const [l] = await makeLogins(c);
    expect(refusal(await login({ username: l!.username, password: l!.password }))).toEqual([403, 'code_needed']);
    expect(refusal(await login({ username: l!.username, password: l!.password, code: '  ' }))).toEqual([403, 'code_needed']);
    expect((await loginRow(l!.id)).pupil_id).toBeNull();
  });

  it('an unknown code is counted on the address; another class’s live code is not', async () => {
    const c = await classWithCode(deps);
    const other = await classWithCode(deps);
    const [l] = await makeLogins(c);
    const ip = freshIp();
    for (let i = 0; i < 10; i++) expect(refusal(await login({ username: l!.username, password: l!.password, code: other.code }, { ip }))).toEqual([403, 'code_other_class']);
    expect(refusal(await login({ username: l!.username, password: l!.password, code: 'ZZZZ-ZZZZ' }, { ip }))).toEqual([404, 'code_unknown']);
    expect((await login({ username: l!.username, password: l!.password, code: c.code }, { ip })).statusCode).toBe(204);

    const [m] = await makeLogins(c);
    const counted = freshIp();
    for (let i = 0; i < 10; i++) expect(refusal(await login({ username: m!.username, password: m!.password, code: 'ZZZZ-ZZZZ' }, { ip: counted }))).toEqual([404, 'code_unknown']);
    expect(refusal(await login({ username: m!.username, password: m!.password, code: c.code }, { ip: counted }))).toEqual([429, 'too_many_codes']);
  });

  it('a closed or renewed code, an archived class, the workspace’s pupils switch off', async () => {
    const joins = createClassJoinStore(t.db, deps.events);
    const closed = await classWithCode(deps);
    const [a] = await makeLogins(closed);
    await joins.setCode(closed.session.session_id, closed.cls.id, 'close', closed.env);
    expect(refusal(await login({ username: a!.username, password: a!.password, code: closed.code }, { ip: freshIp() }))).toEqual([404, 'code_unknown']);

    const renewed = await classWithCode(deps);
    const [b] = await makeLogins(renewed);
    await joins.setCode(renewed.session.session_id, renewed.cls.id, 'renew', renewed.env);
    expect(refusal(await login({ username: b!.username, password: b!.password, code: renewed.code }, { ip: freshIp() }))).toEqual([404, 'code_unknown']);

    const archived = await classWithCode(deps);
    const [d] = await makeLogins(archived);
    await t.db.execute('UPDATE classes SET archived_at = ? WHERE id = ?', [new Date().toISOString(), archived.cls.id]);
    expect(refusal(await login({ username: d!.username, password: d!.password, code: archived.code }))).toEqual([409, 'class_archived']);

    const off = await classWithCode(deps, { pupils: false });
    const [e] = await makeLogins(off);
    expect(refusal(await login({ username: e!.username, password: e!.password, code: off.code }))).toEqual([403, 'feature_off']);
    for (const x of [a, b, d, e]) expect((await loginRow(x!.id)).pupil_id).toBeNull();
  });

  it('PUPILS off answers 403 pupils_off, not cached', async () => {
    const shut = await buildApp({ ...deps, env: testEnv({ AUTH_BASE_URL: BASE }) });
    await shut.ready();
    const res = await shut.inject({ method: 'POST', url: '/api/pupil/login', headers: { origin: BASE }, payload: { username: 'a', password: 'b' } });
    expect(refusal(res)).toEqual([403, 'pupils_off']);
    expect(res.headers['cache-control']).toBe('no-store');
    await shut.close();
  });

  it('another Origin, or none, is refused without a cookie', async () => {
    const c = await classWithCode(deps);
    const [l] = await makeLogins(c);
    const res = await login({ username: l!.username, password: l!.password, code: c.code }, { origin: 'https://other.example' });
    expect(res.statusCode).toBe(403);
    expect(signInCookie(res)).toBeNull();
    const none = await app.inject({ method: 'POST', url: '/api/pupil/login', payload: { username: l!.username, password: l!.password, code: c.code } });
    expect(none.statusCode).toBe(403);
    expect((await loginRow(l!.id)).pupil_id).toBeNull();
  });

  it('a username, password or code over 64 characters is 400 invalid_request', async () => {
    const long = 'a'.repeat(65);
    for (const body of [{ username: long, password: 'x' }, { username: 'x', password: long }, { username: 'x', password: 'x', code: long }]) {
      expect(refusal(await login(body))).toEqual([400, 'invalid_request']);
    }
  });
});

describe('wrong passwords', () => {
  it('four wrong then the right one signs in, and the count is back at 0', async () => {
    const c = await classWithCode(deps);
    const [l] = await makeLogins(c);
    for (let i = 0; i < 4; i++) expect(refusal(await login({ username: l!.username, password: 'wrong-wrong-000', code: c.code }))).toEqual([401, 'login_wrong']);
    expect((await loginRow(l!.id)).wrong_tries).toBe(4);
    expect((await login({ username: l!.username, password: l!.password, code: c.code })).statusCode).toBe(204);
    expect((await loginRow(l!.id)).wrong_tries).toBe(0);
  });

  it('five in a row lock it: the fifth answers login_locked, and so does the right password after', async () => {
    const c = await classWithCode(deps);
    const [l] = await makeLogins(c);
    for (let i = 0; i < 4; i++) expect(refusal(await login({ username: l!.username, password: 'wrong' }))).toEqual([401, 'login_wrong']);
    expect(refusal(await login({ username: l!.username, password: 'wrong' }))).toEqual([403, 'login_locked']);
    expect(refusal(await login({ username: l!.username, password: l!.password, code: c.code }))).toEqual([403, 'login_locked']);
    expect((await loginRow(l!.id)).pupil_id).toBeNull();
  });

  it('a burst of 20 wrong passwords at once leaves at most five tries, and locks the login', async () => {
    const c = await classWithCode(deps);
    const [l] = await makeLogins(c);
    const burst = await Promise.all(Array.from({ length: 20 }, () => login({ username: l!.username, password: 'wrong' })));
    const answers = burst.map(refusal).map(String);
    for (const a of answers) expect(['401,login_wrong', '403,login_locked']).toContain(a);
    expect(answers).toContain('403,login_locked');
    const row = await loginRow(l!.id);
    expect(Number(row.wrong_tries)).toBeLessThanOrEqual(5);
    expect(row.locked_at).not.toBeNull();
    expect(refusal(await login({ username: l!.username, password: l!.password, code: c.code }))).toEqual([403, 'login_locked']);
  });

  it('the right password sent at the end of a burst of 20 wrong ones does not sign in', async () => {
    const c = await classWithCode(deps);
    const [l] = await makeLogins(c);
    const wrong = Array.from({ length: 20 }, () => login({ username: l!.username, password: 'wrong' }));
    const right = login({ username: l!.username, password: l!.password, code: c.code });
    await Promise.all(wrong);
    expect(refusal(await right)).toEqual([403, 'login_locked']);
    const row = await loginRow(l!.id);
    expect([Number(row.wrong_tries) <= 5, row.locked_at !== null, row.pupil_id]).toEqual([true, true, null]);
    expect(await loginPupils(l!.id)).toHaveLength(0);
  });

  it('four wrong and the right one sent together: the right one signs in, and the login stays open', async () => {
    const c = await classWithCode(deps);
    const [l] = await makeLogins(c);
    const wrong = Array.from({ length: 4 }, () => login({ username: l!.username, password: 'wrong' }));
    const right = login({ username: l!.username, password: l!.password, code: c.code });
    // A wrong one may see the right one's try in its count and answer locked for a moment.
    for (const w of await Promise.all(wrong)) expect(['401,login_wrong', '403,login_locked']).toContain(String(refusal(w)));
    expect((await right).statusCode).toBe(204);
    expect((await loginRow(l!.id)).locked_at).toBeNull();
  });

  it('a password check that throws gives its try back', async () => {
    const c = await classWithCode(deps);
    const [l] = await makeLogins(c);
    vi.mocked(verifyPassword).mockRejectedValueOnce(new Error('boom'));
    expect((await login({ username: l!.username, password: l!.password, code: c.code })).statusCode).toBe(500);
    expect((await loginRow(l!.id)).wrong_tries).toBe(0);
  });

  it('tries on one login touch neither another login nor the address counter', async () => {
    const c = await classWithCode(deps);
    const [a, b, d] = await makeLogins(c, 3);
    const ip = freshIp();
    for (const x of [a, d]) for (let i = 0; i < 6; i++) await login({ username: x!.username, password: 'wrong' }, { ip });
    expect((await loginRow(b!.id)).wrong_tries).toBe(0);
    expect((await login({ username: b!.username, password: b!.password, code: c.code }, { ip })).statusCode).toBe(204);
  });
});

describe('unknown usernames', () => {
  it('401 with the same body as a wrong password, and the dummy hash run', async () => {
    const c = await classWithCode(deps);
    const [l] = await makeLogins(c);
    vi.mocked(dummyVerify).mockClear();
    const unknown = await login({ username: 'nobody-here-00', password: 'some-thing-123' }, { ip: freshIp() });
    expect(vi.mocked(dummyVerify)).toHaveBeenCalledTimes(1);
    const wrong = await login({ username: l!.username, password: 'some-thing-123' }, { ip: freshIp() });
    expect(vi.mocked(dummyVerify)).toHaveBeenCalledTimes(1);
    expect(unknown.statusCode).toBe(401);
    expect(unknown.body).toBe(wrong.body);
  });

  it('after 10 from one address: 429 for any username from it, and for /api/pupil/join and /api/access', async () => {
    const c = await classWithCode(deps);
    const [l, m] = await makeLogins(c, 2);
    const signedIn = signInCookie(await login({ username: m!.username, password: m!.password, code: c.code }, { ip: freshIp() }))!;
    const ip = freshIp();
    for (let i = 0; i < 10; i++) expect(refusal(await login({ username: `nobody-${i}`, password: 'x' }, { ip }))).toEqual([401, 'login_wrong']);
    expect(refusal(await login({ username: 'nobody-else', password: 'x' }, { ip }))).toEqual([429, 'too_many_codes']);
    expect(refusal(await login({ username: l!.username, password: l!.password, code: c.code }, { ip }))).toEqual([429, 'too_many_codes']);
    const join = await app.inject({ method: 'POST', url: '/api/pupil/join', remoteAddress: ip, headers: { origin: BASE, cookie: `${PUPIL}=${signedIn}` }, payload: { code: c.code } });
    expect(refusal(join)).toEqual([429, 'too_many_codes']);
    const access = await app.inject({ method: 'POST', url: '/api/access', remoteAddress: ip, payload: { code: 'AAAA-BBBB-CCCC' } });
    expect(access.statusCode).toBe(429);
    expect((await login({ username: l!.username, password: l!.password, code: c.code }, { ip: freshIp() })).statusCode).toBe(204);
  });
});

describe('research data', () => {
  it('no event for any sign-in; username and hash only in pupil_logins, password and code nowhere new; not in logs or the export', async () => {
    const c = await classWithCode(deps);
    const [first, wrong] = await makeLogins(c, 2);
    const countEvents = async () => Number((await t.db.execute('SELECT COUNT(*) AS n FROM events')).rows[0]!.n);
    const before = await countEvents();
    await login({ username: first!.username, password: first!.password, code: c.code });
    await login({ username: first!.username, password: first!.password });
    for (let i = 0; i < 6; i++) await login({ username: wrong!.username, password: `${wrong!.password}x` });
    await login({ username: 'nobody-at-all', password: 'x' }, { ip: freshIp() });
    expect(await countEvents()).toBe(before);

    const hashes = (await t.db.execute('SELECT password_hash FROM pupil_logins WHERE class_id = ?', [c.cls.id])).rows.map((r) => String(r.password_hash));
    const stored = (await t.db.execute('SELECT code FROM class_codes WHERE class_id = ?', [c.cls.id])).rows.map((r) => String(r.code));
    const usernames = [first!.username, wrong!.username];
    const passwords = [first!.password, wrong!.password];
    const codes = [c.code, ...stored];
    const tables = (await t.db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")).rows.map((r) => String(r.name));
    for (const table of tables) {
      const rows = JSON.stringify((await t.db.execute(`SELECT * FROM "${table}"`)).rows);
      if (table !== 'pupil_logins') for (const s of [...usernames, ...hashes]) expect(rows, table).not.toContain(s);
      for (const s of passwords) expect(rows, table).not.toContain(s);
      if (table !== 'class_codes') for (const s of codes) expect(rows, table).not.toContain(s);
    }
    const logged = logs.join('\n');
    const { files } = await buildBundle(deps, c.session.session_id);
    const exported = JSON.stringify(Object.values(files).map((f) => (typeof f === 'string' ? f : Buffer.from(f).toString('latin1'))));
    for (const s of [...usernames, ...hashes, ...passwords, ...codes]) {
      expect(logged).not.toContain(s);
      expect(exported).not.toContain(s);
    }
    expect(exported).toContain(c.cls.id);
    expect(logged).toContain('login_locked');
  });
});
