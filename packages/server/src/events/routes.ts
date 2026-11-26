/**
 * POST /api/sessions/:sessionId/events  (participant token, header or ?token=)
 * Body: ClientEventBatch as application/json or text/plain (sendBeacon Blob).
 * -> { accepted, last_seq, interactions }; `interactions` is whether interaction logging is on:
 * while it is off, interaction events in the batch are dropped (sessions/interactions.ts). 400 { error, issues } on a bad batch; 403 if body.session_id
 * differs from the path. 400 `server_only_kind` if any event is of a kind only the server writes
 * (shared events/serverOnly.ts): checked before the schema, so a kind not yet defined is refused the same way.
 */
import type { FastifyInstance } from 'fastify';
import { ClientEventBatch, isServerOnlyKind } from '@edw/shared';
import { requireParticipant } from '../auth.js';
import type { AppDeps, SessionRow } from '../deps.js';
import { HttpError } from '../http-error.js';
import { keepAllowed } from '../sessions/interactions.js';
import { interactionsActive } from '../http/views.js';

/** Event batches can carry keystroke steps; allow more than Fastify's 1 MiB default. */
const BODY_LIMIT = 5 * 1024 * 1024;

export function registerEventRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.post<{ Params: { sessionId: string } }>(
    '/api/sessions/:sessionId/events',
    { preHandler: requireParticipant(deps), bodyLimit: BODY_LIMIT },
    async (req, reply) => {
      let raw: unknown = req.body;
      if (typeof raw === 'string') {
        try {
          raw = JSON.parse(raw);
        } catch {
          throw new HttpError(400, 'body is not valid JSON', 'invalid_json');
        }
      }
      const events = (raw as { events?: unknown } | null)?.events;
      const forged = Array.isArray(events) ? events.map((e) => (e as { kind?: unknown } | null)?.kind).filter(isServerOnlyKind) : [];
      if (forged.length) {
        return reply.code(400).send({ error: `only the server writes ${[...new Set(forged)].join(', ')}`, code: 'server_only_kind' });
      }
      const parsed = ClientEventBatch.safeParse(raw);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid event batch', code: 'invalid_batch', issues: parsed.error.issues });
      }
      const session = req.session as SessionRow;
      if (parsed.data.session_id !== session.session_id) {
        return reply.code(403).send({ error: 'batch session_id does not match the path' });
      }
      const interactions = interactionsActive(session);
      const { accepted, last_seq } = await deps.events.appendClient(session.session_id, keepAllowed(parsed.data.events, interactions));
      return { accepted, last_seq, interactions };
    },
  );
}
