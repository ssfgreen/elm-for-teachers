/** Top-ups on /admin: "Add £10" adds to one workspace's budget, logs one budget_update, and has no undo. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid } from '@edw/shared';
import { buildApp } from '../app.js';
import type { AppDeps, SessionRow } from '../deps.js';
import { newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
let s: SessionRow;
let other: SessionRow;
let admin: Record<string, string>;

const topUp = (sid: string, headers: Record<string, string> = admin) => app.inject({ method: 'POST', url: `/api/admin/sessions/${sid}/budget/topup`, headers });
const updates = async (sid: string) => (await deps.events.list(sid)).filter((e) => e.kind === 'budget_update');
const config = () => deps.loaded.config.limits.budget_gbp;

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
beforeEach(async () => {
  s = (await newWorkspace(deps)).session;
  other = (await newWorkspace(deps, 'B')).session;
});

describe('adding £10 to a workspace budget', () => {
  it('adds £10 and logs exactly one budget_update, with the budget either side and the spend', async () => {
    await t.db.execute('INSERT INTO gateway_calls (gateway_call_id, session_id, thread_id, turn_id, payload, at, cost_gbp) VALUES (?, ?, ?, ?, ?, ?, ?)', [newUlid(), s.session_id, 'th', 't_1', '{}', new Date().toISOString(), 12.4]);
    const res = await topUp(s.session_id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ budget: { session_id: s.session_id, spent_gbp: 12.4, budget_gbp: config() + 10 } });
    const logged = await updates(s.session_id);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ focus_pane: 'none', payload: { amount_gbp: 10, budget_before_gbp: config(), budget_after_gbp: config() + 10, spent_gbp: 12.4, via: 'password' } });

    // A second top-up adds again, from the new budget.
    expect((await topUp(s.session_id)).json().budget.budget_gbp).toBe(config() + 20);
    expect((await updates(s.session_id)).at(-1)!.payload).toMatchObject({ budget_before_gbp: config() + 10, budget_after_gbp: config() + 20 });
    // Only this workspace.
    expect(await updates(other.session_id)).toHaveLength(0);
  });

  it('gives 404 for an unknown workspace, and logs nothing', async () => {
    const res = await topUp(newUlid());
    expect(res.statusCode).toBe(404);
    expect((await t.db.execute('SELECT COUNT(*) AS n FROM budget_topups WHERE session_id NOT IN (SELECT session_id FROM sessions)')).rows[0]!.n).toBe(0);
  });

  it('is for admins only: not a teacher with the workspace link, nor anyone without credentials', async () => {
    expect((await topUp(s.session_id, {})).statusCode).toBe(401);
    expect((await topUp(s.session_id, { authorization: `Bearer ${s.participant_token}` })).statusCode).toBe(401);
    expect(await updates(s.session_id)).toHaveLength(0);
  });

  it('is in the exported events.jsonl', async () => {
    await topUp(s.session_id);
    const bundle = await app.inject({ url: `/api/admin/sessions/${s.session_id}/export.json`, headers: admin });
    expect(bundle.json()['events.jsonl']).toContain('"budget_update"');
  });
});

describe('reading budgets', () => {
  it("lists every workspace's spend and budget for /admin", async () => {
    await topUp(s.session_id);
    const res = await app.inject({ url: '/api/admin/budgets', headers: admin });
    expect(res.statusCode).toBe(200);
    const budgets = res.json().budgets as { session_id: string; spent_gbp: number; budget_gbp: number }[];
    expect(budgets.find((b) => b.session_id === s.session_id)).toEqual({ session_id: s.session_id, spent_gbp: 0, budget_gbp: config() + 10 });
    expect(budgets.find((b) => b.session_id === other.session_id)).toEqual({ session_id: other.session_id, spent_gbp: 0, budget_gbp: config() });
    expect((await app.inject({ url: '/api/admin/budgets', headers: { authorization: `Bearer ${s.participant_token}` } })).statusCode).toBe(401);
  });

  it("gives the workspace its own budget for the chat, and logs nothing", async () => {
    await topUp(s.session_id);
    const before = (await deps.events.list(s.session_id)).length;
    const res = await app.inject({ url: `/api/sessions/${s.session_id}/budget`, headers: { authorization: `Bearer ${s.participant_token}` } });
    expect(res.json()).toEqual({ spent_gbp: 0, budget_gbp: config() + 10 });
    expect((await app.inject({ url: `/api/sessions/${s.session_id}/budget`, headers: { authorization: `Bearer ${other.participant_token}` } })).statusCode).toBe(403);
    expect((await deps.events.list(s.session_id)).length).toBe(before);
  });
});
