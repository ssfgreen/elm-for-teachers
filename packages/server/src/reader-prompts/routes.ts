/**
 * The teacher's prompt library for the pupil reader (participant token; #177).
 *   GET    /api/sessions/:sessionId/reader-prompts                                   -> { prompts }
 *   POST   /api/sessions/:sessionId/reader-prompts {label, instruction, ticks, envelope} -> 201 { prompt }
 *   PATCH  /api/sessions/:sessionId/reader-prompts/:promptId {any fields, envelope}  -> { prompt }
 *   DELETE /api/sessions/:sessionId/reader-prompts/:promptId {envelope}              -> 204
 *   PUT    /api/sessions/:sessionId/reader-prompts/order {prompt_ids, envelope}      -> { prompts }
 * The first call for a workspace puts config's default prompts in (store.ts).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { READER_PROMPTS_MAX, ReaderPromptFields, ReaderPromptPatch } from '@edw/shared';
import { requireParticipant } from '../auth.js';
import type { AppDeps } from '../deps.js';
import { conflict, notFound } from '../http-error.js';
import { Envelope, parseOr400 } from '../http/request.js';
import { createReaderPromptStore } from './store.js';

const AddBody = ReaderPromptFields.extend({ envelope: Envelope });
const EditBody = ReaderPromptPatch.extend({ envelope: Envelope });
const RemoveBody = z.object({ envelope: Envelope });
const OrderBody = z.object({ prompt_ids: z.array(z.string().min(1)).max(READER_PROMPTS_MAX), envelope: Envelope });

type Params = { Params: { sessionId: string; promptId: string } };

export function registerReaderPromptRoutes(app: FastifyInstance, deps: AppDeps): void {
  const prompts = createReaderPromptStore(deps.db, deps.events, () => deps.loaded.config.reader.default_prompts);
  const guard = { preHandler: requireParticipant(deps) };
  const base = '/api/sessions/:sessionId/reader-prompts';

  app.get(base, guard, async (req) => ({ prompts: await prompts.list(req.session!.session_id) }));

  app.post(base, guard, async (req, reply) => {
    const { envelope, ...fields } = parseOr400(AddBody, req.body);
    const r = await prompts.add(req.session!.session_id, fields, envelope);
    if (r === 'full') throw conflict(`the library can hold ${READER_PROMPTS_MAX} prompts: remove one first`, 'too_many_prompts');
    return reply.code(201).send({ prompt: r });
  });

  app.put(`${base}/order`, guard, async (req) => {
    const { prompt_ids, envelope } = parseOr400(OrderBody, req.body);
    const r = await prompts.reorder(req.session!.session_id, prompt_ids, envelope);
    if (r === 'mismatch') throw conflict('the library has changed: reload it and try again', 'prompts_changed');
    return { prompts: r };
  });

  app.patch<Params>(`${base}/:promptId`, guard, async (req) => {
    const { envelope, ...patch } = parseOr400(EditBody, req.body);
    const r = await prompts.edit(req.session!.session_id, req.params.promptId, patch, envelope);
    if (!r) throw notFound('prompt');
    return { prompt: r };
  });

  app.delete<Params>(`${base}/:promptId`, guard, async (req, reply) => {
    const { envelope } = parseOr400(RemoveBody, req.body);
    if (!(await prompts.remove(req.session!.session_id, req.params.promptId, envelope))) throw notFound('prompt');
    return reply.code(204).send();
  });
}
