import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db/client.js';
import { serialiseTransactions } from '../serial-db.js';
import { tempDb, type TempDb } from '../test-helpers.js';
import { backoffMs, claim, enqueue, fail, finish, getJob } from './store.js';

const T0 = new Date('2026-11-21T10:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const LOCK = 60_000;
const opts = (now: Date, max = 3) => ({ kinds: ['noop'], now, lockMs: LOCK, maxAttempts: () => max });

let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
});
afterEach(() => t.cleanup());

describe('jobs store', () => {
  it('claims the oldest due job, and none that is not due yet', async () => {
    const later = await enqueue(t.db, 'noop', { n: 2 }, { now: T0, runAfter: at(5_000) });
    const first = await enqueue(t.db, 'noop', { n: 1 }, { now: T0 });
    const job = await claim(t.db, opts(T0));
    expect(job).toMatchObject({ id: first, status: 'running', attempts: 1, payload: { n: 1 }, locked_until: at(LOCK).toISOString() });
    expect(await claim(t.db, opts(T0))).toBeNull();
    expect((await claim(t.db, opts(at(5_000))))?.id).toBe(later);
  });

  it('never gives two claimers the same job, from two connections to one database', async () => {
    // Two connections stand for two app copies; each queues its own transactions, as each copy does.
    const url = (await t.db.execute('PRAGMA database_list')).rows[0]!.file;
    const other: Db = serialiseTransactions(openDb({ url: `file:${path.resolve(String(url))}` }));
    try {
      const ids = new Set<string>();
      for (let i = 0; i < 30; i++) ids.add(await enqueue(t.db, 'noop', i, { now: T0 }));
      const got: string[] = [];
      const drain = async (db: Db) => {
        for (;;) {
          const job = await claim(db, opts(T0));
          if (!job) return;
          got.push(job.id);
        }
      };
      await Promise.all([drain(t.db), drain(other), drain(t.db), drain(other)]);
      expect(got.length).toBe(30);
      expect(new Set(got)).toEqual(ids);
    } finally {
      other.close();
    }
  });

  it('retries a failed job after its backoff, and gives it up after the limit', async () => {
    const id = await enqueue(t.db, 'noop', null, { now: T0 });
    let now = T0;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const job = await claim(t.db, opts(now));
      expect(job).toMatchObject({ id, attempts: attempt });
      const outcome = await fail(t.db, job!, `boom ${attempt}`, { maxAttempts: 3, now });
      if (attempt < 3) {
        expect(outcome).toBe('retry');
        const wait = backoffMs(attempt);
        expect(await claim(t.db, opts(new Date(now.getTime() + wait - 1)))).toBeNull();
        now = new Date(now.getTime() + wait);
      } else {
        expect(outcome).toBe('failed');
      }
    }
    expect(await getJob(t.db, id)).toMatchObject({ status: 'failed', attempts: 3, last_error: 'boom 3', finished_at: now.toISOString() });
    expect(await claim(t.db, opts(at(10 * 3_600_000)))).toBeNull();
  });

  it('claims again a job whose lock ran out, and the first claim can no longer finish it', async () => {
    const id = await enqueue(t.db, 'noop', null, { now: T0 });
    const first = await claim(t.db, opts(T0));
    expect(await claim(t.db, opts(at(LOCK - 1)))).toBeNull();
    const second = await claim(t.db, opts(at(LOCK)));
    expect(second).toMatchObject({ id, attempts: 2 });
    expect(await finish(t.db, first!)).toBe(false);
    expect(await fail(t.db, first!, 'late', { maxAttempts: 3 })).toBe('lost');
    expect(await finish(t.db, second!, at(LOCK + 1))).toBe(true);
    expect(await getJob(t.db, id)).toMatchObject({ status: 'done', locked_until: null, finished_at: at(LOCK + 1).toISOString() });
  });

  it('gives up a job whose lock ran out on its last attempt, rather than run it again, and says so', async () => {
    const id = await enqueue(t.db, 'noop', null, { now: T0 });
    await fail(t.db, (await claim(t.db, opts(T0, 2)))!, 'ELM did not answer', { maxAttempts: 2, now: T0 });
    await claim(t.db, opts(at(backoffMs(1)), 2));
    expect(await claim(t.db, opts(at(backoffMs(1) + LOCK), 2))).toBeNull();
    expect(await getJob(t.db, id)).toMatchObject({ status: 'failed', attempts: 2, last_error: 'gave up: its lock ran out on the last attempt (before that: ELM did not answer)' });
  });

  it('leaves a job of a kind this copy does not know queued, for a copy that does', async () => {
    const marking = await enqueue(t.db, 'mark_homework', null, { now: T0 });
    const noop = await enqueue(t.db, 'noop', null, { now: T0 });
    expect((await claim(t.db, opts(T0)))?.id).toBe(noop);
    expect(await claim(t.db, opts(T0))).toBeNull();
    expect(await claim(t.db, { ...opts(T0), kinds: [] })).toBeNull();
    expect(await getJob(t.db, marking)).toMatchObject({ status: 'queued', attempts: 0 });
    expect((await claim(t.db, { ...opts(T0), kinds: ['noop', 'mark_homework'] }))?.id).toBe(marking);
  });

  it('gives up only the job whose payload is not JSON, and claims the next', async () => {
    const bad = await enqueue(t.db, 'noop', null, { now: T0 });
    await t.db.execute("UPDATE jobs SET payload = '{not json' WHERE id = ?", [bad]);
    const good = await enqueue(t.db, 'noop', { ok: true }, { now: at(1) });
    expect(await claim(t.db, opts(at(1)))).toMatchObject({ id: good, payload: { ok: true } });
    expect(await getJob(t.db, bad)).toMatchObject({ status: 'failed', attempts: 1, payload: '{not json' });
    expect((await getJob(t.db, bad))?.last_error).toMatch(/^gave up: its payload is not JSON/);
  });

  it('gives up any number of jobs at the front and still claims the one behind them', async () => {
    for (let i = 0; i < 25; i++) {
      const id = await enqueue(t.db, 'noop', i, { now: T0 });
      await t.db.execute("UPDATE jobs SET payload = 'x' WHERE id = ?", [id]);
    }
    const good = await enqueue(t.db, 'noop', 'fine', { now: at(1) });
    expect((await claim(t.db, opts(at(1))))?.id).toBe(good);
  });

  it('backs off 30 s, doubling, at most an hour', () => {
    expect([1, 2, 3, 20].map(backoffMs)).toEqual([30_000, 60_000, 120_000, 3_600_000]);
  });
});
