import { afterAll, beforeAll, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { CanvasServiceImpl } from '../blocks/index.js';
import type { AppDeps } from '../deps.js';
import { ADMIN_PASSWORD, envelopeFor, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { createAccountStore } from './store.js';

let t: TempDb;
let deps: AppDeps & { canvas: CanvasServiceImpl };
let app: FastifyInstance;

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

const EMAIL = 'ms.private@school.example';
const NAME = 'Morag Private';
const SUBJECT = 'subject-1234567890';

it("keeps an account's email, name and subject out of its export and out of every other table", async () => {
  const store = createAccountStore(t.db, deps.sessions);
  const { code } = await store.createInvite({ label: 'Year 9 Science', email: EMAIL });
  const { account } = await store.claimInvite(code, { provider: 'google', subject: SUBJECT, email: EMAIL, displayName: NAME });
  await store.recordSignIn(account.id);
  await store.recordNoticeAccepted(account.id, '2026-11');
  const sid = account.session_id;
  await deps.sessions.recordOpen(sid);
  const [thread] = await deps.threads.list(sid);
  const doc = (await deps.canvas.snapshot(sid)).docs[0]!;
  await deps.canvas.structural(sid, { command: 'insert', doc_id: doc.id, after: 'start', type: 'paragraph', content: 'Photosynthesis' }, envelopeFor(doc, thread!));

  const res = await app.inject({ url: `/api/admin/sessions/${sid}/export.json`, headers: { authorization: `Bearer ${ADMIN_PASSWORD}` } });
  expect(res.statusCode).toBe(200);
  expect(res.body).toContain('Photosynthesis');
  for (const secret of [EMAIL, NAME, SUBJECT]) expect(res.body).not.toContain(secret);

  // Only accounts and account_invites may hold them.
  const tables = (await t.db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.map((r) => String(r.name));
  for (const table of tables.filter((x) => x !== 'accounts' && x !== 'account_invites')) {
    const rows = JSON.stringify((await t.db.execute(`SELECT * FROM ${table}`)).rows);
    for (const secret of [EMAIL, NAME, SUBJECT]) expect(rows.includes(secret), `${table} holds ${secret}`).toBe(false);
  }
});
