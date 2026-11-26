/**
 * Make kit routes (participant token):
 *   GET  /api/sessions/:sessionId/make                        -> { board } (empty until first saved)
 *   PUT  /api/sessions/:sessionId/make {board, actions, envelope} -> { board, updated_at }; each action is logged as make_action
 *   POST /api/sessions/:sessionId/make/design {text, feedback?, previous?, envelope} -> DesignResult
 *     The model designs one option for a described feature (shared/make.ts), logged as
 *     make_design. 429 past MAKE_DESIGNS_PER_HOUR; 502 when the call fails or says nothing usable.
 * Not counted against the chat's message limits or the budget.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DESIGN_INSTRUCTIONS, DesignRequest, designPrompt, MAKE_ACTIONS_MAX, MAKE_DESIGNS_PER_HOUR, MakeAction, MakeBoard, nowIso, parseDesign, type DesignResult } from '@edw/shared';
import { sha256Hex } from '@edw/shared/node';
import { requireParticipant } from '../auth.js';
import { Envelope, parseOr400 } from '../http/request.js';
import type { AppDeps } from '../deps.js';
import { HttpError } from '../http-error.js';
import { loadBoard, saveBoard } from './store.js';

const SaveBody = z.object({
  board: MakeBoard,
  actions: z.array(z.object({ action: MakeAction, client_ts: z.string().datetime({ offset: true }) })).max(MAKE_ACTIONS_MAX),
  envelope: Envelope,
});
const DesignBody = DesignRequest.extend({ envelope: Envelope });

export function registerMakeRoutes(app: FastifyInstance, deps: AppDeps): void {
  const guard = { preHandler: requireParticipant(deps) };

  app.get('/api/sessions/:sessionId/make', guard, async (req) => loadBoard(deps.db, req.session!.session_id));

  app.put('/api/sessions/:sessionId/make', guard, async (req) => {
    const sid = req.session!.session_id;
    const { board, actions, envelope } = parseOr400(SaveBody, req.body);
    const at = nowIso();
    await deps.db.transaction(async (tx) => {
      await saveBoard(tx, sid, board, at);
      for (const a of actions) await deps.events.appendServer(sid, 'make_action', a, envelope, tx);
    });
    return { board, updated_at: at };
  });

  app.post('/api/sessions/:sessionId/make/design', guard, async (req, reply) => {
    const sid = req.session!.session_id;
    const { envelope, ...request } = parseOr400(DesignBody, req.body);
    const since = new Date(Date.now() - 3600_000).toISOString();
    if ((await deps.events.countSince(sid, 'make_design', since)) >= MAKE_DESIGNS_PER_HOUR) throw new HttpError(429, 'That is a lot of designs for one hour. Please wait a little and try again.', 'make_limit');

    const started = performance.now();
    let result: DesignResult | null = null;
    let detail: { input_tokens: number | null; output_tokens: number | null; provider_request_id: string | null; request?: unknown; error: string | null };
    try {
      const raw = await deps.provider.complete([{ role: 'user', content: designPrompt(request) }], DESIGN_INSTRUCTIONS);
      result = parseDesign(raw.text, request.text);
      detail = { input_tokens: raw.input_tokens, output_tokens: raw.output_tokens, provider_request_id: raw.provider_request_id, request: raw.request, error: result ? null : 'the reply held no usable design' };
    } catch (err) {
      detail = { input_tokens: null, output_tokens: null, provider_request_id: null, error: err instanceof Error ? err.message : String(err) };
    }
    await deps.events.appendServer(
      sid,
      'make_design',
      { text: request.text, feedback: request.feedback ?? null, result, model: deps.provider.model, system_prompt_hash: sha256Hex(DESIGN_INSTRUCTIONS), latency_ms: Math.round(performance.now() - started), at: nowIso(), ...detail },
      envelope,
    );
    // Sent here, not thrown: the error handler hides the message of anything over 500.
    if (!result) return reply.code(502).send({ error: 'That did not work. Try describing it in a different way.', code: 'design_failed' });
    return result;
  });
}
