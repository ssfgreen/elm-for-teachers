/**
 * A class's curriculum (participant token), under /api/sessions/:sessionId:
 *   GET  /curriculum                                               -> the curriculum's areas, organisers and counts (structure)
 *   POST /curriculum/search {query?, level?, stage?, area?, organiser?} -> { version, options, total, truncated }
 *   POST /curriculum/benchmarks {codes}                            -> { benchmark_levels, benchmarks }
 *   POST /classes/:id/curriculum {items, status?, envelope}        -> 201 { items } (the ones added)
 *   POST /classes/:id/curriculum/:itemId/status {status, envelope} -> { item } (status `removed` takes it off)
 * The class's items come with GET /classes/:id. The curriculum itself is the structured
 * collection on the library server (library/README.md, "The structured curriculum").
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CURRICULUM_PER_CLASS, CurriculumPick, CurriculumStatus, LEVEL_DIGITS, type CurriculumOption } from '@edw/shared';
import { requireParticipant } from '../auth.js';
import { Envelope, parseOr400 } from '../http/request.js';
import type { AppDeps } from '../deps.js';
import { HttpError, notFound } from '../http-error.js';
import { createLibraryClient } from '../plugins/library-client.js';
import { createPluginService } from '../plugins/service.js';
import { callLibrary } from '../pedagogy/call.js';
import { curriculumSource } from '../pedagogy/source.js';
import { createCurriculumService } from './curriculum.js';

const LEVEL_NAMES = Object.keys(LEVEL_DIGITS);
const Text = z.string().max(200).optional();
const SearchBody = z.object({ query: Text, level: z.number().int().min(0).max(4).optional(), stage: Text, area: Text, organiser: Text });
const BenchmarksBody = z.object({ codes: z.array(z.string().min(1).max(60)).min(1).max(80) });
const PickBody = z.object({ items: z.array(CurriculumPick).min(1).max(CURRICULUM_PER_CLASS), status: CurriculumStatus.default('now'), envelope: Envelope });
const StatusBody = z.object({ status: z.union([CurriculumStatus, z.literal('removed')]), envelope: Envelope });

type Id = { Params: { sessionId: string; id: string } };
type ItemId = { Params: { sessionId: string; id: string; itemId: string } };
type Outcome = { code: string; text: string; area: string; organiser: string; sub_organiser: string | null };

/** A query as the curriculum collection takes it: a code (or its start) or words, at a level. Pure. */
export function outcomesQuery(q: z.infer<typeof SearchBody>): Record<string, unknown> {
  const text = q.query?.trim() ?? '';
  const isCode = /^[A-Za-z]{2,5}(\s*[0-4](-\d{0,2}[a-z]?)?)?$/.test(text) && /[A-Z]{2}/.test(text);
  return {
    ...(q.level !== undefined ? { level: LEVEL_NAMES[q.level] } : {}),
    ...(q.stage ? { stage: q.stage } : {}),
    ...(q.area ? { area: q.area } : {}),
    ...(q.organiser ? { organiser: q.organiser } : {}),
    ...(text ? (isCode ? { code: text.toUpperCase().replace(/^([A-Z]+)\s*/, '$1 ').trim() } : { text }) : {}),
    limit: 150,
  };
}

export function registerCurriculumRoutes(app: FastifyInstance, deps: AppDeps): void {
  const curriculum = createCurriculumService(deps.db, deps.events);
  const plugins = createPluginService(deps.db, deps.events, deps.loaded.config.plugins, deps.env.LIBRARY_URL);
  const clientFor = deps.libraryClient ?? ((url: string) => createLibraryClient(url));
  const guard = { preHandler: requireParticipant(deps) };
  const base = '/api/sessions/:sessionId';
  const source = async (sessionId: string) => {
    const s = curriculumSource(await plugins.states(sessionId), clientFor, deps.env.LIBRARY_URL);
    if (!s) throw new HttpError(404, 'the curriculum is not set up here', 'not_found');
    return s;
  };

  app.get(`${base}/curriculum`, guard, async (req) => callLibrary(await source(req.session!.session_id), 'structure', {}));

  app.post(`${base}/curriculum/search`, guard, async (req) => {
    const q = parseOr400(SearchBody, req.body ?? {});
    const found = await callLibrary(await source(req.session!.session_id), 'outcomes', outcomesQuery(q));
    const options: CurriculumOption[] = ((found.outcomes as Outcome[] | undefined) ?? []).map((o) => ({ code: o.code, text: o.text, area: o.area, organiser: o.organiser, sub_organiser: o.sub_organiser }));
    return { version: found.version ?? null, options, total: found.total ?? options.length, truncated: found.truncated === true };
  });

  app.post(`${base}/curriculum/benchmarks`, guard, async (req) => {
    const { codes } = parseOr400(BenchmarksBody, req.body ?? {});
    return callLibrary(await source(req.session!.session_id), 'benchmarks', { codes });
  });

  app.post<Id>(`${base}/classes/:id/curriculum`, guard, async (req, reply) => {
    const { items, status, envelope } = parseOr400(PickBody, req.body);
    return reply.code(201).send({ items: await curriculum.pick(req.session!.session_id, req.params.id, items, status, envelope) });
  });

  app.post<ItemId>(`${base}/classes/:id/curriculum/:itemId/status`, guard, async (req) => {
    const { status, envelope } = parseOr400(StatusBody, req.body);
    const item = await curriculum.setStatus(req.session!.session_id, req.params.id, req.params.itemId, status, envelope);
    if (!item) throw notFound('curriculum item');
    return { item };
  });
}
