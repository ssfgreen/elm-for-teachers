/**
 * A class's readings (participant token; #187).
 *   GET    /api/sessions/:sessionId/reading-sources                                  -> { sources }
 *   GET    /api/sessions/:sessionId/classes/:classId/readings                        -> { readings }
 *   POST   /api/sessions/:sessionId/classes/:classId/readings {doc_id, prompt_ids, follow_ups_max, envelope} -> 201 { reading }
 *   PATCH  /api/sessions/:sessionId/classes/:classId/readings/:readingId {prompt_ids?, follow_ups_max?, envelope} -> { reading }
 *   DELETE /api/sessions/:sessionId/classes/:classId/readings/:readingId {envelope}  -> 204
 * Setting a reading stores a frozen copy of the doc (store.ts); pupils read it through reader/.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ReadingFields, ReadingPatch } from '@edw/shared';
import { requireParticipant } from '../auth.js';
import { createClassService } from '../classes/service.js';
import type { AppDeps } from '../deps.js';
import { Envelope, parseOr400 } from '../http/request.js';
import { createReaderPromptStore } from '../reader-prompts/store.js';
import { createReadingStore } from './store.js';

const SetBody = ReadingFields.extend({ envelope: Envelope });
const UpdateBody = ReadingPatch.extend({ envelope: Envelope });
const RemoveBody = z.object({ envelope: Envelope });

type ClassParams = { Params: { sessionId: string; classId: string } };
type ReadingParams = { Params: { sessionId: string; classId: string; readingId: string } };

export function registerReadingRoutes(app: FastifyInstance, deps: AppDeps): void {
  const library = createReaderPromptStore(deps.db, deps.events, () => deps.loaded.config.reader.default_prompts);
  const readings = createReadingStore({
    db: deps.db,
    events: deps.events,
    classes: createClassService(deps.db, deps.events),
    canvas: deps.canvas,
    prompts: (sessionId) => library.list(sessionId),
  });
  const guard = { preHandler: requireParticipant(deps) };
  const base = '/api/sessions/:sessionId/classes/:classId/readings';

  app.get('/api/sessions/:sessionId/reading-sources', guard, async (req) => ({ sources: await readings.sources(req.session!.session_id) }));

  app.get<ClassParams>(base, guard, async (req) => ({ readings: await readings.list(req.session!.session_id, req.params.classId) }));

  app.post<ClassParams>(base, guard, async (req, reply) => {
    const { envelope, ...fields } = parseOr400(SetBody, req.body);
    const reading = await readings.set(req.session!.session_id, req.params.classId, fields, envelope);
    return reply.code(201).send({ reading });
  });

  app.patch<ReadingParams>(`${base}/:readingId`, guard, async (req) => {
    const { envelope, ...patch } = parseOr400(UpdateBody, req.body);
    return { reading: await readings.update(req.session!.session_id, req.params.classId, req.params.readingId, patch, envelope) };
  });

  app.delete<ReadingParams>(`${base}/:readingId`, guard, async (req, reply) => {
    const { envelope } = parseOr400(RemoveBody, req.body);
    await readings.remove(req.session!.session_id, req.params.classId, req.params.readingId, envelope);
    return reply.code(204).send();
  });
}
