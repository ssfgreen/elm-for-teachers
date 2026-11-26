/**
 * Teacher onboarding lesson progress routes (participant token), under /api/sessions/:sessionId:
 *   GET /lessons            -> { lessons }
 *   PUT /lessons/:lessonId  -> { lesson }
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireParticipant } from '../auth.js';
import type { AppDeps } from '../deps.js';
import { badRequest } from '../http-error.js';
import { Envelope, parseOr400 } from '../http/request.js';
import { listLessonProgress, upsertLessonProgress } from './store.js';

const LESSON_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const UpdateLessonBody = z.object({
  status: z.enum(['not_started', 'in_progress', 'completed']),
  state: z.record(z.unknown()).nullable().optional(),
  envelope: Envelope,
});

export function registerLessonRoutes(app: FastifyInstance, deps: AppDeps): void {
  const guard = { preHandler: requireParticipant(deps) };
  const base = '/api/sessions/:sessionId/lessons';

  app.get(base, guard, async (req) => ({
    lessons: await listLessonProgress(deps.db, req.session!.session_id),
  }));

  app.put<{ Params: { sessionId: string; lessonId: string } }>(`${base}/:lessonId`, guard, async (req) => {
    const lessonId = req.params.lessonId;
    if (!LESSON_ID_RE.test(lessonId)) throw badRequest('invalid lesson id', 'invalid_lesson_id');
    const { status, state } = parseOr400(UpdateLessonBody, req.body);
    const lesson = await upsertLessonProgress(deps.db, req.session!.session_id, lessonId, { status, state });
    return { lesson };
  });
}
