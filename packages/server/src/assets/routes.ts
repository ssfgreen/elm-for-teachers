/**
 * Image assets.
 *   POST /api/sessions/:sessionId/assets                       participant upload (JSON, base64), images kept in the database
 *   POST /api/sessions/:sessionId/assets/uploads               with a bucket: a signed URL the browser PUTs the file to
 *   POST /api/sessions/:sessionId/assets/:assetId/complete     with a bucket: the file is there; check it and log the upload
 *   GET  /api/sessions/:sessionId/assets/:assetId              participant fetch (token via header or ?token=)
 *   GET  /api/admin/sessions/:sessionId/assets/:assetId        admin fetch (password in header or ?token=)
 * A bucket image is fetched by a redirect to a short-lived signed URL.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { cleanSvg, newUlid, nowIso, SVG_MIME } from '@edw/shared';
import { requireAdmin, requireParticipant } from '../auth.js';
import { Envelope } from '../http/request.js';
import type { AppDeps } from '../deps.js';
import { HttpError, notFound } from '../http-error.js';
import { sendAsset } from './send.js';
import { bucketKey, getAsset, markAssetReady, saveAsset } from './store.js';

export const ASSET_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'] as const;
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;
export const ASSET_BODY_LIMIT = 8 * 1024 * 1024;

const Body = z.object({
  filename: z.string().max(255).nullable(),
  mime: z.string(),
  data_base64: z.string(),
  envelope: Envelope,
});

const UploadBody = z.object({
  filename: z.string().max(255).nullable(),
  mime: z.string(),
  bytes: z.number().int().positive(),
  envelope: Envelope,
});

function checkImage(mime: string, bytes: number): void {
  if (!(ASSET_MIMES as readonly string[]).includes(mime)) throw new HttpError(415, `unsupported image type ${mime}`, 'unsupported_media_type');
  if (bytes > MAX_ASSET_BYTES) throw new HttpError(413, 'image larger than 5 MiB', 'payload_too_large');
}

export function registerAssetRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.post(
    '/api/sessions/:sessionId/assets',
    { bodyLimit: ASSET_BODY_LIMIT, preHandler: requireParticipant(deps) },
    async (req, reply) => {
      const session = req.session!;
      const body = Body.parse(req.body);
      if (!(ASSET_MIMES as readonly string[]).includes(body.mime)) {
        throw new HttpError(415, `unsupported image type ${body.mime}`, 'unsupported_media_type');
      }
      // Cheap upper bound before decoding: 4 base64 chars carry 3 bytes.
      if (Math.floor((body.data_base64.length * 3) / 4) > MAX_ASSET_BYTES + 3) {
        throw new HttpError(413, 'image larger than 5 MiB', 'payload_too_large');
      }
      let data = Buffer.from(body.data_base64, 'base64');
      if (data.length > MAX_ASSET_BYTES) throw new HttpError(413, 'image larger than 5 MiB', 'payload_too_large');
      if (data.length === 0) throw new HttpError(400, 'empty image', 'invalid_request');
      if (body.mime === SVG_MIME) {
        // Kept cleaned (see shared svg.ts).
        const clean = cleanSvg(data.toString('utf8'));
        if (!clean) throw new HttpError(415, 'not an SVG drawing, or one too large', 'unsupported_media_type');
        data = Buffer.from(clean.svg, 'utf8');
      }

      const asset_id = `ast_${newUlid()}`;
      const sessionId = session.session_id;
      await deps.db.transaction(async (tx) => {
        await saveAsset(tx, { asset_id, session_id: sessionId, mime: body.mime, bytes: data.length, filename: body.filename, data, created_at: nowIso() });
        await deps.events.appendServer(
          sessionId,
          'asset_upload',
          { asset_id, mime: body.mime, bytes: data.length, filename: body.filename },
          body.envelope,
          tx,
        );
      });
      return reply.code(201).send({ asset_id, url: `/api/sessions/${sessionId}/assets/${asset_id}` });
    },
  );

  app.post('/api/sessions/:sessionId/assets/uploads', { preHandler: requireParticipant(deps) }, async (req, reply) => {
    if (!deps.bucket) throw new HttpError(409, 'no bucket is configured; upload with POST /assets', 'direct_upload_unavailable');
    const body = UploadBody.parse(req.body);
    checkImage(body.mime, body.bytes);
    // A drawing is cleaned on the way in, so it cannot go straight to the bucket.
    if (body.mime === SVG_MIME) throw new HttpError(415, 'send an SVG to POST /assets', 'unsupported_media_type');
    const sessionId = req.session!.session_id;
    const asset_id = `ast_${newUlid()}`;
    await deps.db.transaction((tx) => saveAsset(tx, { asset_id, session_id: sessionId, mime: body.mime, bytes: body.bytes, filename: body.filename, data: null, storage: 'bucket', status: 'pending', created_at: nowIso() }));
    return reply.code(201).send({
      asset_id,
      upload: { method: 'PUT', url: deps.bucket.presignPut(bucketKey(sessionId, asset_id), body.mime), headers: { 'Content-Type': body.mime } },
    });
  });

  app.post('/api/sessions/:sessionId/assets/:assetId/complete', { preHandler: requireParticipant(deps) }, async (req, reply) => {
    const { assetId } = req.params as { assetId: string };
    const { envelope } = z.object({ envelope: Envelope }).parse(req.body);
    const sessionId = req.session!.session_id;
    const asset = await getAsset(deps.db, sessionId, assetId);
    if (!asset || asset.storage !== 'bucket' || !deps.bucket) throw notFound('asset');
    const url = `/api/sessions/${sessionId}/assets/${assetId}`;
    if (asset.status === 'ready') return reply.send({ asset_id: assetId, url });
    // Trust what is in the bucket, not what the browser said it would send.
    const stored = await deps.bucket.head(bucketKey(sessionId, assetId));
    if (!stored) throw new HttpError(409, 'the file has not arrived in the bucket', 'upload_missing');
    checkImage(stored.contentType ?? asset.mime, stored.bytes);
    await deps.db.transaction(async (tx) => {
      await markAssetReady(tx, assetId, stored.bytes);
      await deps.events.appendServer(sessionId, 'asset_upload', { asset_id: assetId, mime: asset.mime, bytes: stored.bytes, filename: asset.filename }, envelope, tx);
    });
    return reply.send({ asset_id: assetId, url });
  });

  app.get('/api/sessions/:sessionId/assets/:assetId', { preHandler: requireParticipant(deps) }, async (req, reply) => {
    const { assetId } = req.params as { assetId: string };
    return sendAsset(deps, reply, req.session!.session_id, assetId);
  });

  app.get('/api/admin/sessions/:sessionId/assets/:assetId', { preHandler: requireAdmin(deps, { allowQuery: true }) }, async (req, reply) => {
    const { sessionId, assetId } = req.params as { sessionId: string; assetId: string };
    return sendAsset(deps, reply, sessionId, assetId);
  });
}
