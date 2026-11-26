import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { AppDeps } from '../deps.js';
import { ADMIN_PASSWORD, tempDb, testDeps, testEnv, type TempDb } from '../test-helpers.js';
import { createAccountStore } from '../accounts/store.js';
import { createWrongCodeCounter, WINDOW_MS, WRONG_LIMIT } from '../http/wrong-codes.js';

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
const admin = { authorization: `Bearer ${ADMIN_PASSWORD}` };

beforeAll(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  app = await buildApp(deps);
  await app.ready();
});
afterAll(async () => {
  await app.close();
  t.cleanup();
});

let ip = 0;
/** Each test asks from its own address, so the limit in one does not reach another. */
const address = () => `10.0.0.${++ip}`;
const access = (code: unknown, remoteAddress: string) => app.inject({ method: 'POST', url: '/api/access', payload: { code }, remoteAddress });

async function linkWorkspace(label = 'Year 7') {
  const res = await app.inject({ method: 'POST', url: '/api/admin/sessions', headers: admin, payload: { label } });
  return res.json().session as { session_id: string; participant_token: string; access_code: string };
}

describe('POST /api/access', () => {
  it('opens a link workspace by its code, forgiving how it was typed', async () => {
    const s = await linkWorkspace();
    expect(s.access_code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    const from = address();
    const typed = s.access_code.replace(/-/g, ' ').toLowerCase().replace(/1/g, 'i').replace(/0/g, 'o');
    for (const code of [s.access_code, typed, s.access_code.replace(/-/g, '')]) {
      const res = await access(code, from);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ session_id: s.session_id, token: s.participant_token });
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  it('says code_unknown for a wrong code, and 400 for no code', async () => {
    const res = await access('ZZZZ-ZZZZ-ZZZZ', address());
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('code_unknown');
    expect((await access('nonsense', address())).json().code).toBe('code_unknown');
    expect((await app.inject({ method: 'POST', url: '/api/access', payload: {}, remoteAddress: address() })).statusCode).toBe(400);
  });

  it('never opens an account workspace by a code', async () => {
    const store = createAccountStore(t.db, deps.sessions);
    const { account } = await store.claimInvite((await store.createInvite({ label: 'Signed in' })).code, { provider: 'google', subject: 's-1', email: null, displayName: null });
    // Even if a code were put on it by hand.
    await t.db.execute("UPDATE sessions SET access_code = 'ACCT0NT1MEAN' WHERE session_id = ?", [account.session_id]);
    const res = await access('ACCT-0NT1-MEAN', address());
    expect(res.statusCode).toBe(404);
  });

  it('refuses an address with 429 after ten wrong codes in a minute, even for a right code; others carry on', async () => {
    const s = await linkWorkspace();
    const from = address();
    for (let i = 0; i < WRONG_LIMIT; i++) expect((await access('ZZZZ-ZZZZ-ZZZZ', from)).statusCode).toBe(404);
    const blocked = await access(s.access_code, from);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().code).toBe('too_many_codes');
    expect((await access(s.access_code, address())).statusCode).toBe(200);
  });

  it('a right code does not count towards the limit', async () => {
    const s = await linkWorkspace();
    const from = address();
    for (let i = 0; i < WRONG_LIMIT + 5; i++) expect((await access(s.access_code, from)).statusCode).toBe(200);
  });
});

describe('the address the limit counts', () => {
  /** WRONG_LIMIT wrong codes from one socket, each naming a new forwarded address, then one more. */
  async function lastStatus(trustProxy: boolean | undefined): Promise<number> {
    const t2 = await tempDb();
    const a = await buildApp({ ...testDeps(t2.db), env: testEnv(trustProxy === undefined ? {} : { TRUST_PROXY: trustProxy }) });
    const send = (n: number) => a.inject({ method: 'POST', url: '/api/access', payload: { code: 'ZZZZ-ZZZZ-ZZZZ' }, remoteAddress: '10.9.9.9', headers: { 'x-forwarded-for': `203.0.113.${n}, 10.0.0.1` } });
    try {
      for (let i = 0; i < WRONG_LIMIT; i++) await send(i);
      return (await send(WRONG_LIMIT)).statusCode;
    } finally {
      await a.close();
      t2.cleanup();
    }
  }

  it('with TRUST_PROXY off (or unset), ignores X-Forwarded-For: the socket is blocked whatever it names', async () => {
    expect(await lastStatus(false)).toBe(429);
    expect(await lastStatus(undefined)).toBe(429);
  });

  it('with TRUST_PROXY on, counts the first forwarded address', async () => {
    expect(await lastStatus(true)).toBe(404);
  });
});

describe('the wrong-code counter', () => {
  it('forgets wrong codes after a minute', () => {
    let now = 1_000_000;
    const counter = createWrongCodeCounter(() => now);
    for (let i = 0; i < WRONG_LIMIT; i++) counter.record('a');
    expect(counter.blocked('a')).toBe(true);
    expect(counter.blocked('b')).toBe(false);
    now += WINDOW_MS + 1;
    expect(counter.blocked('a')).toBe(false);
  });
});

describe('admin', () => {
  it('lists access_code on link workspaces, and null code and link for an account workspace', async () => {
    const s = await linkWorkspace('Listed');
    const store = createAccountStore(t.db, deps.sessions);
    const { account } = await store.claimInvite((await store.createInvite({ label: 'Account' })).code, { provider: 'google', subject: 's-2', email: null, displayName: null });
    const rows = (await app.inject({ url: '/api/admin/sessions', headers: admin })).json().sessions as { session_id: string; access_code: string | null; participant_url: string | null }[];
    const link = rows.find((r) => r.session_id === s.session_id)!;
    expect(link.access_code).toBe(s.access_code);
    expect(link.participant_url).toMatch(/\/s\//);
    expect(rows.find((r) => r.session_id === account.session_id)).toMatchObject({ access_code: null, participant_url: null });
  });

  it('makes a code for an older workspace, and replaces one on asking again; 409 for an account workspace, 404 for none', async () => {
    const s = await linkWorkspace('Older');
    await t.db.execute('UPDATE sessions SET access_code = NULL WHERE session_id = ?', [s.session_id]);
    expect((await deps.sessions.get(s.session_id))?.access_code).toBeNull();
    const made = await app.inject({ method: 'POST', url: `/api/admin/sessions/${s.session_id}/access-code`, headers: admin });
    expect(made.statusCode).toBe(200);
    const code = made.json().session.access_code as string;
    expect((await access(code, address())).json().session_id).toBe(s.session_id);

    const again = (await app.inject({ method: 'POST', url: `/api/admin/sessions/${s.session_id}/access-code`, headers: admin })).json().session.access_code as string;
    expect(again).not.toBe(code);
    expect((await access(code, address())).statusCode).toBe(404);

    const store = createAccountStore(t.db, deps.sessions);
    const { account } = await store.claimInvite((await store.createInvite({ label: 'Acct' })).code, { provider: 'google', subject: 's-3', email: null, displayName: null });
    const refused = await app.inject({ method: 'POST', url: `/api/admin/sessions/${account.session_id}/access-code`, headers: admin });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().code).toBe('account_workspace');
    expect((await app.inject({ method: 'POST', url: '/api/admin/sessions/01ARZ3NDEKTSV4RRFFQ69G5FAV/access-code', headers: admin })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/api/admin/sessions/${s.session_id}/access-code` })).statusCode).toBe(401);
  });
});
