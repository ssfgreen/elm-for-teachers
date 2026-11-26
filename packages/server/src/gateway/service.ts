/**
 * Chat turn service: one teacher prompt in a thread, one assistant reply and a set of
 * proposals out. Everything is scoped to the thread: the model sees only that thread's
 * docs and history, and its operations may only touch them.
 *
 * Sequence for one turn:
 *   1. `chat_prompt` is logged in its own transaction, so the prompt survives a provider failure.
 *   2. The prompt is built from a snapshot of the thread's docs and history, and the provider
 *      is called OUTSIDE any transaction (a slow model must not hold the write lock).
 *   3. One write transaction then: re-reads the docs, validates the operations against them,
 *      logs `chat_response`, applies the operations as proposals (logging `block_revision`s and
 *      `doc_create`s), logs `proposal_shown`, and saves the gateway call, the stored turn and the
 *      running summary.
 * Provider errors and unparseable output log an `error` event and a gateway call with `error`
 * set, and leave the docs and the history untouched.
 *
 * Stop: the teacher's Stop (a `chat_stop` event, from the stop route) or the client closing
 * the stream cuts the model call off and no later step starts. A stopped turn applies nothing
 * and is not in the history; its finished calls are logged (they are billed), the last with
 * `error` "the request was stopped".
 *
 * Before any of this, a workspace over its limits (config `limits`: its budget in pounds, and
 * messages in the last hour) is refused with a 429, logged as an `error` event, and the model is
 * not called. The agent loop checks the budget again before each call (limits.ts).
 *
 * This file checks and prepares the turn. The rest lives beside it: limits.ts, stop.ts,
 * history-plan.ts (the turns the model sees and the running summary), single-turn.ts and
 * agent-turn.ts (the model call or calls, and their failures), and commit.ts (step 3).
 */
import { DEFAULT_FEATURES, modelChoices, newGatewayCallId, newTurnId, type Comment, type CommentAnchor } from '@edw/shared';
import type { ServerEnvelope } from '../deps.js';
import { conflict, HttpError, notFound } from '../http-error.js';
import { createCommentStore } from '../comments/store.js';
import { createProjectService } from '../projects/service.js';
import { createSessionService } from '../sessions/service.js';
import { readerFor } from '../references/reader.js';
import { attachedNote } from './context-messages.js';
import { blankDocNote, editModeNote } from './editMode.js';
import { agentTurn } from './agent-turn.js';
import { countFailedCalls, loadTurns, threadCallUsage } from './history.js';
import { historyFor } from './history-plan.js';
import { checkLimits } from './limits.js';
import { singleTurn } from './single-turn.js';
import { stopControl } from './stop.js';
import { runTurnChecks } from './turn-checks.js';
import { createLibraryClient } from '../plugins/library-client.js';
import { createPluginService } from '../plugins/service.js';
import { createPreferenceService } from '../preferences/service.js';
import { turnPlugins } from './turn-plugins.js';
import { agentToolsFor } from './tools/index.js';
import type { ChatService, ChatServiceDeps, PreparedTurn, TurnDeps } from './turn-types.js';
import { workingView } from './view.js';

export { assistantContent } from './single-turn.js';
export { TURN_FAILED_MESSAGE, TURN_STOPPED_MESSAGE } from './turn-types.js';
export type { ChatService, ChatServiceDeps, ChatTurnSummary, PublicChanges, TurnInput, TurnOptions, TurnResult } from './turn-types.js';

/** The comment thread as the model reads it, with the teacher's new comment last. */
export function commentPrompt(items: Comment[], newId: string, text: string): string {
  const earlier = items.filter((c) => c.id !== newId).map((c) => `${c.author === 'model' ? 'Assistant' : 'Teacher'}: ${c.body}`);
  return [
    'This message is a comment in the comment thread on the block named above, not the chat.',
    ...(earlier.length ? ['The thread so far:', ...earlier, ''] : []),
    `The teacher's new comment: ${text}`,
    '',
    'Your message is posted as your reply in this thread, so keep it as short as a comment. You may still edit the documents.',
  ].join('\n');
}

