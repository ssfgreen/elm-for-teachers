/**
 * Readiness: the database answers and every migration is applied. Kubernetes sends traffic to a
 * copy only while this is 200. `/api/health` (app.ts) stays the plain "the process is up" check.
 */
import type { FastifyInstance } from 'fastify';
import { pendingMigrations } from '../db/migrate.js';
import type { AppDeps } from '../deps.js';

export function registerHealthRoutes(app: FastifyInstance, deps: Pick<AppDeps, 'db'>): void {
  app.get('/api/health/ready', async (req, reply) => {
    try {
      await deps.db.execute('SELECT 1');
    } catch (err) {
      req.log.warn({ err }, `ready: database did not answer: ${(err as Error).message}`);
      return reply.code(503).send({ ok: false, reason: 'database' });
    }
    let pending: string[];
    try {
      pending = await pendingMigrations(deps.db);
    } catch (err) {
      // The migrations folder missing from the build, or schema_migrations unreadable.
      req.log.warn({ err }, `ready: could not compare the schema with the migrations: ${(err as Error).message}`);
      return reply.code(503).send({ ok: false, reason: 'migrations' });
    }
    if (pending.length) return reply.code(503).send({ ok: false, reason: 'schema', pending: pending.length });
    return { ok: true };
  });
}
