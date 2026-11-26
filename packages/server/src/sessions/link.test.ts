import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { AppDeps } from '../deps.js';
import { createAccountStore } from '../accounts/store.js';
import { ADMIN_PASSWORD, tempDb, testDeps, type TempDb } from '../test-helpers.js';

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

interface Row {
  session_id: string;
  participant_token: string;
  access_code: string | null;
  participant_url: string | null;
  link_closed_at: string | null;
}

async function linkWorkspace(): Promise<Row> {
  const res = await app.inject({ method: 'POST', url: '/api/admin/sessions', headers: admin, payload: { label: 'Year 7' } });
  return { ...res.json().session, participant_url: res.json().participant_url } as Row;
}

const link = (id: string, action: 'replace' | 'close', headers: Record<string, string> = admin) =>
  app.inject({ method: 'POST', url: `/api/admin/sessions/${id}/link/${action}`, headers });

/** Whether the token still opens the workspace, the way the client opens it. */
async function tokenOpens(s: Pick<Row, 'session_id'>, token: string): Promise<boolean> {
  const participant = await app.inject({ url: '/api/participant', headers: { authorization: `Bearer ${token}` } });
  const workspace = await app.inject({ url: `/api/sessions/${s.session_id}`, headers: { authorization: `Bearer ${token}` } });
  expect(participant.statusCode === 200).toBe(workspace.statusCode === 200);
  return workspace.statusCode === 200;
}

let ip = 0;
const codeOpens = async (code: string | null): Promise<boolean> =>
  code !== null && (await app.inject({ method: 'POST', url: '/api/access', payload: { code }, remoteAddress: `10.9.0.${++ip}` })).statusCode === 200;

async function linkEvents(sessionId: string): Promise<unknown[]> {
  const r = await t.db.execute("SELECT payload FROM events WHERE session_id = ? AND kind = 'workspace_link' ORDER BY seq", [sessionId]);
  return r.rows.map((row) => JSON.parse(String(row.payload)));
}

describe('replacing a workspace link', () => {
  it('issues a new link and code; the old link and old code stop working', async () => {
    const old = await linkWorkspace();
    expect(await tokenOpens(old, old.participant_token)).toBe(true);
    expect(await codeOpens(old.access_code)).toBe(true);

    const res = await link(old.session_id, 'replace');
    expect(res.statusCode).toBe(200);
    const now = res.json().session as Row;
    expect(now.participant_token).not.toBe(old.participant_token);
    expect(now.access_code).not.toBe(old.access_code);
    expect(now.participant_url).toMatch(new RegExp(`/s/${now.participant_token}$`));
    expect(now.link_closed_at).toBeNull();

    expect(await tokenOpens(old, old.participant_token)).toBe(false);
    expect(await codeOpens(old.access_code)).toBe(false);
    expect(await tokenOpens(old, now.participant_token)).toBe(true);
    expect(await codeOpens(now.access_code)).toBe(true);
    expect(await linkEvents(old.session_id)).toEqual([{ action: 'replace', via: 'password' }]);
  });
});

describe('closing a workspace link', () => {
  it('stops the link and the code, and issues none', async () => {
    const old = await linkWorkspace();
    const res = await link(old.session_id, 'close');
    expect(res.statusCode).toBe(200);
    const now = res.json().session as Row;
    expect(now).toMatchObject({ access_code: null, participant_url: null });
    expect(now.link_closed_at).toEqual(expect.any(String));

    expect(await tokenOpens(old, old.participant_token)).toBe(false);
    // Not even the token the row now carries opens it.
    expect(await tokenOpens(old, now.participant_token)).toBe(false);
    expect(await codeOpens(old.access_code)).toBe(false);

    const listed = (await app.inject({ url: '/api/admin/sessions', headers: admin })).json().sessions as Row[];
    expect(listed.find((r) => r.session_id === old.session_id)).toMatchObject({ participant_url: null, access_code: null });
    expect(await linkEvents(old.session_id)).toEqual([{ action: 'close', via: 'password' }]);
  });

  it('makes no code for a closed link; replacing it opens it again', async () => {
    const s = await linkWorkspace();
    await link(s.session_id, 'close');
    const code = await app.inject({ method: 'POST', url: `/api/admin/sessions/${s.session_id}/access-code`, headers: admin });
    expect(code.statusCode).toBe(409);
    expect(code.json().code).toBe('link_closed');

    const reopened = (await link(s.session_id, 'replace')).json().session as Row;
    expect(reopened.link_closed_at).toBeNull();
    expect(await tokenOpens(s, reopened.participant_token)).toBe(true);
    expect(await codeOpens(reopened.access_code)).toBe(true);
  });
});

describe('who may change a link', () => {
  it('refuses an account workspace, an unknown one, no admin and a participant token', async () => {
    const store = createAccountStore(t.db, deps.sessions);
    const { account } = await store.claimInvite((await store.createInvite({ label: 'Signed in' })).code, { provider: 'google', subject: 'link-1', email: null, displayName: null });
    for (const action of ['replace', 'close'] as const) {
      const res = await link(account.session_id, action);
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('account_workspace');
      expect((await link('01JNOSUCHSESSION0000000000', action)).statusCode).toBe(404);
      const s = await linkWorkspace();
      expect((await link(s.session_id, action, {})).statusCode).toBe(401);
      expect((await link(s.session_id, action, { authorization: `Bearer ${s.participant_token}` })).statusCode).toBe(401);
      expect(await tokenOpens(s, s.participant_token)).toBe(true);
    }
  });
});
