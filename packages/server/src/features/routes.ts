/**
 * Feature switch routes. Admin (auth.ts requireAdmin), under /api/admin:
 *   PUT /sessions/:sessionId/features {features: Partial<Features>} -> { session }; switches
 *       left out keep their value; logs `workspace_features_set` (naming the admin's account when
 *       signed in with one); 404 for an unknown workspace.
 * The teacher's browser reads them from GET /api/sessions/:sessionId (`config.features`).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { FeaturesPatch } from '@edw/shared';
import { requireAdmin } from '../auth.js';
import type { AppDeps } from '../deps.js';
import { notFound } from '../http-error.js';
import { parseOr400 } from '../http/request.js';
import { sessionView } from '../http/views.js';

const Body = z.object({ features: FeaturesPatch });

export function registerFeatureRoutes(app: FastifyInstance, deps: AppDeps): void {
  void app.register(
    async (admin) => {
      admin.addHook('preHandler', requireAdmin(deps));
      admin.put<{ Params: { sessionId: string } }>('/sessions/:sessionId/features', async (req) => {
        const { features } = parseOr400(Body, req.body);
        const by = req.admin;
        const session = await deps.sessions.setFeatures(req.params.sessionId, features, by?.via ?? 'password', by?.via === 'account' ? by.account.id : undefined);
        if (!session) throw notFound('session');
        return { session: sessionView(session) };
      });
    },
    { prefix: '/api/admin' },
  );
}
