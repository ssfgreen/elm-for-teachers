/**
 * A workspace's budget in pounds: config `limits.budget_gbp` plus its top-ups (`budget_topups`,
 * one row per "Add £10" on /admin, never taken back). Both checks in gateway/limits.ts, Usage on
 * Preferences, the chat's "£N left" and /admin read it from here. Spend is the stored cost of
 * each model call: the teacher's (`cost_gbp` in `gateway_calls`, written by gateway/history.ts)
 * and pupils' asks in the reader (`cost_gbp` in `reader_asks`, reader-asks/store.ts), test pupils'
 * and removed pupils' included.
 */
import { newUlid, nowIso, TOP_UP_GBP, type LoadedConfig } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { EventStore } from '../deps.js';
import { run, type DbOrTx } from '../db/run.js';

type Limits = LoadedConfig['config']['limits'];

/** A workspace's spend and budget, in pounds. */
export interface Budget {
  spent_gbp: number;
  budget_gbp: number;
}

/** The workspace's spend as one SQL value, for `sid` (an expression naming its session id). */
const SPEND_SQL = (sid: string) =>
  `(SELECT COALESCE(SUM(g.cost_gbp), 0) FROM gateway_calls g WHERE g.session_id = ${sid})`;

/** What the workspace's model calls have cost in pounds, as stored when each was made (an unpriced call counts as nothing). */
export async function spendGbp(x: DbOrTx, sessionId: string): Promise<number> {
  const r = await run(x, { sql: `SELECT ${SPEND_SQL('?')} AS gbp`, args: [sessionId] });
  return Number(r.rows[0]?.gbp ?? 0);
}

/** What the workspace's top-ups add up to (0 for none). */
export async function topUpsGbp(x: DbOrTx, sessionId: string): Promise<number> {
  const r = await run(x, { sql: 'SELECT COALESCE(SUM(amount_gbp), 0) AS gbp FROM budget_topups WHERE session_id = ?', args: [sessionId] });
  return Number(r.rows[0]?.gbp ?? 0);
}

/** The workspace's budget: the config's, plus its top-ups. */
export async function budgetGbp(x: DbOrTx, limits: Limits, sessionId: string): Promise<number> {
  return limits.budget_gbp + (await topUpsGbp(x, sessionId));
}

/** The workspace's spend and budget together. */
export async function budgetOf(x: DbOrTx, limits: Limits, sessionId: string): Promise<Budget> {
  // One after the other: `x` may be a transaction.
  const spent_gbp = await spendGbp(x, sessionId);
  return { spent_gbp, budget_gbp: await budgetGbp(x, limits, sessionId) };
}

/** Every workspace's spend and budget, by session id, in two queries (the /admin list). */
export async function allBudgets(db: Db, limits: Limits): Promise<Map<string, Budget>> {
  const r = await db.execute(
    `SELECT s.session_id AS id,
            ${SPEND_SQL('s.session_id')} AS spent,
            (SELECT COALESCE(SUM(b.amount_gbp), 0) FROM budget_topups b WHERE b.session_id = s.session_id) AS topups
     FROM sessions s`,
  );
  return new Map(r.rows.map((row) => [String(row.id), { spent_gbp: Number(row.spent), budget_gbp: limits.budget_gbp + Number(row.topups) }]));
}

/**
 * Adds TOP_UP_GBP to the workspace's budget and logs one `budget_update`, in one transaction.
 * The event names the admin's account (`accountId`) when signed in with one. Null for an unknown workspace.
 */
export async function addTopUp(db: Db, events: EventStore, limits: Limits, sessionId: string, via: 'account' | 'password', accountId?: string): Promise<Budget | null> {
  const account = accountId ? { account_id: accountId } : {};
  return db.transaction(async (tx) => {
    const s = await tx.execute({ sql: 'SELECT 1 FROM sessions WHERE session_id = ?', args: [sessionId] });
    if (!s.rows.length) return null;
    const before = await budgetOf(tx, limits, sessionId);
    const now = nowIso();
    await tx.execute({ sql: 'INSERT INTO budget_topups (id, session_id, amount_gbp, at, via) VALUES (?, ?, ?, ?, ?)', args: [newUlid(), sessionId, TOP_UP_GBP, now, via] });
    const after = before.budget_gbp + TOP_UP_GBP;
    await events.appendServer(
      sessionId,
      'budget_update',
      { amount_gbp: TOP_UP_GBP, budget_before_gbp: before.budget_gbp, budget_after_gbp: after, spent_gbp: before.spent_gbp, via, ...account },
      { client_ts: now, focus_pane: 'none', doc_id: null, thread_id: null },
      tx,
    );
    return { spent_gbp: before.spent_gbp, budget_gbp: after };
  });
}
