import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newUlid, nowIso } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { ServerEnvelope } from '../deps.js';
import { focusEvent, tempDb, type TempDb } from '../test-helpers.js';
import { createEventStore } from './store.js';

let t: TempDb;
let db: Db;
const S = 'S1';
const D = newUlid();
const T = newUlid();
const env: ServerEnvelope = { client_ts: nowIso(), focus_pane: 'none', doc_id: D, thread_id: T };

async function insertSession(id: string) {
  const now = nowIso();
  await db.execute(
    `INSERT INTO sessions (session_id, label, participant_token, config_hash, system_prompt_hash, created_at, updated_at) VALUES (?, 'x', ?, 'h', 'h', ?, ?)`,
    [id, `tok-${id}`, now, now],
  );
}

beforeEach(async () => {
  t = await tempDb();
  db = t.db;
  await insertSession(S);
  await insertSession('S2');
});
afterEach(() => t.cleanup());

describe('appendClient', () => {
  it('assigns gapless seq across batches, stamps server_ts and keeps the doc and thread context', async () => {
    const store = createEventStore(db);
    const a = await store.appendClient(S, [focusEvent({ doc_id: D, thread_id: T }), focusEvent(), focusEvent()]);
    expect(a).toMatchObject({ accepted: 3, last_seq: 3 });
    const b = await store.appendClient(S, [focusEvent(), focusEvent()]);
    expect(b.stored.map((e) => e.seq)).toEqual([4, 5]);
    const all = await store.list(S);
    expect(all.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(all[0]).toMatchObject({ doc_id: D, thread_id: T, session_id: S });
    expect(all[1]).toMatchObject({ doc_id: null, thread_id: null });
    expect((await store.appendClient('S2', [focusEvent()])).stored[0]?.seq).toBe(1);
  });

  it('de-duplicates by event_id, both across and within batches', async () => {
    const store = createEventStore(db);
    const batch = [focusEvent(), focusEvent()];
    expect(await store.appendClient(S, batch)).toMatchObject({ accepted: 2, last_seq: 2 });
    expect(await store.appendClient(S, batch)).toMatchObject({ accepted: 0, last_seq: 2, stored: [] });
    const extra = focusEvent();
    const mixed = await store.appendClient(S, [batch[0]!, extra, extra]);
    expect(mixed.accepted).toBe(1);
    expect(mixed.stored[0]).toMatchObject({ event_id: extra.event_id, seq: 3 });
  });

  it('serialises concurrent batches without seq collisions', async () => {
    const store = createEventStore(db);
    await Promise.all([store.appendClient(S, [focusEvent(), focusEvent()]), store.appendClient(S, [focusEvent(), focusEvent()]), store.appendClient(S, [focusEvent()])]);
    expect((await store.list(S)).map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it('runs hooks per stored event inside the tx, in order, and rolls the batch back if one throws', async () => {
    const store = createEventStore(db);
    const calls: string[] = [];
    store.addHook(async (e, tx) => {
      calls.push(`a${e.seq}`);
      const r = await tx.execute({ sql: 'SELECT COUNT(*) AS n FROM events WHERE session_id = ?', args: [S] });
      expect(Number(r.rows[0]?.n)).toBe(e.seq);
    });
    store.addHook(async (e) => {
      calls.push(`b${e.seq}`);
      if (e.seq === 3) throw new Error('boom');
    });
    await store.appendClient(S, [focusEvent(), focusEvent()]);
    expect(calls).toEqual(['a1', 'b1', 'a2', 'b2']);
    await expect(store.appendClient(S, [focusEvent()])).rejects.toThrow('boom');
    expect(await store.lastSeq(S)).toBe(2);
  });

  it('lets a hook append server events in the same tx, interleaved by seq', async () => {
    const store = createEventStore(db);
    store.addHook(async (e, tx) => {
      if (e.kind === 'focus') await store.appendServer(S, 'error', { source: 'server', message: `after ${e.seq}` }, env, tx);
    });
    const res = await store.appendClient(S, [focusEvent(), focusEvent()]);
    expect(res.stored.map((e) => e.seq)).toEqual([1, 3]);
    expect((await store.list(S)).map((e) => `${e.kind}:${e.seq}`)).toEqual(['focus:1', 'error:2', 'focus:3', 'error:4']);
  });
});

describe('appendServer', () => {
  it('appends with the next seq and the envelope, uses a caller tx and is rolled back with it', async () => {
    const store = createEventStore(db);
    await store.appendClient(S, [focusEvent()]);
    const e = await store.appendServer(S, 'doc_rename', { doc_id: D, name: 'Similes' }, env);
    expect(e).toMatchObject({ seq: 2, kind: 'doc_rename', focus_pane: 'none', doc_id: D, thread_id: T });
    const fixed = newUlid();
    expect((await store.appendServer(S, 'doc_open', { doc_id: D }, { ...env, event_id: fixed })).event_id).toBe(fixed);
    await expect(
      db.transaction(async (tx) => {
        await store.appendServer(S, 'doc_open', { doc_id: D }, env, tx);
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    expect(await store.lastSeq(S)).toBe(3);
  });

  it('does not run hooks', async () => {
    const store = createEventStore(db);
    const hook = vi.fn(async () => undefined);
    store.addHook(hook);
    await store.appendServer(S, 'doc_open', { doc_id: D }, env);
    expect(hook).not.toHaveBeenCalled();
  });
});

describe('list', () => {
  it('filters by kinds and seq range', async () => {
    const store = createEventStore(db);
    await store.appendClient(S, [focusEvent(), focusEvent()]);
    await store.appendServer(S, 'doc_open', { doc_id: D }, env);
    await store.appendClient(S, [focusEvent(), focusEvent()]);
    expect((await store.list(S, { kinds: ['doc_open'] })).map((e) => e.seq)).toEqual([3]);
    expect((await store.list(S, { fromSeq: 2, toSeq: 4 })).map((e) => e.seq)).toEqual([2, 3, 4]);
    expect((await store.list(S, { fromSeq: 2, kinds: ['focus'] })).map((e) => e.seq)).toEqual([2, 4, 5]);
    expect(await store.list(S, { kinds: [] })).toEqual([]);
    expect(await store.lastSeq('nope')).toBe(0);
  });
});

describe('countSince', () => {
  it('counts one session\'s events of one kind after a time', async () => {
    const store = createEventStore(db);
    const before = new Date(Date.now() - 1000).toISOString();
    await store.appendServer(S, 'chat_stop', { turn_id: newUlid() } as never, env);
    await store.appendServer(S, 'chat_stop', { turn_id: newUlid() } as never, env);
    await store.appendServer('S2', 'chat_stop', { turn_id: newUlid() } as never, env);
    await store.appendClient(S, [focusEvent()]);
    expect(await store.countSince(S, 'chat_stop', before)).toBe(2);
    expect(await store.countSince(S, 'chat_stop', new Date(Date.now() + 1000).toISOString())).toBe(0);
    expect(await store.countSince('S2', 'chat_stop', before)).toBe(1);
  });
});
