/**
 * A class's settings for the pupil reader (participant token; #186), under /api/sessions/:sessionId:
 *   GET  /classes/:id/reader-settings                                       -> { settings }
 *   POST /classes/:id/reader-settings {follow_ups_max?, pupil_budget_gbp?, safety_instruction?, envelope} -> { settings }
 * A value sets a field, null goes back to config's default. 404 for a class not in this
 * workspace; 400 for a value out of limits (0 to 10 follow-ups, £0 to £5 to the penny, a safety
 * instruction empty once trimmed or over 2,000 characters).
 */
import type { FastifyInstance } from 'fastify';
import { ClassReaderSettingsPatch } from '@edw/shared';
import { requireParticipant } from '../auth.js';
import type { AppDeps } from '../deps.js';
import { notFound } from '../http-error.js';
import { Envelope, parseOr400 } from '../http/request.js';
import { createReaderSettingsStore } from './reader-settings.js';

const SetBody = ClassReaderSettingsPatch.extend({ envelope: Envelope });

type Id = { Params: { sessionId: string; id: string } };

export function registerReaderSettingsRoutes(app: FastifyInstance, deps: AppDeps): void {
  const settings = createReaderSettingsStore(deps.db, deps.events, () => deps.loaded.config.reader);
  const guard = { preHandler: requireParticipant(deps) };
  const path = '/api/sessions/:sessionId/classes/:id/reader-settings';

  app.get<Id>(path, guard, async (req) => {
    const r = await settings.get(req.session!.session_id, req.params.id);
    if (!r) throw notFound('class');
    return { settings: r };
  });

  app.post<Id>(path, guard, async (req) => {
    const { envelope, ...patch } = parseOr400(SetBody, req.body);
    const r = await settings.set(req.session!.session_id, req.params.id, patch, envelope);
    if (!r) throw notFound('class');
    return { settings: r };
  });
}
