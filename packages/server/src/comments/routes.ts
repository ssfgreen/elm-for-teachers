/**
 * Comment routes (participant token):
 *   GET    /api/sessions/:sessionId/docs/:docId/comments     -> { comments }
 *   POST   /api/sessions/:sessionId/comments {doc_id, block_id | root_id, body, quote?, envelope} -> 201 { comment }
 *   POST   /api/sessions/:sessionId/comments/:commentId/edit {body, envelope} -> { comment } (teacher's own)
 *   POST   /api/sessions/:sessionId/comments/:commentId/resolve {resolved, envelope} -> { comment } (a root)
 *   DELETE /api/sessions/:sessionId/comments/:commentId {envelope} -> 204 (teacher's own; a root takes its replies)
 * A teacher comment saying @model is answered by a chat turn (POST .../chat with comment_id).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { COMMENT_MAX, Ulid } from '@edw/shared';
import { requireParticipant } from '../auth.js';
import { Envelope, parseOr400 } from '../http/request.js';
import type { AppDeps } from '../deps.js';
import { notFound } from '../http-error.js';
import { createCommentStore } from './store.js';

const CreateBody = z.object({
  doc_id: Ulid,
  block_id: Ulid.optional(),
  root_id: Ulid.optional(),
  body: z.string().trim().min(1).max(COMMENT_MAX),
  quote: z.string().trim().max(2000).nullable().optional(),
  envelope: Envelope,
});
const DeleteBody = z.object({ envelope: Envelope });
const EditBody = z.object({ body: z.string().trim().min(1).max(COMMENT_MAX), envelope: Envelope });
const ResolveBody = z.object({ resolved: z.boolean(), envelope: Envelope });
type ById = { Params: { sessionId: string; commentId: string } };

export function registerCommentRoutes(app: FastifyInstance, deps: AppDeps): void {
  const comments = createCommentStore(deps.db, deps.events);
  const guard = { preHandler: requireParticipant(deps) };

  app.get<{ Params: { sessionId: string; docId: string } }>('/api/sessions/:sessionId/docs/:docId/comments', guard, async (req) => ({
    comments: await comments.list(req.session!.session_id, req.params.docId),
  }));

  app.post('/api/sessions/:sessionId/comments', guard, async (req, reply) => {
    const b = parseOr400(CreateBody, req.body);
    const comment = await comments.create(
      req.session!.session_id,
      { doc_id: b.doc_id, block_id: b.block_id, root_id: b.root_id ?? null, author: 'teacher', body: b.body, quote: b.quote || null },
      b.envelope,
    );
    return reply.code(201).send({ comment });
  });

  app.post<ById>('/api/sessions/:sessionId/comments/:commentId/edit', guard, async (req) => {
    const b = parseOr400(EditBody, req.body);
    const comment = await comments.edit(req.session!.session_id, req.params.commentId, b.body, b.envelope);
    if (!comment) throw notFound('comment');
    return { comment };
  });

  app.post<ById>('/api/sessions/:sessionId/comments/:commentId/resolve', guard, async (req) => {
    const b = parseOr400(ResolveBody, req.body);
    const comment = await comments.resolve(req.session!.session_id, req.params.commentId, b.resolved, b.envelope);
    if (!comment) throw notFound('comment');
    return { comment };
  });

  app.delete<ById>('/api/sessions/:sessionId/comments/:commentId', guard, async (req, reply) => {
    const { envelope } = parseOr400(DeleteBody, req.body);
    if (!(await comments.remove(req.session!.session_id, req.params.commentId, envelope))) throw notFound('comment');
    return reply.code(204).send();
  });
}
