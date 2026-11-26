import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tempDb, type TempDb } from '../test-helpers.js';
import { JOB_KINDS, type JobKinds } from './kinds.js';
import { workLoop } from './loop.js';
import { runFor, runOne } from './runner.js';
import { enqueue, getJob } from './store.js';

let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
});
afterEach(() => t.cleanup());

describe('jobs runner', () => {
  it('runs a noop job to done', async () => {
    const id = await enqueue(t.db, 'noop', null);
    expect(await runOne(t.db, { kinds: JOB_KINDS })).toEqual({ id, kind: 'noop', outcome: 'done' });
    expect((await getJob(t.db, id))?.status).toBe('done');
    expect(await runOne(t.db, { kinds: JOB_KINDS })).toBeNull();
  });

  it('queues a job that throws again, with its error, and leaves one of an unknown kind queued', async () => {
    const kinds: JobKinds = { flaky: { run: async () => { throw new Error('ELM did not answer'); }, maxAttempts: 2 } };
    const flaky = await enqueue(t.db, 'flaky', null);
    expect((await runOne(t.db, { kinds }))?.outcome).toBe('retry');
    expect(await getJob(t.db, flaky)).toMatchObject({ status: 'queued', last_error: 'ELM did not answer' });
    const unknown = await enqueue(t.db, 'mark_homework', null);
    expect(await runOne(t.db, { kinds })).toBeNull();
    expect(await getJob(t.db, unknown)).toMatchObject({ status: 'queued', attempts: 0, last_error: null });
  });

  it('runFor stops when nothing is due, or when its time is up', async () => {
    for (let i = 0; i < 3; i++) await enqueue(t.db, 'noop', i);
    expect(await runFor(t.db, 60_000, { kinds: JOB_KINDS })).toEqual({ done: 3, retry: 0, failed: 0, lost: 0 });
    for (let i = 0; i < 3; i++) await enqueue(t.db, 'noop', i);
    let clock = Date.now();
    const kinds: JobKinds = { noop: { run: async () => { clock += 1_000; } } };
    expect((await runFor(t.db, 1_500, { kinds, now: () => new Date(clock) })).done).toBe(2);
  });
});

describe('jobs worker loop', () => {
  it('runs jobs, waits when none is due, and stops when told', async () => {
    const ids = [await enqueue(t.db, 'noop', 1), await enqueue(t.db, 'noop', 2)];
    const stop = new AbortController();
    const log = { info: vi.fn(), error: vi.fn() };
    const sleep = vi.fn(async () => stop.abort());
    await workLoop(t.db, { kinds: JOB_KINDS, signal: stop.signal, sleep, log });
    expect(sleep).toHaveBeenCalledTimes(1);
    for (const id of ids) expect((await getJob(t.db, id))?.status).toBe('done');
    expect(log.info).toHaveBeenCalledTimes(2);
  });

  it('logs a database error and carries on', async () => {
    const stop = new AbortController();
    const log = { info: vi.fn(), error: vi.fn() };
    let calls = 0;
    const db = { ...t.db, execute: async () => { calls++; throw new Error('database is down'); } };
    await workLoop(db, { kinds: JOB_KINDS, signal: stop.signal, log, sleep: async () => { if (calls >= 2) stop.abort(); } });
    expect(log.error).toHaveBeenCalledTimes(2);
  });
});
