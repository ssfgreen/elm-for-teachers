/**
 * Session and thread routes.
 * Admin (auth.ts requireAdmin: an admin's sign-in, or the password off Vercel or on a Vercel preview), under /api/admin:
 *   POST /sessions {label, study?, features?} -> { session, participant_url }; `study`: starts with the demo class and demo chat (study/seed.ts); if the seed fails, the session is deleted and the request fails.
 *        `features`: switches to start with (shared/src/features.ts), the rest on; session rows carry `features`, the set in force.
 *   PUT /sessions/:sessionId/features: features/routes.ts
 *   GET  /sessions                   -> { sessions: [{ ...session, last_opened_at, participant_url }] }
 *   PATCH  /sessions/:sessionId {label} -> { session, participant_url }; renames it
 *   POST /sessions/:sessionId/access-code -> { session }; a new access code, replacing any it had
 *        (for workspaces made before codes); 409 `account_workspace` for an account workspace,
 *        409 `link_closed` for a closed link (replace the link instead)
 *   POST /sessions/:sessionId/link/replace -> { session }; a new link and access code, the old
 *        ones stop working (a closed link opens again this way)
 *   POST /sessions/:sessionId/link/close   -> { session }; the link and code stop working, none
 *        is issued. Both log `workspace_link` and answer 409 `account_workspace` for an account workspace.
 *   Session rows carry `access_code` (`XXXX-XXXX-XXXX`, or null) and `link_closed_at`;
 *   `participant_url` is null for an account workspace, which is reached by signing in, and for a closed link.
 *   DELETE /sessions/:sessionId      -> 204; the session and all its data, bucket images too; 409 last_admin for the only admin's workspace
 *   PUT  /sessions/:sessionId/interactions {on, hours?} -> { session }; interaction logging on
 *        (for `hours`, or until turned off when null or absent) or off. Session rows carry
 *        `interactions_active`: on and not past its end.
 * Participant (participant token):
 *   GET  /api/participant?token=     -> { session_id }; records the open (not with open=0: the make kit)
 *   GET  /api/sessions/:sessionId    -> { session_id, label, config: { thresholds, uploads, interactions, spyglass, features, models?, default_model?, default_effort? } }
 *     `features`: this workspace's switches; `spyglass` is 'off' when its switch is off, whatever the config says.
 *     `interactions` is true while interaction logging is on (sessions/interactions.ts).
 *     `uploads` is 'bucket' when images go straight to a bucket (POST /assets/uploads), else 'inline'.
 *   GET  /api/sessions/:sessionId/threads              -> { threads }
 *   POST /api/sessions/:sessionId/threads {envelope, project_id? | class_id? | year_group_id?} -> { thread, doc }; 404 for an unknown project, class or year group, 409 for an archived one, 400 for more than one
 *   POST /api/sessions/:sessionId/threads/:threadId/rename {title, envelope} -> { thread }
 *   POST /api/sessions/:sessionId/threads/:threadId/name {envelope, auto?} -> { thread }; the model names it
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { FeaturesPatch, modelChoices, Ulid } from '@edw/shared';
import { requireAdmin, requireParticipant, requestToken } from '../auth.js';
import { bucketKey } from '../assets/store.js';
import type { AppDeps, SessionRow } from '../deps.js';
import { conflict, HttpError, notFound } from '../http-error.js';
import { Envelope, parseOr400 } from '../http/request.js';
import { interactionsActive, sessionView } from '../http/views.js';
import { loadTurns } from '../gateway/history.js';
import { NEW_THREAD_TITLE } from '../threads/service.js';
import { AUTO_NAME_AFTER, suggestTitle } from '../threads/title.js';
import { MAX_HOURS, untilAfter } from './interactions.js';
import { seedStudyWorkspace } from '../study/seed.js';

const Label = z.string().trim().min(1).max(120);
const CreateBody = z.object({ label: Label, study: z.boolean().optional(), features: FeaturesPatch.optional() });
const RenameSessionBody = z.object({ label: Label });
const ThreadBody = z.object({ envelope: Envelope, project_id: Ulid.nullable().optional(), class_id: Ulid.nullable().optional(), year_group_id: Ulid.nullable().optional() });
const InteractionsBody = z.object({ on: z.boolean(), hours: z.number().int().min(1).max(MAX_HOURS).nullable().optional() });
const RenameBody = z.object({ title: z.string().trim().min(1).max(120), envelope: Envelope });

/** Scheme and host the admin page was opened on, so links work in dev (5173) and production (3000) alike. */
export function requestOrigin(req: FastifyRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol;
  const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host ?? 'localhost';
  return `${proto}://${host}`;
}

