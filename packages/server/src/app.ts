/** Assemble the Fastify app from its dependencies. */
import Fastify, { type FastifyError, type FastifyInstance, type RouteOptions } from 'fastify';
import { ZodError } from 'zod';
import { CanvasError } from '@edw/shared';
import { registerBlockRoutes } from './blocks/index.js';
import type { CanvasServiceImpl } from './blocks/index.js';
import { createChatService, registerChatRoutes } from './gateway/index.js';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AppDeps } from './deps.js';
import { logUrl } from './auth.js';
import { registerAssetRoutes } from './assets/routes.js';
import { registerPictureRoutes } from './pictures/routes.js';
import { registerEventRoutes } from './events/routes.js';
import { registerCommentRoutes } from './comments/routes.js';
import { registerExportRoutes } from './export/routes.js';
import { registerContentPackRoutes } from './content-packs/routes.js';
import { registerPluginRoutes } from './plugins/routes.js';
import { registerDraftRoutes } from './plugins/drafts/routes.js';
import { draftChatFor } from './plugins/drafts/chat.js';
import { registerPreferenceRoutes } from './preferences/routes.js';
import { registerLessonRoutes } from './lessons/routes.js';
import { registerUsageRoutes } from './usage/routes.js';
import { registerBudgetRoutes } from './budget/routes.js';
import { registerProjectRoutes } from './projects/routes.js';
import { registerClassRoutes } from './classes/routes.js';
import { registerNeedsGroupRoutes } from './needs-groups/routes.js';
import { registerAdaptationRoutes } from './classes/adaptation-routes.js';
import { registerCurriculumRoutes } from './classes/curriculum-routes.js';
import { registerPedagogyRoutes } from './pedagogy/routes.js';
import { registerReferenceRoutes } from './references/routes.js';
import { registerSessionRoutes } from './sessions/routes.js';
import { registerHealthRoutes } from './health/routes.js';
import { registerFeatureRoutes } from './features/routes.js';
import { registerInviteRoutes } from './accounts/admin-routes.js';
import { registerSignInRoutes } from './accounts/routes.js';
import { createWrongCodeCounter } from './http/wrong-codes.js';
import { registerAccessRoutes } from './access/routes.js';
import { registerMakeRoutes } from './make/routes.js';
import { registerJobRoutes } from './jobs/routes.js';
import { libraryClientFor } from './plugins/library-client.js';

export interface BuildAppOptions {
  logger?: boolean;
  /** Where log lines go (tests); stdout by default. */
  logStream?: { write(line: string): void };
  /** Told of every route as it is registered (routes.test.ts checks them against docs/routes.md). */
  onRoute?: (route: RouteOptions) => void;
}

const CANVAS_STATUS: Record<CanvasError['code'], number> = {
  unknown_block: 404,
  unknown_doc: 404,
  bad_anchor: 400,
  cross_doc: 400,
  block_not_editable: 409,
  nothing_pending: 409,
  duplicate_id: 409,
};

