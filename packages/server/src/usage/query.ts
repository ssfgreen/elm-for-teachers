/** Reads for the Usage section: the workspace's model calls with their stored costs, the teacher's and pupils' asks in the reader. */
import type { CostedCall } from '@edw/shared';
import type { Db } from '../db/client.js';

const CALLS = `SELECT at, cost_gbp FROM gateway_calls WHERE session_id = ?{since}
  UNION ALL SELECT created_at AS at, cost_gbp FROM reader_asks WHERE session_id = ?{askSince}`;

/** The workspace's calls at or after `since` (an ISO instant), or all of them; `cost_gbp` is null for a call from before costs were stored. */
export async function costedCalls(db: Db, sessionId: string, since: string | null): Promise<CostedCall[]> {
  const sql = CALLS.replace('{since}', since ? ' AND at >= ?' : '').replace('{askSince}', since ? ' AND created_at >= ?' : '');
  const r = await db.execute(sql, since ? [sessionId, since, sessionId, since] : [sessionId, sessionId]);
  return r.rows.map((row) => ({ at: String(row.at), cost_gbp: row.cost_gbp == null ? null : Number(row.cost_gbp) }));
}
