/** The Usage section's route: spend by UK day for a range, and all-time spend against the budget. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid } from '@edw/shared';
import { buildApp } from '../app.js';
import type { AppDeps, SessionRow } from '../deps.js';
import { newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { usageReport } from './routes.js';

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
let s: SessionRow;
let other: SessionRow;

const auth = (x: SessionRow = s) => ({ authorization: `Bearer ${x.participant_token}` });
const get = (range?: string, x: SessionRow = s) => app.inject({ url: `/api/sessions/${x.session_id}/usage${range ? `?range=${range}` : ''}`, headers: auth(x) });

/** A model call made at `at`, costing `gbp` (null: from before costs were stored). */
async function call(at: string, gbp: number | null, x: SessionRow = s) {
  await t.db.execute('INSERT INTO gateway_calls (gateway_call_id, session_id, thread_id, turn_id, payload, at, cost_gbp) VALUES (?, ?, ?, ?, ?, ?, ?)', [newUlid(), x.session_id, 'th', `t_${newUlid()}`, '{}', at, gbp]);
}

beforeEach(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  app = await buildApp(deps);
  await app.ready();
  s = (await newWorkspace(deps)).session;
  other = (await newWorkspace(deps, 'B')).session;
});
afterEach(async () => {
  await app.close();
  t.cleanup();
});

describe('usage', () => {
  it('gives this week by UK day, this month and all time, with all-time spend against the budget', async () => {
    await call('2026-10-31T12:00:00.000Z', 5); // Saturday of the week before
    await call('2026-11-01T23:30:00.000Z', 1); // Sunday 1 November, GMT
    await call('2026-11-02T00:30:00.000Z', 2); // Monday
    await call('2026-11-04T09:00:00.000Z', 0.5);
    await call('2026-11-04T10:00:00.000Z', null); // before costs were stored
    await call('2026-11-04T10:00:00.000Z', 9, other);
    const now = new Date('2026-11-04T12:00:00.000Z');
    const budget = deps.loaded.config.limits.budget_gbp;

    expect(await usageReport(deps, s.session_id, 'week', now)).toEqual({
      range: 'week',
      from: '2026-11-02',
      to: '2026-11-04',
      days: [
        { day: '2026-11-02', gbp: 2 },
        { day: '2026-11-03', gbp: 0 },
        { day: '2026-11-04', gbp: 0.5 },
      ],
      total_gbp: 2.5,
      spent_gbp: 8.5,
      budget_gbp: budget,
    });
    expect(await usageReport(deps, s.session_id, 'month', now)).toMatchObject({ from: '2026-11-01', total_gbp: 3.5, spent_gbp: 8.5 });
    const all = await usageReport(deps, s.session_id, 'all', now);
    expect(all).toMatchObject({ from: '2026-10-31', total_gbp: 8.5, spent_gbp: 8.5 });
    expect(all.days).toHaveLength(5);
  });

  it('serves the report for the range asked, this week by default', async () => {
    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ range: 'week', total_gbp: 0, spent_gbp: 0, budget_gbp: deps.loaded.config.limits.budget_gbp });
    expect((await get('all')).json()).toMatchObject({ range: 'all', from: null, days: [] });
    expect((await get('year')).statusCode).toBe(400);
  });

  it("shows the workspace's budget with its top-ups", async () => {
    const admin = { authorization: `Bearer ${deps.env.ADMIN_PASSWORD}` };
    expect((await app.inject({ method: 'POST', url: `/api/admin/sessions/${s.session_id}/budget/topup`, headers: admin })).statusCode).toBe(200);
    expect((await get()).json()).toMatchObject({ budget_gbp: deps.loaded.config.limits.budget_gbp + 10 });
    // Another workspace's budget is the config's.
    expect((await get(undefined, other)).json()).toMatchObject({ budget_gbp: deps.loaded.config.limits.budget_gbp });
  });

  it("needs the workspace's link, and does not log anything", async () => {
    const before = (await deps.events.list(s.session_id)).length;
    expect((await app.inject({ url: `/api/sessions/${s.session_id}/usage` })).statusCode).toBe(401);
    expect((await app.inject({ url: `/api/sessions/${s.session_id}/usage`, headers: auth(other) })).statusCode).toBe(403);
    await get('month');
    expect((await deps.events.list(s.session_id)).length).toBe(before);
  });
});