export async function buildApp(given: AppDeps, opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  // One way to reach a library for every route and the chat, carrying LIBRARY_TOKEN to LIBRARY_URL.
  const deps: AppDeps = { ...given, libraryClient: given.libraryClient ?? libraryClientFor(given.env) };
  const app = Fastify({
    logger: opts.logger
      ? {
          // As Fastify's own, but with the query string dropped from sign-in addresses (auth.ts logUrl).
          serializers: { req: (req) => ({ method: req.method, url: logUrl(req.url), hostname: req.hostname, remoteAddress: req.ip, remotePort: req.socket?.remotePort }) },
          ...(opts.logStream ? { stream: opts.logStream } : {}),
        }
      : false,
  });

  if (opts.onRoute) app.addHook('onRoute', opts.onRoute);

  app.setErrorHandler((err: FastifyError & { issues?: unknown }, req, reply) => {
    if (err instanceof CanvasError) {
      return reply.code(CANVAS_STATUS[err.code] ?? 409).send({ error: err.message, code: err.code });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'invalid request', code: 'invalid_request', issues: err.issues });
    }
    const status = typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    if (status >= 500) {
      req.log.error({ err }, 'unhandled error');
      return reply.code(status).send({ error: 'internal server error' });
    }
    const body: { error: string; code?: string; issues?: unknown } = { error: err.message };
    if (typeof err.code === 'string') body.code = err.code;
    if (err.issues !== undefined) body.issues = err.issues;
    return reply.code(status).send(body);
  });

  // CORS for a client served from PUBLIC_BASE_URL. Without it the client is same-origin (served
  // by this server, or by the Vite dev server, which proxies /api), so no header is sent.
  const origin = deps.env.PUBLIC_BASE_URL ? new URL(deps.env.PUBLIC_BASE_URL).origin : null;
  app.addHook('onRequest', async (req, reply) => {
    // Workspace links are secrets: no search indexing, and no Referer to other sites.
    reply.header('X-Robots-Tag', 'noindex, nofollow');
    reply.header('Referrer-Policy', 'no-referrer');
    if (origin) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      return reply
        .code(204)
        .header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        .header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        .header('Access-Control-Max-Age', '600')
        .send();
    }
  });

  app.get('/api/health', async () => ({ ok: true, provider: deps.env.PROVIDER, tool_version: deps.env.TOOL_VERSION }));

  registerHealthRoutes(app, deps);
  registerJobRoutes(app, deps);
  registerSessionRoutes(app, deps);
  registerFeatureRoutes(app, deps);
  registerInviteRoutes(app, deps);
  registerSignInRoutes(app, deps);
  const wrongCodes = createWrongCodeCounter();
  registerAccessRoutes(app, deps, { counter: wrongCodes });
  registerMakeRoutes(app, deps);
  registerEventRoutes(app, deps);
  registerBlockRoutes(app, deps);
  registerAssetRoutes(app, deps);
  registerPictureRoutes(app, deps);
  registerExportRoutes(app, deps);
  registerContentPackRoutes(app, deps);
  // registerScrubRoutes (gateway/scrub-routes.ts): off until Sam decides what removal should do (#16).
  registerCommentRoutes(app, deps);
  registerProjectRoutes(app, deps);
  registerClassRoutes(app, deps);
  registerNeedsGroupRoutes(app, deps);
  registerCurriculumRoutes(app, deps);
  registerAdaptationRoutes(app, deps);
  registerPedagogyRoutes(app, deps);
  const drafts = draftChatFor(deps);
  registerPluginRoutes(app, deps, drafts);
  registerDraftRoutes(app, deps);
  registerPreferenceRoutes(app, deps);
  registerLessonRoutes(app, deps);
  registerUsageRoutes(app, deps);
  registerBudgetRoutes(app, deps);
  registerReferenceRoutes(app, deps);
  const chat = createChatService({
    db: deps.db,
    events: deps.events,
    canvas: deps.canvas as CanvasServiceImpl,
    threads: deps.threads,
    provider: deps.provider,
    loaded: deps.loaded,
    pictures: deps.pictures ?? null,
    libraryUrl: deps.env.LIBRARY_URL,
    ...(deps.libraryClient ? { libraryClient: deps.libraryClient } : {}),
    drafts,
    ...(deps.env.FUNCTION_LIMIT_MS ? { functionLimitMs: deps.env.FUNCTION_LIMIT_MS } : {}),
  });
  registerChatRoutes(app, deps, chat);

  // Serve the built client (packages/client/dist) when present, with an SPA fallback for /s/:token and /admin.
  const clientDist = join(deps.env.REPO_ROOT, 'packages', 'client', 'dist');
  const serveClient = existsSync(join(clientDist, 'index.html'));
  // `wildcard: true`: files are looked up on each request, so a client rebuilt while the server
  // runs is served at once (with `false` the file list is fixed at start-up, and a rebuild's new
  // asset names fell through to index.html: a blank page).
  if (serveClient) await app.register(fastifyStatic, { root: clientDist, prefix: '/', wildcard: true });
  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split('?')[0] ?? req.url;
    // A missing script or stylesheet is a 404, never the page, so a stale tab fails plainly.
    if (serveClient && req.method === 'GET' && !path.startsWith('/api/') && !path.startsWith('/assets/')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: `no route for ${req.method} ${path}` });
  });

  return app;
}
