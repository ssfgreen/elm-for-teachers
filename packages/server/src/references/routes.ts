/**
 * Reference file routes (participant token):
 *   GET    /api/sessions/:sessionId/projects/:projectId/references   -> { references, limits }
 *   POST   /api/sessions/:sessionId/projects/:projectId/references {name, mime, bytes, pages[], envelope}
 *            -> 201 { reference, upload } (upload: a signed PUT for the original when a bucket is configured)
 *   GET    /api/sessions/:sessionId/threads/:threadId/references    -> { references, limits } (a chat's own files)
 *   POST   /api/sessions/:sessionId/threads/:threadId/references {as above} -> 201 { reference, upload } ("+" under the chat box)
 *   POST   /api/sessions/:sessionId/references/:referenceId/complete {envelope} -> { reference }
 * A file is summarised by the model (summary.ts) when it becomes ready, before the reply.
 *   GET    /api/sessions/:sessionId/references/:referenceId/original -> 302 to the original (bucket only)
 *   GET    /api/sessions/:sessionId/references/:referenceId/pages    -> { reference, pages: [{page, text}], original } (the preview;
 *            `original`: whether /original will serve the file)
 *   DELETE /api/sessions/:sessionId/references/:referenceId {envelope} -> 204
 * The browser converts the file; the body carries its text, so it can be large (not the original).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { REFERENCE_BLOCKS_MAX, REFERENCE_NAME_MAX, ReferenceBlock, type ReferenceMime } from '@edw/shared';
import { requireParticipant } from '../auth.js';
import { Envelope, parseOr400 } from '../http/request.js';
import type { AppDeps } from '../deps.js';
import { notFound } from '../http-error.js';
import { bucketKey } from '../assets/store.js';
import { createReferenceService, referenceBucketId } from './service.js';
import { summariseReference } from './summary.js';

/** Vercel takes at most 4.5 MB a request; a file at the text limit (200k tokens) is under 1 MB. */
export const REFERENCE_BODY_LIMIT = 4 * 1024 * 1024;

const CreateBody = z.object({
  name: z.string().trim().min(1).max(REFERENCE_NAME_MAX),
  mime: z.string(),
  bytes: z.number().int().nonnegative(),
  pages: z.array(z.string()).min(1).max(5000),
  /** A Word file's blocks, so it can be opened as an editable doc. */
  blocks: z.array(ReferenceBlock).max(REFERENCE_BLOCKS_MAX).optional(),
  envelope: Envelope,
});
const EnvelopeBody = z.object({ envelope: Envelope });

type RefParams = { Params: { sessionId: string; referenceId: string } };

export function registerReferenceRoutes(app: FastifyInstance, deps: AppDeps): void {
  const limits = deps.loaded.config.references;
  const refs = createReferenceService(deps.db, deps.events, limits, deps.bucket ?? null);
  const guard = { preHandler: requireParticipant(deps) };
  const summarise = (file: Parameters<typeof summariseReference>[3], envelope: Parameters<typeof summariseReference>[4]) => summariseReference(deps.provider, refs, deps.events, file, envelope);

  app.get<{ Params: { sessionId: string; projectId: string } }>('/api/sessions/:sessionId/projects/:projectId/references', guard, async (req) => ({
    references: await refs.list(req.session!.session_id, req.params.projectId),
    limits,
  }));

  app.post<{ Params: { sessionId: string; projectId: string } }>(
    '/api/sessions/:sessionId/projects/:projectId/references',
    { ...guard, bodyLimit: REFERENCE_BODY_LIMIT },
    async (req, reply) => {
      const b = parseOr400(CreateBody, req.body);
      // An unknown type is refused by the service (415), with a message for the teacher.
      const { file, upload } = await refs.create(req.session!.session_id, req.params.projectId, { name: b.name, mime: b.mime as ReferenceMime, bytes: b.bytes, pages: b.pages, ...(b.blocks ? { blocks: b.blocks } : {}) }, b.envelope);
      const reference = file.status === 'ready' ? await summarise(file, b.envelope) : file;
      return reply.code(201).send({ reference, upload });
    },
  );

  app.get<{ Params: { sessionId: string; threadId: string } }>('/api/sessions/:sessionId/threads/:threadId/references', guard, async (req) => ({
    references: await refs.listForThread(req.session!.session_id, req.params.threadId),
    limits,
  }));

  app.post<{ Params: { sessionId: string; threadId: string } }>(
    '/api/sessions/:sessionId/threads/:threadId/references',
    { ...guard, bodyLimit: REFERENCE_BODY_LIMIT },
    async (req, reply) => {
      const b = parseOr400(CreateBody, req.body);
      const { file, upload } = await refs.create(req.session!.session_id, { thread_id: req.params.threadId }, { name: b.name, mime: b.mime as ReferenceMime, bytes: b.bytes, pages: b.pages, ...(b.blocks ? { blocks: b.blocks } : {}) }, b.envelope);
      const reference = file.status === 'ready' ? await summarise(file, b.envelope) : file;
      return reply.code(201).send({ reference, upload });
    },
  );

  app.post<RefParams>('/api/sessions/:sessionId/references/:referenceId/complete', guard, async (req) => {
    const { envelope } = parseOr400(EnvelopeBody, req.body);
    const before = await refs.get(req.session!.session_id, req.params.referenceId);
    const ready = await refs.complete(req.session!.session_id, req.params.referenceId, envelope);
    // Summarised once, when the file first becomes ready.
    return { reference: before?.status === 'pending' ? await summarise(ready, envelope) : ready };
  });

  app.get<RefParams>('/api/sessions/:sessionId/references/:referenceId/original', guard, async (req, reply) => {
    const sessionId = req.session!.session_id;
    const f = await refs.get(sessionId, req.params.referenceId);
    if (!f || f.deleted_at || f.status !== 'ready' || !deps.bucket) throw notFound('original');
    return reply.header('Cache-Control', 'private, max-age=300').redirect(deps.bucket.presignGet(bucketKey(sessionId, referenceBucketId(f.id)), 3600), 302);
  });

  app.get<RefParams>('/api/sessions/:sessionId/references/:referenceId/pages', guard, async (req) => {
    const f = await refs.get(req.session!.session_id, req.params.referenceId);
    if (!f || f.deleted_at) throw notFound('reference');
    return { reference: f, pages: await refs.pages(f.id), original: f.status === 'ready' && !!deps.bucket };
  });

  app.delete<RefParams>('/api/sessions/:sessionId/references/:referenceId', guard, async (req, reply) => {
    const { envelope } = parseOr400(EnvelopeBody, req.body);
    if (!(await refs.remove(req.session!.session_id, req.params.referenceId, envelope))) throw notFound('reference');
    return reply.code(204).send();
  });
}
