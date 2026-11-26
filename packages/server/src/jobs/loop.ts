/**
 * The worker's loop: run due jobs one after another, and when none is due wait `idleMs`
 * before looking again. Stops, after the job in hand, once `signal` is aborted. An error
 * reaching the database is logged and waited out, not fatal: the job stays claimed and is
 * taken again when its lock runs out.
 */
import type { Db } from '../db/client.js';
import { runOne, type RunOptions } from './runner.js';

export interface LoopOptions extends RunOptions {
  signal: AbortSignal;
  idleMs?: number;
  log?: { info(msg: string): void; error(msg: string, err?: unknown): void };
  /** Waits `ms`, or less when the signal aborts (tests replace it). */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export const IDLE_MS = 5_000;

const sleepFor = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done);
  });

export async function workLoop(db: Db, opts: LoopOptions): Promise<void> {
  const log = opts.log ?? { info: (m) => console.log(m), error: (m, e) => console.error(m, e) };
  const sleep = opts.sleep ?? sleepFor;
  const idleMs = opts.idleMs ?? IDLE_MS;
  while (!opts.signal.aborted) {
    try {
      const ran = await runOne(db, opts);
      if (ran) {
        log.info(`job ${ran.id} (${ran.kind}): ${ran.outcome}`);
        continue;
      }
    } catch (err) {
      log.error('jobs: could not run a job', err);
    }
    await sleep(idleMs, opts.signal);
  }
}
