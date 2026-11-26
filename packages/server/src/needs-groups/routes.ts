/**
 * Needs group routes (participant token), all under /api/sessions/:sessionId:
 *   GET    /needs-groups                                           -> { groups }
 *   POST   /needs-groups {name, description?, what_helps?, class_ids?, envelope} -> 201 { group }
 *   POST   /needs-groups/:id/update {name?, description?, what_helps?, position?, envelope} -> { group }
 *   POST   /needs-groups/:id/archive {envelope}                    -> { group }
 *   POST   /needs-groups/:id/classes {class_id, envelope}          -> { group }
 *   DELETE /needs-groups/:id/classes/:classId                      -> { group }
 *   POST   /needs-groups/:id/adaptations {entry_id, title, changes_goal, status?, overrides?, source_version?, envelope} -> 201 { adaptation }
 *   POST   /needs-groups/:id/adaptations/:adaptationId/update {status?, overrides?, envelope} -> { adaptation }
 *   POST   /needs-groups/:id/adaptations/:adaptationId/remove {envelope} -> { adaptation }
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ADAPTATION_OVERRIDES_MAX, AdaptationPick, AdaptationStatus, NeedsGroupInput, NeedsGroupUpdate, Ulid } from '@edw/shared';
import { requireParticipant } from '../auth.js';
import type { AppDeps } from '../deps.js';
import { HttpError, notFound } from '../http-error.js';
import { Envelope, parseOr400 } from '../http/request.js';
import { createNeedsGroupStore } from './store.js';

const CreateBody = NeedsGroupInput.extend({ envelope: Envelope });
const UpdateBody = NeedsGroupUpdate.extend({ envelope: Envelope });
const Only = z.object({ envelope: Envelope });
const AttachClassBody = z.object({ class_id: Ulid, envelope: Envelope });
const AddAdaptationBody = AdaptationPick.extend({ envelope: Envelope });
const UpdateAdaptationBody = z.object({
  status: AdaptationStatus.optional(),
  overrides: z.string().max(ADAPTATION_OVERRIDES_MAX).nullable().optional(),
  envelope: Envelope,
});

type GroupId = { Params: { sessionId: string; id: string } };
type GroupClassId = { Params: { sessionId: string; id: string; classId: string } };
type GroupAdaptationId = { Params: { sessionId: string; id: string; adaptationId: string } };

export function registerNeedsGroupRoutes(app: FastifyInstance, deps: AppDeps): void {
  const store = createNeedsGroupStore(deps.db);
  const guard = {
    preHandler: [
      requireParticipant(deps),
      async (req: { session?: { features: { needs_groups: boolean } } }) => {
        if (!req.session?.features.needs_groups) throw new HttpError(403, 'needs groups are turned off for this workspace', 'feature_off');
      },
    ],
  };
  const base = '/api/sessions/:sessionId/needs-groups';
  const found = <T>(v: T | null, what: string): T => {
    if (!v) throw notFound(what);
    return v;
  };

  app.get(base, guard, async (req) => ({ groups: await store.list(req.session!.session_id) }));

  app.post(base, guard, async (req, reply) => {
    const { name, description, what_helps, class_ids } = parseOr400(CreateBody, req.body);
    return reply.code(201).send({ group: await store.create(req.session!.session_id, { name, description, what_helps, class_ids }) });
  });

  app.post<GroupId>(`${base}/:id/update`, guard, async (req) => {
    const { name, description, what_helps, position } = parseOr400(UpdateBody, req.body);
    return { group: found(await store.update(req.session!.session_id, req.params.id, { name, description, what_helps, position }), 'needs group') };
  });

  app.post<GroupId>(`${base}/:id/archive`, guard, async (req) => {
    parseOr400(Only, req.body);
    return { group: found(await store.archive(req.session!.session_id, req.params.id), 'needs group') };
  });

  app.post<GroupId>(`${base}/:id/classes`, guard, async (req) => {
    const { class_id } = parseOr400(AttachClassBody, req.body);
    return { group: found(await store.attachClass(req.session!.session_id, req.params.id, class_id), 'needs group') };
  });

  app.delete<GroupClassId>(`${base}/:id/classes/:classId`, guard, async (req) => ({
    group: found(await store.detachClass(req.session!.session_id, req.params.id, req.params.classId), 'needs group'),
  }));

  app.post<GroupId>(`${base}/:id/adaptations`, guard, async (req, reply) => {
    const { entry_id, title, changes_goal, status, overrides, source_version } = parseOr400(AddAdaptationBody, req.body);
    return reply.code(201).send({
      adaptation: found(
        await store.addAdaptation(req.session!.session_id, req.params.id, { entry_id, title, changes_goal, status, overrides, source_version }),
        'needs group',
      ),
    });
  });

  app.post<GroupAdaptationId>(`${base}/:id/adaptations/:adaptationId/update`, guard, async (req) => {
    const { status, overrides } = parseOr400(UpdateAdaptationBody, req.body);
    return { adaptation: found(await store.updateAdaptation(req.session!.session_id, req.params.id, req.params.adaptationId, { status, overrides }), 'adaptation') };
  });

  app.post<GroupAdaptationId>(`${base}/:id/adaptations/:adaptationId/remove`, guard, async (req) => {
    parseOr400(Only, req.body);
    return { adaptation: found(await store.removeAdaptation(req.session!.session_id, req.params.id, req.params.adaptationId), 'adaptation') };
  });
}
