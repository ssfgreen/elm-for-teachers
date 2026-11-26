/** Send one ready asset of a workspace: its bytes, or a redirect to the bucket. Shared by every asset route. */
import type { FastifyReply } from 'fastify';
import { SVG_MIME } from '@edw/shared';
import type { AppDeps } from '../deps.js';
import { notFound } from '../http-error.js';
import { bucketKey, getAsset } from './store.js';

export async function sendAsset(deps: AppDeps, reply: FastifyReply, sessionId: string, assetId: string): Promise<FastifyReply> {
  const asset = await getAsset(deps.db, sessionId, assetId);
  if (!asset || asset.status !== 'ready') throw notFound('asset');
  if (asset.storage === 'bucket') {
    if (!deps.bucket) throw notFound('asset');
    // The signed URL lasts an hour; the browser may keep the redirect for five minutes.
    return reply.header('Cache-Control', 'private, max-age=300').redirect(deps.bucket.presignGet(bucketKey(sessionId, assetId), 3600), 302);
  }
  if (!asset.data) throw notFound('asset');
  // An SVG opened on its own is a page of this site: it may not run script or load anything.
  if (asset.mime === SVG_MIME) reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");
  return reply
    .header('Content-Type', asset.mime)
    .header('Content-Length', asset.data.length)
    .header('Cache-Control', 'private, max-age=3600')
    .header('X-Content-Type-Options', 'nosniff')
    .send(asset.data);
}
