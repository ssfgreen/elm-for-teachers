import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type GatewayCall, type StoredTurn } from '@edw/shared';
import { newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { loadGatewayCalls, loadTurns, saveGatewayCall, saveTurn } from './history.js';

let t: TempDb;
beforeAll(async () => {
  t = await tempDb();
});
afterAll(() => t.cleanup());

function storedTurn(i: number, thread_id: string, doc_id: string): StoredTurn {
  return {
    turn_id: `t_${i}`,
    thread_id,
    doc_id,
    prompt: `prompt ${i}`,
    anchor: null,
    response_text: `reply ${i}`,
    operations: [{ op: 'delete', id: '01HXXXXXXXXXXXXXXXXXXXXXXX' }],
    rewritten_assistant_content: `reply ${i}`,
    at: '2026-10-29T12:00:00.000Z',
  };
}

function call(sid: string, thread_id: string, doc_id: string, turn: string, error: string | null = null): GatewayCall {
  return {
    gateway_call_id: `gw_${newUlid()}`,
    session_id: sid,
    thread_id,
    doc_id,
    turn_id: turn,
    model: 'mock',
    temperature: 1,
    system_prompt_hash: 'h',
    serialized_canvas: 'docs',
    trimmed_history: [{ role: 'user', content: 'hi' }],
    running_summary: null,
    raw_response: error ? null : 'raw',
    parsed_message: error ? null : 'msg',
    parsed_operations: [],
    dropped: [],
    latency_ms: 3,
    input_tokens: null,
    output_tokens: null,
    provider_request_id: null,
    error,
    at: '2026-10-29T12:00:00.000Z',
  };
}

describe('chat history persistence', () => {
  it('saves turns and loads them per thread, or for the whole session, ordered by seq', async () => {
    const deps = testDeps(t.db);
    const { session, thread, doc } = await newWorkspace(deps);
    const other = await deps.threads.create(session.session_id, { client_ts: '2026-10-29T12:00:00.000Z', focus_pane: 'none', doc_id: null, thread_id: null });
    await t.db.transaction(async (tx) => {
      await saveTurn(tx, session.session_id, storedTurn(1, thread.id, doc.id), 1);
      await saveTurn(tx, session.session_id, storedTurn(9, other.thread.id, other.doc.id), 2);
      await saveTurn(tx, session.session_id, storedTurn(2, thread.id, doc.id), 3);
    });
    expect((await loadTurns(t.db, session.session_id, thread.id)).map((x) => x.turn_id)).toEqual(['t_1', 't_2']);
    expect((await loadTurns(t.db, session.session_id, other.thread.id)).map((x) => x.turn_id)).toEqual(['t_9']);
    expect((await loadTurns(t.db, session.session_id)).map((x) => x.turn_id)).toEqual(['t_1', 't_9', 't_2']);
    expect((await t.db.transaction((tx) => loadTurns(tx, session.session_id, thread.id)))[0]).toEqual(storedTurn(1, thread.id, doc.id));
  });

  it('saves gateway calls and loads them per session in insertion order', async () => {
    const deps = testDeps(t.db);
    const { session, thread, doc } = await newWorkspace(deps);
    const a = call(session.session_id, thread.id, doc.id, 't_a');
    const b = call(session.session_id, thread.id, doc.id, 't_b', 'boom');
    await t.db.transaction(async (tx) => {
      await saveGatewayCall(tx, a, {});
      await saveGatewayCall(tx, b, {});
    });
    expect(await loadGatewayCalls(t.db, session.session_id)).toEqual([a, b]);
  });
});
