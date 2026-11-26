/**
 * Preference routes (participant token), for the Preferences screen:
 *   GET  /api/sessions/:sessionId/preferences                      -> { preferences }
 *   POST /api/sessions/:sessionId/preferences {...fields, envelope} -> { preferences }
 */
import type { FastifyInstance } from 'fastify';
import { PreferencesUpdate } from '@edw/shared';
import { requireParticipant } from '../auth.js';
import { Envelope, parseOr400 } from '../http/request.js';
import type { AppDeps } from '../deps.js';
import { createPreferenceService } from './service.js';

const SetBody = PreferencesUpdate.extend({ envelope: Envelope });

export function registerPreferenceRoutes(app: FastifyInstance, deps: AppDeps): void {
  const preferences = createPreferenceService(deps.db, deps.events);
  const guard = { preHandler: requireParticipant(deps) };

  app.get('/api/sessions/:sessionId/preferences', guard, async (req) => ({ preferences: await preferences.get(req.session!.session_id) }));

  app.post('/api/sessions/:sessionId/preferences', guard, async (req) => {
    const { envelope, ...update } = parseOr400(SetBody, req.body);
    return { preferences: await preferences.set(req.session!.session_id, update, envelope) };
  });
}
