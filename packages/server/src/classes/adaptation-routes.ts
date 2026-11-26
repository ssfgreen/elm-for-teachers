/**
 * Library adaptations chosen for a pupil (participant token), under /api/sessions/:sessionId:
 *   POST /classes/:id/pupils/:pupilId/adaptations {entry_id, title, changes_goal, status?, overrides?, source_version?, envelope} -> 201 { adaptation }
 *   POST /classes/:id/adaptations/:adaptationId/update {status?, overrides?, envelope} -> { adaptation }
 *   POST /classes/:id/adaptations/:adaptationId/remove {envelope}                     -> { adaptation }
 * The class's adaptations come with GET /classes/:id.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ADAPTATION_OVERRIDES_MAX, AdaptationPick, AdaptationStatus } from '@edw/shared';
import { requireParticipant } from '../auth.js';
import { Envelope, parseOr400 } from '../http/request.js';
import type { AppDeps } from '../deps.js';
import { notFound } from '../http-error.js';
import { createAdaptationService } from './adaptations.js';

const AddBody = AdaptationPick.extend({ envelope: Envelope });
const UpdateBody = z.object({ status: AdaptationStatus.optional(), overrides: z.string().max(ADAPTATION_OVERRIDES_MAX).nullable().optional(), envelope: Envelope });
const Only = z.object({ envelope: Envelope });

type PupilId = { Params: { sessionId: string; id: string; pupilId: string } };
type AdaptationId = { Params: { sessionId: string; id: string; adaptationId: string } };

export function registerAdaptationRoutes(app: FastifyInstance, deps: AppDeps): void {
  const adaptations = createAdaptationService(deps.db, deps.events);
  const guard = { preHandler: requireParticipant(deps) };
  const base = '/api/sessions/:sessionId/classes/:id';
  const found = <T>(v: T | null, what: string): T => {
    if (!v) throw notFound(what);
    return v;
  };

  app.post<PupilId>(`${base}/pupils/:pupilId/adaptations`, guard, async (req, reply) => {
    const { envelope, ...pick } = parseOr400(AddBody, req.body);
    return reply.code(201).send({ adaptation: found(await adaptations.add(req.session!.session_id, req.params.id, req.params.pupilId, pick, envelope), 'pupil') });
  });

  app.post<AdaptationId>(`${base}/adaptations/:adaptationId/update`, guard, async (req) => {
    const { envelope, ...fields } = parseOr400(UpdateBody, req.body);
    return { adaptation: found(await adaptations.update(req.session!.session_id, req.params.id, req.params.adaptationId, fields, envelope), 'adaptation') };
  });

  app.post<AdaptationId>(`${base}/adaptations/:adaptationId/remove`, guard, async (req) => {
    const { envelope } = parseOr400(Only, req.body);
    return { adaptation: found(await adaptations.remove(req.session!.session_id, req.params.id, req.params.adaptationId, envelope), 'adaptation') };
  });
}
