/**
 * Run due jobs: one at a time with `runOne`, or for as long as a time budget allows with
 * `runFor` (the cron route). The worker (worker.ts, loop.ts) calls `runOne` in a loop.
 */
import type { Db } from '../db/client.js';
import { maxAttemptsFor, type JobKinds } from './kinds.js';
import { claim, fail, finish } from './store.js';

/** How long a claim holds: longer than any job should take, short enough to recover a stopped copy. */
export const LOCK_MS = 10 * 60_000;

export type Outcome = 'done' | 'retry' | 'failed' | 'lost';

export interface RunOptions {
  kinds: JobKinds;
  lockMs?: number;
  /** The clock (tests). */
  now?: () => Date;
}

/** Claim and run one due job; null when none is due. */
export async function runOne(db: Db, opts: RunOptions): Promise<{ id: string; kind: string; outcome: Outcome } | null> {
  const now = opts.now ?? (() => new Date());
  const job = await claim(db, { kinds: Object.keys(opts.kinds), now: now(), lockMs: opts.lockMs ?? LOCK_MS, maxAttempts: (k) => maxAttemptsFor(opts.kinds, k) });
  if (!job) return null;
  const kind = opts.kinds[job.kind];
  const maxAttempts = maxAttemptsFor(opts.kinds, job.kind);
  if (!kind) {
    // Not reached: claim takes only kinds this copy knows.
    const outcome = await fail(db, job, `no handler for job kind "${job.kind}"`, { maxAttempts, giveUp: true, now: now() });
    return { id: job.id, kind: job.kind, outcome };
  }
  try {
    await kind.run(job.payload, { db, attempt: job.attempts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { id: job.id, kind: job.kind, outcome: await fail(db, job, message, { maxAttempts, now: now() }) };
  }
  return { id: job.id, kind: job.kind, outcome: (await finish(db, job, now())) ? 'done' : 'lost' };
}

export type Tally = Record<Outcome, number>;

/** Run due jobs until none is due or `budgetMs` has gone; a job started in time runs to its end. */
export async function runFor(db: Db, budgetMs: number, opts: RunOptions): Promise<Tally> {
  const now = opts.now ?? (() => new Date());
  const stop = now().getTime() + budgetMs;
  const tally: Tally = { done: 0, retry: 0, failed: 0, lost: 0 };
  while (now().getTime() < stop) {
    const ran = await runOne(db, opts);
    if (!ran) break;
    tally[ran.outcome]++;
  }
  return tally;
}