function participantUrl(deps: Pick<AppDeps, 'env'>, s: SessionRow, req: FastifyRequest): string | null {
  if (s.access === 'account' || s.link_closed_at) return null;
  const base = deps.env.PUBLIC_BASE_URL ?? requestOrigin(req);
  return `${base.replace(/\/+$/, '')}/s/${s.participant_token}`;
}

export function registerSessionRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { sessions, threads, loaded } = deps;

  void app.register(
    async (admin) => {
      admin.addHook('preHandler', requireAdmin(deps));

      admin.post('/sessions', async (req, reply) => {
        const { label, study, features } = parseOr400(CreateBody, req.body);
        const by = req.admin;
        const { session } = await sessions.create(label, { ...(features ? { features } : {}), via: by?.via ?? 'password', ...(by?.via === 'account' ? { accountId: by.account.id } : {}) });
        // The seed runs outside the create transaction (one would mean passing `tx` through six
        // services), so a seed that fails takes the new session with it: no half-made workspace.
        if (study) {
          try {
            await seedStudyWorkspace({ db: deps.db, events: deps.events, canvas: deps.canvas, threads }, session.session_id);
          } catch (err) {
            // The bucket images `delete` returns are not removed here: the seed writes none.
            await sessions.delete(session.session_id).catch((e: unknown) => req.log.error({ err: e, session_id: session.session_id }, 'study seed failed and the session was not deleted'));
            throw err;
          }
        }
        return reply.code(201).send({ session, participant_url: participantUrl(deps, session, req) });
      });

      admin.get('/sessions', async (req) => ({
        sessions: (await sessions.list()).map((s) => ({ ...sessionView(s), participant_url: participantUrl(deps, s, req) })),
      }));

      admin.put<{ Params: { sessionId: string } }>('/sessions/:sessionId/interactions', async (req) => {
        const { on, hours } = parseOr400(InteractionsBody, req.body);
        const session = await sessions.setInteractions(req.params.sessionId, on, on ? untilAfter(hours ?? null) : null);
        if (!session) throw notFound('session');
        return { session: sessionView(session) };
      });

      admin.post<{ Params: { sessionId: string } }>('/sessions/:sessionId/access-code', async (req) => {
        const session = await sessions.newAccessCode(req.params.sessionId);
        if (!session) throw notFound('session');
        if (session === 'account') throw conflict('an account workspace is reached by signing in, not by a code', 'account_workspace');
        if (session === 'closed') throw conflict('this workspace’s link is closed: issue a new link instead', 'link_closed');
        return { session, participant_url: participantUrl(deps, session, req) };
      });

      // The row comes back whole, as the list has it, so the admin screen can put it in place.
      for (const action of ['replace', 'close'] as const) {
        admin.post<{ Params: { sessionId: string } }>(`/sessions/:sessionId/link/${action}`, async (req) => {
          const session = await sessions.setLink(req.params.sessionId, action, req.admin?.via ?? 'password');
          if (!session) throw notFound('session');
          if (session === 'account') throw conflict('an account workspace is reached by signing in, not by a link', 'account_workspace');
          return { session: { ...sessionView(session), participant_url: participantUrl(deps, session, req) } };
        });
      }

      admin.patch<{ Params: { sessionId: string } }>('/sessions/:sessionId', async (req) => {
        const { label } = parseOr400(RenameSessionBody, req.body);
        const session = await sessions.rename(req.params.sessionId, label);
        if (!session) throw notFound('session');
        return { session, participant_url: participantUrl(deps, session, req) };
      });

      admin.delete<{ Params: { sessionId: string } }>('/sessions/:sessionId', async (req, reply) => {
        const deleted = await sessions.delete(req.params.sessionId);
        if (!deleted) throw notFound('session');
        // The database rows are gone either way; an image the bucket keeps is logged, not fatal.
        const { bucket } = deps;
        if (bucket) {
          const results = await Promise.allSettled(deleted.bucketAssetIds.map((id) => bucket.delete(bucketKey(req.params.sessionId, id))));
          const failed = results.filter((r) => r.status === 'rejected').length;
          if (failed) req.log.warn({ session_id: req.params.sessionId, failed }, 'bucket images not deleted');
        }
        return reply.code(204).send();
      });
    },
    { prefix: '/api/admin' },
  );

  const guard = { preHandler: requireParticipant(deps) };

  app.get('/api/sessions/:sessionId', guard, async (req) => {
    const s = req.session!;
    return {
      session_id: s.session_id,
      label: s.label,
      config: {
        thresholds: loaded.config.thresholds,
        uploads: deps.bucket ? 'bucket' : 'inline',
        interactions: interactionsActive(s),
        // What Spyglass offers: off hides its toggle and callout (the checks still run). The
        // workspace's switch turns it off whatever the config says.
        spyglass: s.features.spyglass ? loaded.config.spyglass.mode : 'off',
        features: s.features,
        // The models the teacher can pick under the chat box (agent mode), with the defaults.
        ...(loaded.config.mode === 'agent' ? { models: modelChoices(loaded.config.provider), default_model: loaded.config.provider.model, default_effort: loaded.config.agent.reasoning_effort } : {}),
      },
    };
  });

  app.get('/api/sessions/:sessionId/threads', guard, async (req) => ({ threads: await threads.listForTeacher(req.session!.session_id) }));

  app.post('/api/sessions/:sessionId/threads', guard, async (req, reply) => {
    const { envelope, ...place } = parseOr400(ThreadBody, req.body);
    return reply.code(201).send(await threads.create(req.session!.session_id, envelope, undefined, place));
  });

  app.post<{ Params: { sessionId: string; threadId: string } }>('/api/sessions/:sessionId/threads/:threadId/rename', guard, async (req) => {
    const { title, envelope } = parseOr400(RenameBody, req.body);
    const thread = await threads.rename(req.session!.session_id, req.params.threadId, title, envelope);
    if (!thread) throw notFound('thread');
    return { thread };
  });

  /**
   * The model names the chat from what is in it (threads/title.ts). The wand: 409 if there is
   * nothing to name it from; 502 if the call failed. `auto` (the client asks after each turn in an
   * Untitled chat): only an Untitled chat with AUTO_NAME_AFTER prompts or more is named, and only
   * if the teacher has not named it meanwhile; otherwise, or if the call fails, the chat comes back
   * as it is, with no error to show.
   */
  app.post<{ Params: { sessionId: string; threadId: string } }>('/api/sessions/:sessionId/threads/:threadId/name', guard, async (req) => {
    const sid = req.session!.session_id;
    const { envelope, auto } = parseOr400(z.object({ envelope: Envelope, auto: z.boolean().optional() }), req.body);
    const thread = await threads.get(sid, req.params.threadId);
    if (!thread) throw notFound('thread');
    if (auto && thread.title !== NEW_THREAD_TITLE) return { thread };
    const turns = (await loadTurns(deps.db, sid, thread.id)).filter((t) => !t.comment_id);
    if (auto && turns.length < AUTO_NAME_AFTER) return { thread };
    if (turns.length === 0) throw conflict('there is nothing in this chat to name it from yet', 'chat_empty');
    const docs = await deps.db.execute('SELECT name FROM docs WHERE session_id = ? AND thread_id = ? AND deleted_at IS NULL ORDER BY created_at', [sid, thread.id]);
    const others = (await threads.list(sid)).filter((t) => t.id !== thread.id && t.title !== NEW_THREAD_TITLE).map((t) => t.title).slice(-20);
    const title = await suggestTitle(
      deps.provider,
      loaded.naming_skill,
      deps.events,
      thread,
      { turns: turns.map((t) => ({ prompt: t.prompt, response_text: t.response_text })), docNames: docs.rows.map((r) => String(r.name)), otherTitles: others },
      envelope,
      auto ? 'auto' : 'wand',
    );
    if (auto) return { thread: title ? await threads.rename(sid, thread.id, title, envelope, true, NEW_THREAD_TITLE) : thread };
    if (!title) throw new HttpError(502, 'The chat could not be named. Please try again.', 'title_failed');
    return { thread: await threads.rename(sid, thread.id, title, envelope, true) };
  });

  /**
   * Resolve a participant token (from the /s/:token link) to its session id. The client
   * calls this once per page load, so it is where the open is recorded.
   */
  app.get('/api/participant', async (req, reply) => {
    const token = requestToken(req);
    if (!token) return reply.code(401).send({ error: 'participant token required' });
    const session = await sessions.byParticipantToken(token);
    if (!session) return reply.code(401).send({ error: 'invalid participant token' });
    // The make kit (?open=0) is not an open of the workspace.
    if ((req.query as { open?: string } | undefined)?.open !== '0') await sessions.recordOpen(session.session_id);
    return { session_id: session.session_id };
  });
}
