/**
 * The pupil's reader (#213, plan C item R1), for a signed-in pupil:
 *   GET    /api/pupil/readings                                   -> { readings }   (newest first)
 *   GET    /api/pupil/readings/:readingId                        -> { reading }    (the frozen copy; prompts without instructions)
 *   GET    /api/pupil/readings/:readingId/highlights             -> { highlights } (the pupil's own)
 *   POST   /api/pupil/readings/:readingId/highlights {block_id, start, end, category} -> 201 { highlight }
 *   DELETE /api/pupil/readings/:readingId/highlights/:highlightId -> 204
 *   GET    /api/pupil/readings/:readingId/assets/:assetId        -> a picture the copy names
 *
 * Every route but the list is for the reading's class: the pupil must be a member and the class
 * open to them (`memberOf`, class-joins/member.ts, which runs `pupilsRefusal`), else 403 with the
 * reason. An unknown reading is refused the same way as another class's, so ids cannot be probed;
 * a removed one is 404 to its own class. The teacher's test member counts as a pupil here.
 *
 * Research data: none of this writes `events`, the call log or the export.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { HighlightFields, readerBlock, readingAssetIds } from '@edw/shared';
import { fromSite, requirePupil } from '../auth.js';
import { sendAsset } from '../assets/send.js';
import { classOpen, memberOf } from '../class-joins/member.js';
import { createClassJoinStore } from '../class-joins/store.js';
import type { AppDeps } from '../deps.js';
import { badRequest, conflict, HttpError, notFound } from '../http-error.js';
import { parseOr400 } from '../http/request.js';
import { pupilCookieNames } from '../pupils/cookies.js';
import { pupilsRefusal } from '../pupils/gate.js';
import { createPupilStore } from '../pupils/store.js';
import { createReaderStore, type ReadingRow } from './store.js';

type ReadingParams = { Params: { readingId: string } };

export function registerReaderRoutes(app: FastifyInstance, deps: AppDeps): void {
  const pupils = deps.pupils ?? createPupilStore(deps.db);
  const joins = deps.classJoins ?? createClassJoinStore(deps.db, deps.events);
  const store = createReaderStore(deps.db);
  const memberDeps = { joins, sessions: deps.sessions, env: deps.env };
  const signedIn = requirePupil(pupils, pupilCookieNames(deps.env.AUTH_BASE_URL).signIn);

  /** The reading and the pupil's membership of its class, or the refusal. */
  const open = async (req: FastifyRequest<ReadingParams>): Promise<{ reading: ReadingRow; memberId: string }> => {
    const reading = await store.reading(req.params.readingId);
    const m = reading ? await memberOf(memberDeps, req.pupil!.id, reading.class_id) : ({ ok: false, reason: 'not_member' } as const);
    if (!m.ok) throw new HttpError(403, 'not open to this pupil', m.reason);
    if (reading!.removed) throw notFound('reading');
    return { reading: reading!, memberId: m.member.id };
  };

  const sameSite = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!fromSite(req, deps.env.AUTH_BASE_URL)) return reply.code(403).send({ error: 'must come from this site' });
  };

  void app.register(
    async (r) => {
      r.addHook('onRequest', async (_req, reply) => {
        reply.header('cache-control', 'no-store');
        const off = pupilsRefusal(deps.env);
        if (off) return reply.code(403).send({ error: 'pupil sign-in is switched off', code: off });
      });

      r.get('', { preHandler: signedIn }, async (req) => {
        const open = [];
        for (const m of await joins.classesOf(req.pupil!.id)) if ((await classOpen(memberDeps, m)).ok) open.push(m);
        return { readings: await store.readingsOf(open) };
      });

      r.get<ReadingParams>('/:readingId', { preHandler: signedIn }, async (req) => {
        const { reading } = await open(req);
        const classRow = await joins.member(req.pupil!.id, reading.class_id);
        return {
          reading: {
            id: reading.id,
            name: reading.name,
            class_name: classRow?.class_name ?? '',
            blocks: reading.blocks,
            prompts: await store.prompts(reading.id),
            follow_ups_max: (await store.followUpsMax(reading)) ?? deps.loaded.config.reader.follow_ups_max,
          },
        };
      });

      r.get<ReadingParams>('/:readingId/highlights', { preHandler: signedIn }, async (req) => {
        const { reading, memberId } = await open(req);
        return { highlights: await store.highlights(memberId, reading.id) };
      });

      r.post<ReadingParams>('/:readingId/highlights', { preHandler: [signedIn, sameSite] }, async (req, reply) => {
        const { reading, memberId } = await open(req);
        const fields = parseOr400(HighlightFields, req.body);
        const block = reading.blocks.find((b) => b.id === fields.block_id);
        if (!block) throw badRequest('no such block in the reading', 'unknown_block');
        if (fields.end > readerBlock(block).text.length) throw badRequest('the range is outside the block', 'bad_range');
        const made = await store.addHighlight(reading, memberId, fields);
        if (made === 'full') throw conflict('too many highlights on this reading', 'highlights_full');
        return reply.code(201).send({ highlight: made });
      });

      r.delete<{ Params: { readingId: string; highlightId: string } }>('/:readingId/highlights/:highlightId', { preHandler: [signedIn, sameSite] }, async (req, reply) => {
        const { reading, memberId } = await open(req);
        if (!(await store.removeHighlight(memberId, reading.id, req.params.highlightId))) throw notFound('highlight');
        return reply.code(204).send();
      });

      r.get<{ Params: { readingId: string; assetId: string } }>('/:readingId/assets/:assetId', { preHandler: signedIn }, async (req, reply) => {
        const { reading } = await open(req);
        if (!readingAssetIds(reading.blocks).includes(req.params.assetId)) throw notFound('asset');
        return sendAsset(deps, reply, reading.session_id, req.params.assetId);
      });
    },
    { prefix: '/api/pupil/readings' },
  );
}
