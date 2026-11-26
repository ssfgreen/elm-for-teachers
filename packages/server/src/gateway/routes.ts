/**
 * Participant chat routes, per thread.
 *   POST /api/sessions/:sessionId/threads/:threadId/chat  { text, doc_id, envelope, anchor? } -> TurnResult
 *   POST /api/sessions/:sessionId/threads/:threadId/chat/stream  (same body)     -> NDJSON, see below
 *   POST /api/sessions/:sessionId/threads/:threadId/chat/stop  { turn_id, shown_text, envelope } -> 204
 *   GET  /api/sessions/:sessionId/threads/:threadId/chat                                    -> { turns }
 *   GET  /api/sessions/:sessionId/threads/:threadId/chat/usage                              -> ChatUsage
 * A failed provider call is a 200 with `ok: false` (the client shows the message), not a 5xx.
 *
 * The stream route answers with one JSON object per line: first `{"type":"start","turn_id":...}`
 * (the id Stop names), then `{"type":"text","text":<delta>}`
 * for each piece of the model's raw reply as it arrives (mode `single`), or
 * `{"type":"state","text":...,"operations":[...],"status":...}`, the reply so far whenever it
 * changes (mode `agent`: its text, the edits accepted so far, and what the model is doing),
 * then `{"type":"result","result":<TurnResult>}`, and, when Spyglass has flags the teacher is to see,
 * `{"type":"spyglass","turn_id":...,"spyglass":<SpyglassResult>}` (the response ends after the
 * checks, so the function is not frozen mid-judge; the chat box is free at `result`). The plain
 * route's result has no flags: the client reads them with the turns. A request refused before the model is called (bad body, wrong thread)
 * gets an ordinary JSON error with its status instead; an error after streaming began ends
 * the stream with `{"type":"error","message":...}`. Closing the stream stops the turn too.
 *
 * Stop logs `chat_stop` (with the reply as far as the teacher saw it); the turn, on whichever
 * server instance runs it, finds it before its next model call and applies nothing.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CommentAnchor, CopyChoice, EditMode, Effort, FocusPane, SuggestView, Ulid } from '@edw/shared';
import { requireParticipant } from '../auth.js';
import { Envelope } from '../http/request.js';
import type { AppDeps } from '../deps.js';
import { notFound } from '../http-error.js';
import type { ChatService, TurnInput } from './service.js';

export const CHAT_TEXT_MAX = 4000;

export const ChatBody = z.object({
  text: z.string().trim().min(1).max(CHAT_TEXT_MAX),
  /** The doc the teacher has open. */
  doc_id: Ulid,
  envelope: z.object({
    client_ts: z.string().datetime({ offset: true }),
    focus_pane: FocusPane,
  }),
  anchor: CommentAnchor.optional(),
  /** The teacher's @model comment the turn answers (its reply goes in that comment thread). */
  comment_id: Ulid.optional(),
  /** The chat's files attached to this message with "+". */
  attachments: z.array(Ulid).max(20).optional(),
  /** The model picked under the chat box (one of the config's), and its effort. */
  model: z.string().min(1).max(100).optional(),
  effort: Effort.optional(),
  /** "suggest" (the default) or "edit": the assistant's changes go straight into the doc. */
  edit_mode: EditMode.optional(),
  suggest_view: SuggestView.optional(),
  /** The teacher's answer on the copy choice card: what a copy of that doc is built from. Only ever from here, never the model. */
  copy_choice: z.object({ doc_id: Ulid, choice: CopyChoice }).optional(),
  /** The Spyglass toggle under the chat box. Absent: on. */
  spyglass: z.boolean().optional(),
});
export type ChatBody = z.infer<typeof ChatBody>;

export const StopBody = z.object({
  turn_id: z.string().min(1).max(64),
  shown_text: z.string().max(100_000),
  envelope: Envelope,
});

type Params = { sessionId: string; threadId: string };

