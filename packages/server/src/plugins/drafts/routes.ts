/**
 * A workspace's plugin studio drafts (participant token). Off, with a plain 404 `drafts_off`, when
 * PLUGIN_STUDIO_URL is unset.
 *   GET    /api/sessions/:sessionId/plugin-drafts                     -> { drafts }
 *   POST   /api/sessions/:sessionId/plugin-drafts {address, envelope} -> 201 { draft } (200 when already added)
 *   DELETE /api/sessions/:sessionId/plugin-drafts/:draftId {envelope} -> 204
 * A draft's address is a secret: no response or log line carries it, and a refusal never repeats it.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireParticipant } from '../../auth.js';
import { Envelope, parseOr400 } from '../../http/request.js';
import type { AppDeps } from '../../deps.js';
import { studioOrigins } from '../../env/studio.js';
import { HttpError, conflict, notFound } from '../../http-error.js';
import { checkDraftAddress, type AddressProblem } from './address.js';
import { createDraftService, DRAFTS_MAX } from './service.js';
import { readDraft } from './studio.js';

const AddBody = z.object({ address: z.string().max(2000), envelope: Envelope });
const RemoveBody = z.object({ envelope: Envelope });

const REFUSED: Record<AddressProblem, string> = {
  not_an_address: 'that is not a web address',
  not_the_studio: 'drafts can only be added from the plugin studio',
  not_a_draft: "that is not a draft's address (it ends /d/ and the draft's code)",
};

export function registerDraftRoutes(app: FastifyInstance, deps: AppDeps): void {
  const origins = studioOrigins(deps.env);
  const drafts = createDraftService(deps.db, deps.events);
  const fetchFn = deps.studioFetch ?? fetch;
  const guard = { preHandler: requireParticipant(deps) };
  const on = () => {
    if (origins.length === 0) throw new HttpError(404, 'plugin drafts are not set up on this server', 'drafts_off');
  };

  app.get('/api/sessions/:sessionId/plugin-drafts', guard, async (req) => {
    on();
    return { drafts: await drafts.list(req.session!.session_id) };
  });

  app.post('/api/sessions/:sessionId/plugin-drafts', guard, async (req, reply) => {
    on();
    const { address, envelope } = parseOr400(AddBody, req.body);
    const checked = checkDraftAddress(address, origins);
    if ('problem' in checked) throw new HttpError(400, REFUSED[checked.problem], checked.problem);
    const r = await drafts.add(req.session!.session_id, checked.address, () => readDraft(checked.address, fetchFn), envelope);
    if (r === 'full') throw conflict(`a workspace can hold ${DRAFTS_MAX} drafts: remove one first`, 'too_many_drafts');
    return reply.code(r.added ? 201 : 200).send({ draft: r.draft });
  });

  app.delete<{ Params: { sessionId: string; draftId: string } }>('/api/sessions/:sessionId/plugin-drafts/:draftId', guard, async (req, reply) => {
    on();
    const { envelope } = parseOr400(RemoveBody, req.body);
    if (!(await drafts.remove(req.session!.session_id, req.params.draftId, envelope))) throw notFound('draft');
    return reply.code(204).send();
  });
}
