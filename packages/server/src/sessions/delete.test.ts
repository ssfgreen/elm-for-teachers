import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { AppDeps } from '../deps.js';
import { tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { SESSION_TABLES } from './service.js';
import { createAccountStore } from '../accounts/store.js';

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
let admin: Record<string, string>;

beforeAll(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  app = await buildApp(deps);
  await app.ready();
  admin = { authorization: `Bearer ${deps.env.ADMIN_PASSWORD}` };
});
afterAll(async () => {
  await app.close();
  t.cleanup();
});

/** Every table with a session_id column, read from the database. */
async function sessionTables(): Promise<string[]> {
  const r = await t.db.execute("SELECT m.name AS name FROM sqlite_master m JOIN pragma_table_info(m.name) c ON c.name = 'session_id' WHERE m.type = 'table'");
  return r.rows.map((row) => String(row.name));
}

async function rowsLeft(sid: string): Promise<Record<string, number>> {
  const left: Record<string, number> = {};
  for (const table of await sessionTables()) {
    const r = await t.db.execute(`SELECT COUNT(*) AS n FROM ${table} WHERE session_id = ?`, [sid]);
    const n = Number(r.rows[0]!.n);
    if (n > 0) left[table] = n;
  }
  return left;
}

describe('deleting a workspace', () => {
  it('has every table with a session_id in the delete list, so a new one cannot be forgotten', async () => {
    // The seed below does not fill every table (preferences, say), so the list itself is checked.
    expect([...SESSION_TABLES].sort()).toEqual((await sessionTables()).sort());
  });

  it('deletes a study workspace, with its curriculum picks and pupil adaptations, and leaves no row behind', async () => {
    const made = await app.inject({ method: 'POST', url: '/api/admin/sessions', headers: admin, payload: { label: 'Study 1', study: true } });
    expect(made.statusCode).toBe(201);
    const sid: string = made.json().session.session_id;
    const other = await app.inject({ method: 'POST', url: '/api/admin/sessions', headers: admin, payload: { label: 'Study 2', study: true } });
    const otherSid: string = other.json().session.session_id;
    // The seed is what makes this the hard case: the delete has something in every class table.
    // A top-up, so the delete has a budget_topups row to remove.
    expect((await app.inject({ method: 'POST', url: `/api/admin/sessions/${sid}/budget/topup`, headers: admin })).statusCode).toBe(200);
    const before = await rowsLeft(sid);
    for (const table of ['class_curriculum', 'pupil_adaptations', 'class_pupils', 'budget_topups']) expect(before[table] ?? 0, table).toBeGreaterThan(0);
    const otherBefore = await rowsLeft(otherSid);

    const gone = await app.inject({ method: 'DELETE', url: `/api/admin/sessions/${sid}`, headers: admin });
    expect(gone.statusCode).toBeLessThan(300);

    expect(await rowsLeft(sid)).toEqual({});
    expect(await deps.sessions.get(sid)).toBeNull();
    // Another workspace is untouched.
    expect(await rowsLeft(otherSid)).toEqual(otherBefore);
  });

  it('deletes an account workspace with its account, sign-ins and invite', async () => {
    const store = createAccountStore(t.db, deps.sessions);
    const { code } = await store.createInvite({ label: 'Account', email: 'c@school.example' });
    const { account } = await store.claimInvite(code, { provider: 'google', subject: 'del-1', email: 'c@school.example', displayName: 'C' });
    const sid = account.session_id;
    await t.db.execute("INSERT INTO sign_ins (id_hash, account_id, session_id, created_at, expires_at) VALUES ('h1', ?, ?, 'n', 'n')", [account.id, sid]);
    const before = await rowsLeft(sid);
    for (const table of ['accounts', 'sign_ins', 'account_invites']) expect(before[table], table).toBe(1);

    const gone = await app.inject({ method: 'DELETE', url: `/api/admin/sessions/${sid}`, headers: admin });
    expect(gone.statusCode).toBeLessThan(300);
    expect(await rowsLeft(sid)).toEqual({});
    expect(await store.findAccount('google', 'del-1')).toBeNull();
  });
});
