/**
 * Persistence for the chat history (`chat_turns`) and the per-call log (`gateway_calls`).
 * Payload columns hold the shared `StoredTurn` / `GatewayCall` objects as JSON.
 */
import type { Transaction } from '../db/types.js';
import { GatewayCall, StoredTurn, type ChatUsage } from '@edw/shared';
import { callCostGbp, type Pricing } from './calls.js';
import { run, type DbOrTx } from '../db/run.js';

/** A thread's turns, oldest first; every turn of the session when `threadId` is omitted (export). */
export async function loadTurns(x: DbOrTx, sessionId: string, threadId?: string): Promise<StoredTurn[]> {
  const r = await run(
    x,
    threadId
      ? { sql: 'SELECT payload FROM chat_turns WHERE session_id = ? AND thread_id = ? ORDER BY seq', args: [sessionId, threadId] }
      : { sql: 'SELECT payload FROM chat_turns WHERE session_id = ? ORDER BY seq', args: [sessionId] },
  );
  return r.rows.map((row) => StoredTurn.parse(JSON.parse(String(row.payload))));
}

/** `seq` is the turn's position in the session (all threads), so export order is send order. */
export async function saveTurn(tx: Transaction, sessionId: string, turn: StoredTurn, seq: number): Promise<void> {
  await tx.execute({
    sql: 'INSERT INTO chat_turns (session_id, thread_id, turn_id, seq, payload) VALUES (?, ?, ?, ?, ?)',
    args: [sessionId, turn.thread_id, turn.turn_id, seq, JSON.stringify(turn)],
  });
}

/** Rewrites a stored turn's payload: Spyglass adds its flags just after the commit. */
export async function updateTurn(tx: Transaction, sessionId: string, turn: StoredTurn): Promise<void> {
  await tx.execute({ sql: 'UPDATE chat_turns SET payload = ? WHERE session_id = ? AND turn_id = ?', args: [JSON.stringify(turn), sessionId, turn.turn_id] });
}

/** One turn by its id. */
export async function loadTurn(x: DbOrTx, sessionId: string, turnId: string): Promise<StoredTurn | null> {
  const r = await run(x, { sql: 'SELECT payload FROM chat_turns WHERE session_id = ? AND turn_id = ?', args: [sessionId, turnId] });
  const row = r.rows[0];
  return row ? StoredTurn.parse(JSON.parse(String(row.payload))) : null;
}

/**
 * Logs a call with its cost in pounds at `pricing`, the config in force now (`cost_gbp`, which
 * the budget adds up). The cost is never worked out again, so a later price change leaves it.
 * `unbilled`: the call's worst cost, stored instead when it has no token counts but may have
 * run at the provider (stopped, timed out, a broken stream, counts left out). Leave it out for
 * a call that never ran: that costs nothing.
 */
export async function saveGatewayCall(tx: Transaction, call: GatewayCall, pricing: Pricing, unbilled?: number | null): Promise<void> {
  const counted = call.input_tokens != null || call.output_tokens != null;
  const cost = !counted && unbilled != null ? unbilled : callCostGbp(call, pricing);
  await tx.execute({
    sql: `INSERT INTO gateway_calls (gateway_call_id, session_id, thread_id, turn_id, payload, at, cost_gbp)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [call.gateway_call_id, call.session_id, call.thread_id, call.turn_id, JSON.stringify(call), call.at, cost],
  });
}

export async function loadGatewayCalls(x: DbOrTx, sessionId: string): Promise<GatewayCall[]> {
  const r = await run(x, {
    sql: 'SELECT payload FROM gateway_calls WHERE session_id = ? ORDER BY rowid',
    args: [sessionId],
  });
  return r.rows.map((row) => GatewayCall.parse(JSON.parse(String(row.payload))));
}

/** A session's stored calls as their raw JSON, for rewriting in place (the pupil scrub). */
export async function gatewayCallPayloads(x: DbOrTx, sessionId: string): Promise<{ id: string; payload: string }[]> {
  const r = await run(x, { sql: 'SELECT gateway_call_id, payload FROM gateway_calls WHERE session_id = ? ORDER BY rowid', args: [sessionId] });
  return r.rows.map((row) => ({ id: String(row.gateway_call_id), payload: String(row.payload) }));
}

export async function setGatewayCallPayload(tx: Transaction, id: string, payload: string): Promise<void> {
  await tx.execute({ sql: 'UPDATE gateway_calls SET payload = ? WHERE gateway_call_id = ?', args: [payload, id] });
}

/** Every session with at least one stored call. */
export async function sessionsWithCalls(x: DbOrTx): Promise<string[]> {
  const r = await run(x, { sql: 'SELECT DISTINCT session_id FROM gateway_calls ORDER BY session_id', args: [] });
  return r.rows.map((row) => String(row.session_id));
}

/**
 * A thread's model use for the counter under the chat box: its calls' tokens (failed and summary
 * calls too: they are billed), and their stored costs, the same figures the budget adds up
 * (budget/store.ts `spendGbp`). A call from before costs were stored (null) counts as nothing.
 */
export async function threadCallUsage(x: DbOrTx, sessionId: string, threadId: string): Promise<ChatUsage> {
  const r = await run(x, {
    sql: `SELECT COALESCE(SUM(json_extract(payload, '$.input_tokens')), 0) AS i, COALESCE(SUM(json_extract(payload, '$.output_tokens')), 0) AS o,
                 COALESCE(SUM(cost_gbp), 0) AS gbp
          FROM gateway_calls WHERE session_id = ? AND thread_id = ?`,
    args: [sessionId, threadId],
  });
  const row = r.rows[0];
  return { input_tokens: Number(row?.i ?? 0), output_tokens: Number(row?.o ?? 0), gbp: Number(row?.gbp ?? 0) };
}

/** Whether the teacher pressed Stop on this turn (a `chat_stop` event, which any server instance may have logged). */
export async function stopRequested(x: DbOrTx, sessionId: string, turnId: string): Promise<boolean> {
  const r = await run(x, {
    sql: `SELECT 1 FROM events WHERE session_id = ? AND kind = 'chat_stop' AND json_extract(payload, '$.turn_id') = ? LIMIT 1`,
    args: [sessionId, turnId],
  });
  return r.rows.length > 0;
}

/**
 * A session's turns that reached the model (failed ones too: they are billed) since `since`, with
 * the time of the oldest of those. A turn counts once however many model calls (agent steps) it made.
 */
export async function countTurns(x: DbOrTx, sessionId: string, since: string): Promise<{ recent: number; oldestRecent: string | null }> {
  const r = await run(x, {
    sql: `SELECT COUNT(DISTINCT CASE WHEN at >= ? THEN turn_id END) AS recent, MIN(CASE WHEN at >= ? THEN at END) AS oldest
          FROM gateway_calls WHERE session_id = ?`,
    args: [since, since, sessionId],
  });
  const row = r.rows[0];
  return { recent: Number(row?.recent ?? 0), oldestRecent: row?.oldest == null ? null : String(row.oldest) };
}

/** Calls whose provider request or output parsing failed. */
export async function countFailedCalls(x: DbOrTx, sessionId: string): Promise<number> {
  const r = await run(x, {
    sql: `SELECT COUNT(*) AS n FROM gateway_calls
          WHERE session_id = ? AND json_extract(payload, '$.error') IS NOT NULL`,
    args: [sessionId],
  });
  return Number(r.rows[0]?.n ?? 0);
}
