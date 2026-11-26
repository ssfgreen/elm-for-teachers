/**
 * `GET /api/jobs/run`: Vercel's cron calls it (vercel.json) to run due jobs, since a Vercel
 * deployment has no worker. Vercel sends `Authorization: Bearer <CRON_SECRET>`; anything else,
 * or no CRON_SECRET set, is refused. On Kubernetes the worker (worker.ts) runs the same jobs.
 */
import type { FastifyInstance } from 'fastify';
import { safeEqual } from '../auth.js';
import type { AppDeps } from '../deps.js';
import { JOB_KINDS, type JobKinds } from './kinds.js';
import { runFor } from './runner.js';

/** How long one call keeps claiming jobs: well inside the function's 300 s. */
export const CRON_BUDGET_MS = 120_000;

export function registerJobRoutes(app: FastifyInstance, deps: Pick<AppDeps, 'db' | 'env'>, kinds: JobKinds = JOB_KINDS): void {
  app.get('/api/jobs/run', async (req, reply) => {
    const secret = deps.env.CRON_SECRET;
    const given = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1]?.trim();
    if (!secret || !given || !safeEqual(given, secret)) {
      if (!secret) req.log.warn('jobs: CRON_SECRET is not set, so the cron route refuses every call');
      return reply.code(401).send({ error: 'the cron secret is needed', code: 'cron_secret' });
    }
    const tally = await runFor(deps.db, CRON_BUDGET_MS, { kinds });
    return { ok: true, ...tally };
  });
}
