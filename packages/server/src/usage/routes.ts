/**
 * Usage route (participant token), for the Usage section on Preferences. Read-only, and not
 * logged as a research event:
 *   GET /api/sessions/:sessionId/usage?range=week|month|all -> UsageReport
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { UsageRange, earliestAt, rangeStart, ukDay, dailyUsage, type UsageReport } from '@edw/shared';
import { requireParticipant } from '../auth.js';
import type { AppDeps } from '../deps.js';
import { budgetOf } from '../budget/store.js';
import { parseOr400 } from '../http/request.js';
import { costedCalls } from './query.js';

const Query = z.object({ range: UsageRange.default('week') });

/** The workspace's spend by UK day for the range, with its total spend against its budget (with its top-ups). */
export async function usageReport(deps: Pick<AppDeps, 'db' | 'loaded'>, sessionId: string, range: UsageRange, now = new Date()): Promise<UsageReport> {
  const start = rangeStart(range, ukDay(now));
  const calls = await costedCalls(deps.db, sessionId, start === null ? null : earliestAt(start));
  return { range, ...dailyUsage(calls, range, now), ...(await budgetOf(deps.db, deps.loaded.config.limits, sessionId)) };
}

export function registerUsageRoutes(app: FastifyInstance, deps: AppDeps): void {
  const guard = { preHandler: requireParticipant(deps) };
  app.get('/api/sessions/:sessionId/usage', guard, async (req) => usageReport(deps, req.session!.session_id, parseOr400(Query, req.query).range));
}
