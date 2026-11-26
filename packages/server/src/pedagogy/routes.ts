/**
 * The Pedagogy screen's routes (participant token): the pedagogy library on the library server,
 * passed through (the app never imports the library). Browsing is the teacher's own, so it works
 * whatever the plugin's trust level; Off only keeps it from the assistant.
 *   GET  /api/sessions/:sessionId/pedagogy                -> { available, name?, version?, facets? }
 *   POST /api/sessions/:sessionId/pedagogy/entries {...}  -> the library's answer (docs: library/README.md)
 *   POST /api/sessions/:sessionId/pedagogy/entry {id}     -> one entry in full
 *   POST /api/sessions/:sessionId/pedagogy/claims {ids}   -> claims for the "i" hovers
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireParticipant } from '../auth.js';
import type { AppDeps } from '../deps.js';
import { HttpError } from '../http-error.js';
import { createLibraryClient } from '../plugins/library-client.js';
import { createPluginService } from '../plugins/service.js';
import { parseOr400 } from '../http/request.js';
import { callLibrary } from './call.js';
import { pedagogySource } from './source.js';

/** The library server checks the fields; here only that it is an object of a sane size. */
const Body = z.record(z.unknown());

export function registerPedagogyRoutes(app: FastifyInstance, deps: AppDeps): void {
  const plugins = createPluginService(deps.db, deps.events, deps.loaded.config.plugins, deps.env.LIBRARY_URL);
  const clientFor = deps.libraryClient ?? ((url: string) => createLibraryClient(url));
  const guard = { preHandler: requireParticipant(deps) };
  const source = async (sessionId: string) => pedagogySource(await plugins.states(sessionId), clientFor, { evenIfOff: true });

  app.get('/api/sessions/:sessionId/pedagogy', guard, async (req) => {
    const s = await source(req.session!.session_id);
    if (!s) return { available: false };
    const facets = await callLibrary(s, 'facets', {});
    return { available: true, plugin_id: s.pluginId, name: s.name, ...facets };
  });

  for (const op of ['entries', 'entry', 'claims'] as const) {
    app.post(`/api/sessions/:sessionId/pedagogy/${op}`, guard, async (req) => {
      const s = await source(req.session!.session_id);
      if (!s) throw new HttpError(404, 'no pedagogy library is set up here', 'not_found');
      return callLibrary(s, op, parseOr400(Body, req.body ?? {}));
    });
  }
}