export function createChatService(deps: ChatServiceDeps): ChatService {
  const { db, events, canvas, threads, loaded } = deps;
  const limits = loaded.config.limits;
  const comments = createCommentStore(db, events);
  const projects = createProjectService(db, events);
  const sessions = createSessionService(db, loaded, events, threads);
  // Checked now, so a config naming an unknown tool fails at start, not on a teacher's message.
  const agentTools = loaded.config.mode === 'agent' ? agentToolsFor(loaded.config.agent.tools, loaded.skills?.length ?? 0) : [];
  const plugins = createPluginService(db, events, loaded.config.plugins, deps.libraryUrl);
  const clientFor = deps.libraryClient ?? ((url: string) => createLibraryClient(url));
  const turnDeps: TurnDeps = { ...deps, comments, projects, agentTools, plugins, preferences: createPreferenceService(db, events) };

  return {
    async runTurn(sessionId, input, opts = {}) {
      const startedAt = performance.now();
      // a. The thread and the open doc must both be this session's, and the doc in the thread.
      const thread = await threads.get(sessionId, input.thread_id);
      if (!thread) throw notFound('thread');
      const snapshot = workingView(await canvas.loadState(sessionId), thread.id, input.doc_id, input.copy_choice);
      if (!snapshot.ctx.docIds.has(input.doc_id)) throw conflict(`doc ${input.doc_id} is not in this thread`, 'doc_not_in_thread');
      const envelope: ServerEnvelope = { ...input.envelope, doc_id: input.doc_id, thread_id: thread.id };
      // The teacher's model, checked against the config's list; a model without reasoning gets none.
      const choices = modelChoices(loaded.config.provider);
      const chosen = input.model ? choices.find((m) => m.id === input.model) : choices.find((m) => m.id === loaded.config.provider.model);
      if (!chosen) throw new HttpError(400, `the model ${input.model} is not one of the choices`, 'unknown_model');
      const model = { id: chosen.id, effort: chosen.reasoning ? (input.effort ?? loaded.config.agent.reasoning_effort) : ('none' as const) };
      await checkLimits(db, events, limits, sessionId, envelope);
      // The workspace's switches (shared/src/features.ts), as the session service reads them.
      const features = (await sessions.get(sessionId))?.features ?? DEFAULT_FEATURES;
      const turn_id = newTurnId();
      const gateway_call_id = newGatewayCallId();
      const stop = stopControl(db, sessionId, turn_id, opts.signal);
      opts.onStart?.(turn_id);

      // An @model comment: its thread (on this doc), whose passage is the turn's anchor.
      let commentThread: { root: Comment; items: Comment[] } | null = null;
      if (input.comment_id) {
        const c = await comments.get(sessionId, input.comment_id);
        if (!c || c.deleted_at || c.doc_id !== input.doc_id) throw notFound('comment');
        const root = c.root_id ? await comments.get(sessionId, c.root_id) : c;
        if (!root || root.deleted_at) throw notFound('comment');
        const items = (await comments.list(sessionId, root.doc_id)).filter((x) => x.id === root.id || x.root_id === root.id);
        commentThread = { root, items };
      }

      // b. The anchor, if any, must point at a block in this thread (a suggestion not yet accepted
      // counts: the teacher may ask for it to be changed); then the prompt is logged on its own.
      let anchor: CommentAnchor | null = input.anchor ?? (commentThread ? { block_id: commentThread.root.block_id, from: null, to: null, quote: commentThread.root.quote } : null);
      let anchored = anchor ? snapshot.blocks.find((b) => b.id === anchor!.block_id && (b.status === 'live' || b.status === 'proposed')) : undefined;
      if (anchor && !anchored) {
        // A comment can outlive its block: the thread is still answered, without the anchor.
        if (!commentThread) throw conflict(`anchored block ${anchor.block_id} is not in this thread`, 'bad_anchor');
        anchor = null;
        anchored = undefined;
      }
      // Files attached with "+": this chat's own, ready files (the reader also has the project's).
      const references = loaded.config.mode === 'agent' ? await readerFor(db, sessionId, { projectId: thread.project_id, threadId: thread.id }) : null;
      const attachments = (input.attachments ?? []).map((id) => {
        const f = references?.files.find((x) => x.id === id && x.thread_id === thread.id);
        if (!f) throw new HttpError(400, `no ready file ${id} in this chat`, 'unknown_attachment');
        return { id: f.id, name: f.name };
      });
      // The workspace's plugins, as the teacher set them on the Plugins screen and in this chat.
      // Its studio drafts are read now (all at once, each within E1a's timeout), so a change in the studio shows on the next message.
      const drafts = loaded.config.mode === 'agent' && features.plugins && deps.drafts ? await deps.drafts.forTurn(sessionId, thread.id) : [];
      const used = loaded.config.mode === 'agent' ? turnPlugins(await plugins.states(sessionId, thread.id), agentTools, clientFor, features, deps.libraryUrl, drafts) : { tools: agentTools, libraries: [], askFirst: new Set<string>(), onOffer: [], pedagogy: null, pedagogyRequest: null, curriculum: null };
      await events.appendServer(
        sessionId,
        'chat_prompt',
        { turn_id, text: input.text, anchor, ...(input.comment_id ? { comment_id: input.comment_id } : {}), ...(attachments.length ? { attachments: attachments.map((x) => x.id) } : {}), ...(loaded.config.mode === 'agent' ? { model: model.id, effort: model.effort } : {}), edit_mode: input.edit_mode ?? 'suggest', ...(input.edit_mode !== 'edit' && input.suggest_view ? { suggest_view: input.suggest_view } : {}), ...(loaded.config.mode === 'agent' ? { plugins: used.onOffer } : {}), ...(input.spyglass !== undefined ? { spyglass: input.spyglass } : {}) },
        envelope,
      );
      const promptText = (commentThread ? commentPrompt(commentThread.items, input.comment_id!, input.text) : input.text) + attachedNote(attachments) + editModeNote(input.edit_mode) + blankDocNote(input.edit_mode, input.doc_id, snapshot);

      // c. Prompt construction from the same snapshot and this thread's history (the chat's
      // turns: a comment thread is its own context).
      const history = (await loadTurns(db, sessionId, thread.id)).filter((t) => !t.comment_id);
      const { kept, summary: runningSummary } = await historyFor(deps, { sessionId, threadId: thread.id, docId: input.doc_id, turnId: turn_id, history, signal: stop.signal });
      const anchorInfo = anchor && anchored ? { block_id: anchor.block_id, type: anchored.type, quote: anchor.quote } : null;

      const turn: PreparedTurn = { sessionId, thread, input, envelope, turn_id, anchor, attachments, commentThread, model, opts, snapshot, kept, runningSummary, anchorInfo, promptText, stop, plugins: used, checks: {}, features };
      // d–h: the model call(s), then one write transaction (commit.ts).
      const result = loaded.config.mode === 'agent' ? await agentTurn(turnDeps, turn, references?.files.length ? references : null) : await singleTurn(turnDeps, turn, gateway_call_id);
      // i. Spyglass, after the commit: the chat box is free once the result is out (turn-checks.ts).
      const committed = turn.checks.committed;
      if (!result.ok || !committed) return result;
      opts.onResult?.(result);
      try {
        const found = await runTurnChecks(deps, { sessionId, thread_id: thread.id, doc_id: input.doc_id, turn_id, envelope, prompt: input.text, reply: result.message, model: model.id, startedAt, ...(input.spyglass !== undefined ? { spyglass: input.spyglass } : {}), workspaceSpyglass: features.spyglass }, committed);
        if (found && !found.hidden && found.flags.length) opts.onSpyglass?.(turn_id, { flags: found.flags, others: found.others, by: found.by });
      } catch (err) {
        // The turn is in; a failed check only goes in the log.
        await events.appendServer(sessionId, 'error', { source: 'server', message: `spyglass: ${err instanceof Error ? err.message : String(err)}` }, envelope);
      }
      return result;
    },

    async listTurns(sessionId, threadId) {
      // Turns that answered an @model comment show in their comment thread, not the chat.
      const turns = (await loadTurns(db, sessionId, threadId)).filter((t) => !t.comment_id);
      return turns.map(({ turn_id, doc_id, prompt, anchor, response_text, attachments, steps, worked_ms, pictures, copy_requests, spyglass, at }) => ({
        turn_id,
        doc_id,
        prompt,
        anchor,
        response_text,
        attachments: attachments ?? [],
        ...(steps?.length ? { steps, worked_ms } : {}),
        ...(pictures?.length ? { pictures } : {}),
        ...(copy_requests?.length ? { copy_requests } : {}),
        // Flags the teacher saw; hidden ones stay research data.
        ...(spyglass && !spyglass.hidden && spyglass.flags.length ? { spyglass: { flags: spyglass.flags, others: spyglass.others, by: spyglass.by } } : {}),
        at,
      }));
    },

    usage(sessionId, threadId) {
      return threadCallUsage(db, sessionId, threadId);
    },

    errorCount(sessionId) {
      return countFailedCalls(db, sessionId);
    },
  };
}