/** The turn's input from a parsed body. */
function turnInput(threadId: string, body: ChatBody): TurnInput {
  const { text, doc_id, envelope, anchor, comment_id, model, effort, attachments, edit_mode, suggest_view, copy_choice, spyglass } = body;
  return { thread_id: threadId, doc_id, text, envelope, anchor, ...(comment_id ? { comment_id } : {}), ...(model ? { model } : {}), ...(effort ? { effort } : {}), ...(edit_mode ? { edit_mode } : {}), ...(suggest_view ? { suggest_view } : {}), ...(copy_choice ? { copy_choice } : {}), ...(attachments?.length ? { attachments } : {}), ...(spyglass !== undefined ? { spyglass } : {}) };
}

export function registerChatRoutes(app: FastifyInstance, deps: Pick<AppDeps, 'sessions' | 'threads' | 'events'>, chat: ChatService): void {
  const guard = requireParticipant(deps);

  app.post<{ Params: Params }>('/api/sessions/:sessionId/threads/:threadId/chat', { preHandler: guard }, async (req, reply) => {
    const parsed = ChatBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body', code: 'invalid_request', issues: parsed.error.issues });
    return reply.send(await chat.runTurn(req.session!.session_id, turnInput(req.params.threadId, parsed.data)));
  });

  app.post<{ Params: Params }>('/api/sessions/:sessionId/threads/:threadId/chat/stream', { preHandler: guard }, async (req, reply) => {
    const parsed = ChatBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body', code: 'invalid_request', issues: parsed.error.issues });
    let open = false;
    let sent = false;
    // The client went away (or pressed Stop and dropped the stream): the turn stops.
    const closed = new AbortController();
    reply.raw.on('close', () => {
      if (!reply.raw.writableEnded) closed.abort();
    });
    const write = (line: unknown) => {
      if (closed.signal.aborted) return;
      if (!open) {
        open = true;
        // Hijacked replies skip Fastify's hooks, so carry over the headers they set (CORS).
        reply.hijack();
        reply.raw.writeHead(200, {
          ...(reply.getHeaders() as Record<string, string>),
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache',
          'X-Accel-Buffering': 'no',
        });
      }
      reply.raw.write(`${JSON.stringify(line)}\n`);
    };
    try {
      const result = await chat.runTurn(
        req.session!.session_id,
        turnInput(req.params.threadId, parsed.data),
        {
          onStart: (turn_id) => write({ type: 'start', turn_id }),
          onText: (d) => write({ type: 'text', text: d }),
          onState: (state) => write({ type: 'state', ...state }),
          onResult: (r) => {
            sent = true;
            write({ type: 'result', result: r });
          },
          onSpyglass: (turn_id, spyglass) => write({ type: 'spyglass', turn_id, spyglass }),
          signal: closed.signal,
        },
      );
      if (!sent) write({ type: 'result', result });
    } catch (err) {
      if (!open) throw err;
      write({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
    if (!open) reply.hijack();
    reply.raw.end();
    return reply;
  });

  app.post<{ Params: Params }>('/api/sessions/:sessionId/threads/:threadId/chat/stop', { preHandler: guard }, async (req, reply) => {
    const parsed = StopBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body', code: 'invalid_request', issues: parsed.error.issues });
    const sessionId = req.session!.session_id;
    const thread = await deps.threads.get(sessionId, req.params.threadId);
    if (!thread) throw notFound('thread');
    const { turn_id, shown_text, envelope } = parsed.data;
    await deps.events.appendServer(sessionId, 'chat_stop', { turn_id, shown_text }, { ...envelope, thread_id: thread.id });
    return reply.code(204).send();
  });

  app.get<{ Params: Params }>('/api/sessions/:sessionId/threads/:threadId/chat', { preHandler: guard }, async (req, reply) => {
    const sessionId = req.session!.session_id;
    if (!(await deps.threads.get(sessionId, req.params.threadId))) throw notFound('thread');
    return reply.send({ turns: await chat.listTurns(sessionId, req.params.threadId) });
  });

  app.get<{ Params: Params }>('/api/sessions/:sessionId/threads/:threadId/chat/usage', { preHandler: guard }, async (req, reply) => {
    const sessionId = req.session!.session_id;
    if (!(await deps.threads.get(sessionId, req.params.threadId))) throw notFound('thread');
    return reply.send(await chat.usage(sessionId, req.params.threadId));
  });
}
