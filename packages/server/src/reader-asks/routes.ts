/**
 * A pupil's ask in the reader (signed-in pupil; #214):
 *   POST /api/pupil/readings/:readingId/asks {prompt_id, highlighted_text, parent_ask_id?}
 *        -> { ask: { id, reply, follow_ups_left } }
 * The pupil must be a member of the reading's class (class-joins/member.ts `memberOf`), checked
 * before the body is read; an unknown reading is 403 `not_member` too. Refusals carry a reason
 * code (service.ts). Log lines carry the reason code and ids only: never the
 * passage, the instruction or the reply. Nothing goes to `events` or `gateway_calls`.
 */
import type { FastifyInstance } from 'fastify';
import { ReaderAskBody } from '@edw/shared';
import { fromSite, requirePupil } from '../auth.js';
import { createClassJoinStore } from '../class-joins/store.js';
import { createReaderSettingsStore } from '../classes/reader-settings.js';
import type { AppDeps } from '../deps.js';
import { parseOr400 } from '../http/request.js';
import { pupilCookieNames } from '../pupils/cookies.js';
import { createPupilStore } from '../pupils/store.js';
import { askReader, openReading, type ReaderAskDeps } from './service.js';
import { createReaderAskStore } from './store.js';

export function registerReaderAskRoutes(app: FastifyInstance, deps: AppDeps): void {
  const pupils = deps.pupils ?? createPupilStore(deps.db);
  const base = deps.env.AUTH_BASE_URL;
  const ask: ReaderAskDeps = {
    db: deps.db,
    loaded: deps.loaded,
    provider: deps.provider,
    asks: createReaderAskStore(deps.db),
    settings: createReaderSettingsStore(deps.db, deps.events, () => deps.loaded.config.reader),
    member: { joins: deps.classJoins ?? createClassJoinStore(deps.db, deps.events), sessions: deps.sessions, env: deps.env },
  };

  app.post<{ Params: { readingId: string } }>('/api/pupil/readings/:readingId/asks', { preHandler: requirePupil(pupils, pupilCookieNames(base).signIn) }, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    if (!fromSite(req, base)) return reply.code(403).send({ error: 'asking must come from this site' });
    const opened = await openReading(ask, req.pupil!.id, req.params.readingId);
    const out = opened.ok ? await askReader(ask, opened.open, parseOr400(ReaderAskBody, req.body)) : opened;
    if (!out.ok) {
      req.log.info({ reason: out.code, reading_id: req.params.readingId, ...(out.provider ? { provider: out.provider } : {}) }, 'reader ask refused');
      return reply.code(out.status).send({ error: out.message, code: out.code });
    }
    req.log.info({ reason: 'reader_ask', ...out.ids }, 'reader ask answered');
    return { ask: out.ask };
  });
}
