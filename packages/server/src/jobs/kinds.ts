/**
 * The job kinds and what runs each. Nothing in the app enqueues a job yet; `noop` is for
 * tests. A new kind adds an entry here, and its handler must be safe to run twice: a copy
 * that stops mid-job leaves it to be claimed again once its lock runs out.
 */
import type { Db } from '../db/client.js';

export interface JobContext {
  db: Db;
  /** The attempt this is, from 1. */
  attempt: number;
}

export interface JobKind {
  run(payload: unknown, ctx: JobContext): Promise<void>;
  /** How many attempts before it is given up; DEFAULT_MAX_ATTEMPTS when left out. */
  maxAttempts?: number;
}

export type JobKinds = Readonly<Record<string, JobKind>>;

export const DEFAULT_MAX_ATTEMPTS = 5;

export const JOB_KINDS: JobKinds = {
  noop: { run: async () => {} },
};

export function maxAttemptsFor(kinds: JobKinds, kind: string): number {
  return kinds[kind]?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
}
