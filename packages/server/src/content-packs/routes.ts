/**
 * One-way Content Pack v1 routes (T3):
 *   POST   /api/sessions/:sessionId/docs/:docId/content-packs -> 201 { pack_id, content_hash, download_url, import_url, expires_at, pack }
 *   GET    /api/sessions/:sessionId/content-packs             -> { packs }
 *   DELETE /api/sessions/:sessionId/content-packs/:packId     -> { ok: true }
 *   GET    /api/packs/:code                                   -> 302 presigned GET (bucket) or application/zip (DB fallback)
 *
 * Strictly one-way: GET /api/packs/:code checks link_code_hash, expiry and revocation, and NEVER
 * mutates or burns the link code (resilient to Safe Links / email pre-fetchers).
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ContentPackKind, ContentPackPrompt, nowIso } from '@edw/shared';
import { requireParticipant } from '../auth.js';
import type { AppDeps } from '../deps.js';
import { HttpError, notFound } from '../http-error.js';
import { Envelope, parseOr400 } from '../http/request.js';
import { exportContentPack } from './service.js';
import { getContentPackByCodeHash, hashLinkCode, listContentPacks, revokeContentPack } from './store.js';

const ExportBody = z.object({
  kind: ContentPackKind,
  title: z.string().trim().min(1).max(200).optional(),
  prompts: z.array(ContentPackPrompt).max(40).optional(),
  envelope: Envelope,
});

function originOf(req: FastifyRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol;
  const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host ?? 'localhost';
  return `${proto}://${host}`;
}

export function registerContentPackRoutes(app: FastifyInstance, deps: AppDeps): void {
  const guard = { preHandler: requireParticipant(deps) };
  const base = '/api/sessions/:sessionId';

  app.post<{ Params: { sessionId: string; docId: string } }>(`${base}/docs/:docId/content-packs`, guard, async (req, reply) => {
    const { kind, title, prompts } = parseOr400(ExportBody, req.body);
    const result = await exportContentPack(deps, {
      sessionId: req.session!.session_id,
      docId: req.params.docId,
      kind,
      ...(title ? { title } : {}),
      ...(prompts ? { prompts } : {}),
      origin: originOf(req),
    });
    return reply.code(201).send(result);
  });

  app.get(`${base}/content-packs`, guard, async (req) => ({
    packs: await listContentPacks(deps.db, req.session!.session_id),
  }));

  app.delete<{ Params: { sessionId: string; packId: string } }>(`${base}/content-packs/:packId`, guard, async (req) => {
    const revoked = await revokeContentPack(deps.db, req.session!.session_id, req.params.packId, nowIso());
    if (!revoked) throw notFound('content pack');
    if (deps.bucket) await deps.bucket.delete(revoked.storage_key);
    return { ok: true };
  });

  app.get<{ Params: { code: string } }>('/api/packs/:code', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    const code = req.params.code?.trim();
    if (!code) throw notFound('content pack');
    const pack = await getContentPackByCodeHash(deps.db, hashLinkCode(code));
    if (!pack) throw notFound('content pack');
    if (pack.revoked_at || Date.now() >= Date.parse(pack.expires_at)) {
      throw new HttpError(410, 'this content pack link has expired or been revoked', 'pack_expired');
    }
    if (deps.bucket && !pack.zip_data) {
      return reply.redirect(deps.bucket.presignGet(pack.storage_key, 60), 302);
    }
    if (!pack.zip_data) {
      throw new HttpError(410, 'this content pack is no longer available', 'pack_expired');
    }
    return reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', `attachment; filename="content-pack-${pack.id}.zip"`)
      .header('X-Content-Pack-Hash', pack.content_hash)
      .send(pack.zip_data);
  });
}
