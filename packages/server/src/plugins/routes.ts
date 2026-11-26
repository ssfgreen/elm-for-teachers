/**
 * Plugin routes (participant token), for the Plugins screen and Ask first:
 *   GET  /api/sessions/:sessionId/plugins[?thread_id=]                 -> { plugins }
 *   POST /api/sessions/:sessionId/plugins/:pluginId/trust {trust, envelope}      -> { plugin }
 *   POST /api/sessions/:sessionId/plugins/:pluginId/allow {thread_id, envelope}  -> { plugin }
 * Allow is for an Ask first plugin in one chat; for any other level it changes nothing.
 * With a chat, the list also holds the workspace's studio drafts, always Ask first, and Allow
 * takes a draft's id (#159); the Plugins screen (no chat) lists drafts on its own.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PluginTrust } from '@edw/shared';
import { requireParticipant } from '../auth.js';
import { Envelope, parseOr400 } from '../http/request.js';
import type { AppDeps } from '../deps.js';
import { notFound } from '../http-error.js';
import type { DraftChat } from './drafts/chat.js';
import { createPluginService, pluginInfo } from './service.js';

const TrustBody = z.object({ trust: PluginTrust, envelope: Envelope });
const AllowBody = z.object({ thread_id: z.string().min(1), envelope: Envelope });

type PluginParams = { Params: { sessionId: string; pluginId: string } };

export function registerPluginRoutes(app: FastifyInstance, deps: AppDeps, drafts?: DraftChat): void {
  const plugins = createPluginService(deps.db, deps.events, deps.loaded.config.plugins, deps.env.LIBRARY_URL);
  const guard = { preHandler: requireParticipant(deps) };

  app.get<{ Querystring: { thread_id?: string } }>('/api/sessions/:sessionId/plugins', guard, async (req) => {
    const sessionId = req.session!.session_id;
    const threadId = req.query.thread_id || null;
    if (threadId && !(await deps.threads.get(sessionId, threadId))) throw notFound('thread');
    const listed = (await plugins.states(sessionId, threadId)).map((s) => pluginInfo(s, threadId !== null));
    return { plugins: threadId && drafts ? [...listed, ...(await drafts.infos(sessionId, threadId))] : listed };
  });

  app.post<PluginParams>('/api/sessions/:sessionId/plugins/:pluginId/trust', guard, async (req) => {
    const { trust, envelope } = parseOr400(TrustBody, req.body);
    const state = await plugins.setTrust(req.session!.session_id, req.params.pluginId, trust, envelope);
    if (!state) throw notFound('plugin');
    return { plugin: pluginInfo(state, false) };
  });

  app.post<PluginParams>('/api/sessions/:sessionId/plugins/:pluginId/allow', guard, async (req) => {
    const sessionId = req.session!.session_id;
    const { thread_id, envelope } = parseOr400(AllowBody, req.body);
    if (!(await deps.threads.get(sessionId, thread_id))) throw notFound('thread');
    const state = await plugins.grant(sessionId, thread_id, req.params.pluginId, envelope);
    if (state) return { plugin: pluginInfo(state, true) };
    const draft = drafts ? await drafts.grant(sessionId, thread_id, req.params.pluginId, envelope) : null;
    if (!draft) throw notFound('plugin');
    return { plugin: draft };
  });
}
