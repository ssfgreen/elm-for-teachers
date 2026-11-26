/**
 * The jobs table (migration 0039): enqueue, claim, finish and fail. Safe with several app
 * copies on one database: a claim is a compare-and-set on the row, so of two copies that
 * pick the same job only one gets it. A claim is named by the job's id and its attempt
 * number, so a copy whose lock ran out cannot finish or fail a job another copy now holds.
 * Plain single statements only (no transaction, no SQLite-only SQL), so it ports to PostgreSQL.
 */
import { newUlid } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { Row } from '../db/types.js';

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface Job {
  id: string;
  kind: string;
  payload: unknown;
  status: JobStatus;
  /** How many times it has been claimed, this claim included. */
  attempts: number;
  run_after: string;
  locked_until: string | null;
  last_error: string | null;
  created_at: string;
  finished_at: string | null;
}

/** Which claim of a job: its id and the attempt that claim made. */
export interface Claim {
  id: string;
  attempts: number;
}

/** How long to wait before attempt `attempts + 1`: 30 s, doubling, at most an hour. */
export function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 3_600_000);
}

/** The row with its payload still as stored: it is parsed only once the job is claimed. */
function toJob(r: Row): Job {
  return {
    id: String(r.id),
    kind: String(r.kind),
    payload: String(r.payload),
    status: String(r.status) as JobStatus,
    attempts: Number(r.attempts),
    run_after: String(r.run_after),
    locked_until: r.locked_until === null ? null : String(r.locked_until),
    last_error: r.last_error === null ? null : String(r.last_error),
    created_at: String(r.created_at),
    finished_at: r.finished_at === null ? null : String(r.finished_at),
  };
}

const iso = (d: Date) => d.toISOString();

export async function enqueue(db: Db, kind: string, payload: unknown, opts: { runAfter?: Date; now?: Date } = {}): Promise<string> {
  const now = opts.now ?? new Date();
  const id = newUlid();
  await db.execute(
    'INSERT INTO jobs (id, kind, payload, status, attempts, run_after, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
    [id, kind, JSON.stringify(payload ?? null), 'queued', iso(opts.runAfter ?? now), iso(now)],
  );
  return id;
}

export async function getJob(db: Db, id: string): Promise<Job | null> {
  const r = (await db.execute('SELECT * FROM jobs WHERE id = ?', [id])).rows[0];
  if (!r) return null;
  const job = toJob(r);
  try {
    return { ...job, payload: JSON.parse(String(job.payload)) as unknown };
  } catch {
    return job;
  }
}

/** A due job: queued and past its run_after, or running with its lock run out. Oldest first. */
const DUE = `(status = 'queued' AND run_after <= ?) OR (status = 'running' AND locked_until <= ?)`;

export interface ClaimOptions {
  /** The kinds this copy can run: a job of any other kind is left queued for a copy that can. */
  kinds: readonly string[];
  now?: Date;
  /** How long the claim holds before another copy may take the job again. */
  lockMs: number;
  /** A job claimed this many times already is given up rather than run again. */
  maxAttempts: (kind: string) => number;
}

/**
 * Take the oldest due job of one of `kinds` and lock it, or null when none is due. Given up
 * here rather than run: a job whose lock ran out after its last allowed attempt, and one
 * whose payload is not JSON. Only lost races count towards the 20 tries; a give-up does not.
 */
export async function claim(db: Db, opts: ClaimOptions): Promise<Job | null> {
  if (!opts.kinds.length) return null;
  const inKinds = `kind IN (${opts.kinds.map(() => '?').join(', ')})`;
  for (let lost = 0; lost < 20; ) {
    const now = opts.now ?? new Date();
    const at = iso(now);
    const row = (await db.execute(`SELECT * FROM jobs WHERE ${inKinds} AND (${DUE}) ORDER BY run_after, id LIMIT 1`, [...opts.kinds, at, at])).rows[0];
    if (!row) return null;
    const seen = toJob(row);
    // The status and attempt count as read: every claim adds an attempt, so only one copy's update can match.
    const same = 'id = ? AND status = ? AND attempts = ?';
    const sameArgs = [seen.id, seen.status, seen.attempts];
    if (seen.attempts >= opts.maxAttempts(seen.kind)) {
      const error = `gave up: its lock ran out on the last attempt${seen.last_error ? ` (before that: ${seen.last_error})` : ''}`;
      await db.execute(
        `UPDATE jobs SET status = 'failed', locked_until = NULL, finished_at = ?, last_error = ? WHERE ${same}`,
        [at, error.slice(0, 2000), ...sameArgs],
      );
      continue;
    }
    const lockedUntil = iso(new Date(now.getTime() + opts.lockMs));
    const won = await db.execute(
      `UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_until = ? WHERE ${same}`,
      [lockedUntil, ...sameArgs],
    );
    if (won.rowsAffected !== 1) {
      lost++; // Another copy took it first: look again.
      continue;
    }
    const job: Job = { ...seen, status: 'running', attempts: seen.attempts + 1, locked_until: lockedUntil };
    try {
      return { ...job, payload: JSON.parse(String(seen.payload)) as unknown };
    } catch (err) {
      await fail(db, job, `gave up: its payload is not JSON (${(err as Error).message})`, { maxAttempts: job.attempts, giveUp: true, now });
    }
  }
  return null;
}

/** The claim's job is done. False when the claim no longer holds (its lock ran out and another copy took it). */
export async function finish(db: Db, c: Claim, now: Date = new Date()): Promise<boolean> {
  const r = await db.execute(
    `UPDATE jobs SET status = 'done', locked_until = NULL, finished_at = ? WHERE id = ? AND status = 'running' AND attempts = ?`,
    [iso(now), c.id, c.attempts],
  );
  return r.rowsAffected === 1;
}

/**
 * The claim's attempt failed: queue the job again after its backoff, or, at `maxAttempts`
 * (or with `giveUp`), mark it failed for good. Returns what happened, or 'lost' when the
 * claim no longer holds.
 */
export async function fail(
  db: Db,
  c: Claim,
  error: string,
  opts: { maxAttempts: number; giveUp?: boolean; now?: Date },
): Promise<'retry' | 'failed' | 'lost'> {
  const now = opts.now ?? new Date();
  const last = opts.giveUp || c.attempts >= opts.maxAttempts;
  const message = error.slice(0, 2000);
  const r = last
    ? await db.execute(
        `UPDATE jobs SET status = 'failed', locked_until = NULL, finished_at = ?, last_error = ? WHERE id = ? AND status = 'running' AND attempts = ?`,
        [iso(now), message, c.id, c.attempts],
      )
    : await db.execute(
        `UPDATE jobs SET status = 'queued', locked_until = NULL, run_after = ?, last_error = ? WHERE id = ? AND status = 'running' AND attempts = ?`,
        [iso(new Date(now.getTime() + backoffMs(c.attempts))), message, c.id, c.attempts],
      );
  if (r.rowsAffected !== 1) return 'lost';
  return last ? 'failed' : 'retry';
}
