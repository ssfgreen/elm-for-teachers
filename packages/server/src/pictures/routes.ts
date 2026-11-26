/**
 * The teacher swaps the assistant's picture for another it found.
 *   POST /api/sessions/:sessionId/pictures/choose   { turn_id, block_id, picture, envelope } -> { changes, asset_id }
 * The picture must be one the turn offered for that block (gateway/pictures.ts). It is fetched from
 * ARASAAC, saved as a PNG asset, and put in the block as the teacher's edit, which accepts a
 * suggested block (as typing into one does). Logged: asset_upload, picture_choose, then the edit.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { editBlock, newUlid, nowIso } from '@edw/shared';
import { requireParticipant } from '../auth.js';
import { saveAsset } from '../assets/store.js';
import { Envelope } from '../http/request.js';
import { publicChanges } from '../http/views.js';
import type { CanvasServiceImpl } from '../blocks/service.js';
import type { AppDeps } from '../deps.js';
import { loadTurns } from '../gateway/history.js';
import { HttpError, notFound } from '../http-error.js';

const Body = z.object({
  turn_id: z.string().min(1).max(100),
  block_id: z.string().min(1).max(100),
  picture: z.number().int().positive(),
  envelope: Envelope,
});

export function registerPictureRoutes(app: FastifyInstance, deps: AppDeps): void {
  const canvas = deps.canvas as CanvasServiceImpl;

  app.post('/api/sessions/:sessionId/pictures/choose', { preHandler: requireParticipant(deps) }, async (req) => {
    const sessionId = req.session!.session_id;
    const body = Body.parse(req.body);
    const turn = (await loadTurns(deps.db, sessionId)).find((t) => t.turn_id === body.turn_id);
    const offer = turn?.pictures?.find((p) => p.block_id === body.block_id);
    const position = offer ? offer.options.findIndex((o) => o.id === body.picture) : -1;
    if (!turn || !offer || position < 0) throw notFound('picture offer');
    if (!deps.pictures) throw new HttpError(503, 'pictures are not available', 'pictures_unavailable');
    const option = offer.options[position]!;
    const data = await deps.pictures.image(option.id);
    if (!data) throw new HttpError(502, 'ARASAAC did not send the picture; try again', 'picture_unavailable');

    const alt = (option.id === offer.chosen ? offer.alt : option.label).replace(/[[\]\n]/g, '');
    const asset_id = `ast_${newUlid()}`;
    const filename = `${alt.slice(0, 80) || 'picture'}.png`;
    const envelope = body.envelope;
    const changes = await deps.db.transaction(async (tx) => {
      await saveAsset(tx, { asset_id, session_id: sessionId, mime: 'image/png', bytes: data.length, filename, data, created_at: nowIso() });
      await deps.events.appendServer(sessionId, 'asset_upload', { asset_id, mime: 'image/png', bytes: data.length, filename, turn_id: turn.turn_id }, envelope, tx);
      const chose = await deps.events.appendServer(
        sessionId,
        'picture_choose',
        { turn_id: turn.turn_id, block_id: body.block_id, picture: option.id, position, replaced: offer.chosen, asset_id },
        envelope,
        tx,
      );
      const r = await canvas.mutate(sessionId, (s, c) => editBlock(s, c, { block_id: body.block_id, after: { content: `![${alt}](asset:${asset_id})` }, cause_event_id: chose.event_id }), { tx, envelope });
      if (r.implicit_accept) await deps.events.appendServer(sessionId, 'proposal_accept', { block_id: body.block_id, doc_id: null, mode: 'edit_then_accept' }, envelope, tx);
      return r.changes;
    });
    return { changes: publicChanges(changes), asset_id };
  });
}
