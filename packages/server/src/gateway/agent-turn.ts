/**
 * Agent mode: the turn as a loop of model calls with tools (agent.ts), each logged as a gateway
 * call with its step number and tool calls. A failure keeps the steps that finished.
 */
import { newGatewayCallId, nowIso, type Block, type Comment, type Doc, type GatewayCall, type PricedCall } from '@edw/shared';
import { publicBlock } from '../http/views.js';
import { HttpError } from '../http-error.js';
import type { ReferenceReader } from '../references/reader.js';
import { agentAssistantContent, AgentTurnError, runAgentTurn, type AgentStepRecord } from './agent.js';
import { loadClassContext } from '../classes/context.js';
import { callDetail, mayHaveRun } from './calls.js';
import { scrubTable } from './class-message.js';
import { checkCitations } from './citations.js';
import { loadPedagogyGrounding } from './pedagogy-message.js';
import { benchmarksSection } from './benchmarks-message.js';
import { commitTurn } from './commit.js';
import { fetchPictures } from './pictures.js';
import { ProviderError } from './errors.js';
import { saveGatewayCall } from './history.js';
import { BUDGET_MESSAGE, BudgetError, checkCallBudget } from './limits.js';
import { historyMessages } from './history-plan.js';
import { serializeCanvas } from './prompt.js';
import { isStop, STREAM_CLOSED } from './stop.js';
import { TURN_FAILED_MESSAGE, TURN_STOPPED_MESSAGE, type PreparedTurn, type TurnDeps, type TurnResult } from './turn-types.js';

/**
 * Docs the model opened from reference files were written mid-turn: the reply carries them (with
 * the turn's own changes to their blocks taking precedence) and names them first, so the client
 * shows the copy the suggestions are on.
 */
function withOpened(result: TurnResult, opened: { doc: Doc; blocks: Block[] }[]): TurnResult {
  if (!result.ok || opened.length === 0) return result;
  const docs = [...result.changes.docs, ...opened.map((o) => o.doc).filter((d) => !result.changes.docs.some((x) => x.id === d.id))];
  const known = new Set(result.changes.blocks.map((b) => b.id));
  const blocks = [...opened.flatMap((o) => o.blocks).filter((b) => !known.has(b.id)).map(publicBlock), ...result.changes.blocks];
  const ids = opened.map((o) => o.doc.id);
  return { ...result, changes: { ...result.changes, docs, blocks }, created_doc_ids: [...ids, ...result.created_doc_ids.filter((id) => !ids.includes(id))] };
}

/** A finished step's model and token counts, to price it. */
function pricedStep(model: string, rec: AgentStepRecord): PricedCall {
  const r = rec.result;
  return { model, input_tokens: r.input_tokens, output_tokens: r.output_tokens, cached_tokens: r.cached_tokens ?? null, cache_write_tokens: r.cache_write_tokens ?? null };
}

/** The doc a read_document call named. */
function docIdOf(args: string): string | null {
  try {
    const id = (JSON.parse(args) as { doc_id?: unknown }).doc_id;
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

/** `references`: the chat's and its project's reference files (null when there are none to read). */
export async function agentTurn(deps: TurnDeps, a: PreparedTurn, references: ReferenceReader | null): Promise<TurnResult> {
  const { db, events, canvas, provider, loaded, comments, projects, plugins, preferences } = deps;
  const { sessionId, thread, input, envelope, turn_id, snapshot } = a;
  const pricing = loaded.config.provider;
  // Each step's worst cost, from the budget check before it: its charge if it has no counts.
  const worst: (number | null)[] = [];

  const all = (await Promise.all(snapshot.docs.map((d) => comments.list(sessionId, d.id)))).flat();
  // Resolved threads are out of the model's view (so it cannot reply in one).
  const resolved = new Set(all.filter((c) => c.resolved_at).map((c) => c.id));
  const threadComments = all.filter((c) => !resolved.has(c.id) && !(c.root_id && resolved.has(c.root_id)));

  const base = {
    session_id: sessionId,
    thread_id: thread.id,
    doc_id: input.doc_id,
    turn_id,
    model: a.model.id,
    temperature: provider.temperature,
    system_prompt_hash: loaded.system_prompt_hash,
    serialized_canvas: serializeCanvas(snapshot.blocks, snapshot.docs, input.doc_id),
    trimmed_history: historyMessages(a.kept),
    running_summary: a.runningSummary,
  };
  // Option B (docs/classes.md): the pupil table goes to the model; the gateway log keeps it in
  // full or only its shape, as config `pupil_rows_in_gateway_log` says. With the workspace's
  // classes switch off, a class chat runs as a plain chat (#64); adaptations go only with pedagogy on.
  const { features } = a;
  const about = features.classes ? await loadClassContext(db, sessionId, thread, loaded.config.provider.zero_retention, { curriculum: features.curriculum, adaptations: features.pedagogy }) : null;
  // A class or year group chat with the pedagogy library on offer starts from what fits the class.
  const source = about ? a.plugins.pedagogy : null;
  const grounding = source && about ? await loadPedagogyGrounding(source, about.focus) : null;
  const pedagogy = source && about && grounding ? { source, focus: about.focus, citable: grounding.claimIds, message: grounding.text } : null;
  const benchmarks = about && a.plugins.curriculum ? await benchmarksSection(a.plugins.curriculum, about.focus.nowCodes) : null;
  const detail = (raw: AgentStepRecord['result']) => {
    const d = callDetail(raw);
    const scrub = about?.table && d.request !== undefined && loaded.config.pupil_rows_in_gateway_log === 'shape';
    return scrub ? { ...d, request: scrubTable(d.request, about.table!, about.placeholder!) } : d;
  };
  const stepCall = (rec: AgentStepRecord, id: string, at: string): GatewayCall => ({
    ...base,
    gateway_call_id: id,
    raw_response: JSON.stringify(rec.result.output),
    parsed_message: rec.result.text || null,
    parsed_operations: rec.operations,
    dropped: rec.dropped,
    latency_ms: rec.latency_ms,
    input_tokens: rec.result.input_tokens,
    output_tokens: rec.result.output_tokens,
    provider_request_id: rec.result.provider_request_id,
    error: null,
    at,
    ...detail(rec.result),
    step: rec.step,
    tool_calls: rec.tool_calls,
  });

  let outcome;
  let fetched: Map<number, Buffer>;
  try {
    outcome = await runAgentTurn({
      provider,
      instructions: loaded.system_prompt,
      tools: a.plugins.tools,
      history: a.kept,
      runningSummary: a.runningSummary,
      view: { ...snapshot, comments: threadComments },
      commentThread: a.commentThread?.root.id ?? null,
      openDocId: input.doc_id,
      currentPrompt: a.promptText,
      anchor: a.anchorInfo,
      maxSteps: loaded.config.agent.max_steps,
      maxTurnMs: loaded.config.agent.max_turn_ms,
      maxReadChars: loaded.config.agent.max_read_chars,
      skills: loaded.skills ?? [],
      model: a.model,
      teacherNote: features.preferences ? (await preferences.get(sessionId)).teacher_note : null,
      project: thread.project_id ? await projects.get(sessionId, thread.project_id) : null,
      classMessage: about ? (benchmarks ? `${about.text}\n\n${benchmarks}` : about.text) : null,
      pedagogy,
      references,
      // The teacher's own file, copied as a live doc at once (the model's edits to it are suggestions).
      pictures: deps.pictures ?? null,
      libraries: a.plugins.libraries,
      askFirst: a.plugins.askFirst,
      ...(input.copy_choice ? { copyChoice: input.copy_choice } : {}),
      openReference: (file, blocks, name) => canvas.openReference(sessionId, { thread_id: thread.id, file, name, blocks }, envelope),
      onState: a.opts.onState,
      signal: a.stop.signal,
      checkStop: a.stop.check,
      // The budget, before each call: the steps done are this turn's, not saved yet.
      beforeCall: async (requestBytes, done) => {
        worst[done.length] = await checkCallBudget(db, loaded.config.limits, pricing, sessionId, { model: a.model.id, inputBytes: requestBytes, maxOutputTokens: pricing.max_output_tokens }, done.map((r) => ({ call: pricedStep(a.model.id, r), worst: worst[r.step] ?? null })));
      },
    });
    // Fetched before the write transaction, which should not wait on another site, and before
    // the last Stop check, so a Stop that comes in during the fetch still applies nothing.
    fetched = await fetchPictures(outcome.operations, snapshot.ctx.imageBlockIds ?? new Set(), outcome.pictures, deps.pictures);
    // A Stop that came in while the last step ran: nothing is applied.
    if (await a.stop.check()) throw new AgentTurnError(new ProviderError('aborted', 'the request was stopped'), outcome.steps, outcome.steps.reduce((n, r) => n + r.latency_ms, 0), outcome.message);
  } catch (err) {
    const failure = err instanceof AgentTurnError ? err : new AgentTurnError(err, [], 0);
    const message = failure.message;
    const source = failure.cause instanceof ProviderError ? 'provider' : 'server';
    const stopped = isStop(failure.cause);
    await db.transaction(async (tx) => {
      if (!stopped) await events.appendServer(sessionId, 'error', { source, message }, envelope, tx);
      else if (!(await a.stop.byTeacher())) await events.appendServer(sessionId, 'error', { source: 'server', message: STREAM_CLOSED }, envelope, tx);
      const at = nowIso();
      for (const rec of failure.steps) await saveGatewayCall(tx, stepCall(rec, newGatewayCallId(), at), pricing, worst[rec.step]);
      const lastLatency = failure.latency_ms - failure.steps.reduce((n, r) => n + r.latency_ms, 0);
      await saveGatewayCall(tx, {
        ...base,
        gateway_call_id: newGatewayCallId(),
        raw_response: null,
        parsed_message: null,
        parsed_operations: [],
        dropped: [],
        latency_ms: Math.max(0, lastLatency),
        input_tokens: null,
        output_tokens: null,
        provider_request_id: null,
        error: message,
        at,
        ...callDetail(null),
        step: failure.steps.length,
        tool_calls: [],
      }, pricing, mayHaveRun(failure.cause) ? worst[failure.steps.length] : null);
    });
    if (stopped) return { ok: false, turn_id, message: TURN_STOPPED_MESSAGE, reply: failure.text || null, stopped: true };
    return { ok: false, turn_id, message: failure.cause instanceof BudgetError ? BUDGET_MESSAGE : TURN_FAILED_MESSAGE, reply: null };
  }

  // Citations of claims the turn did not retrieve come out before anything is written.
  if (pedagogy || /\[\[clm-/.test(outcome.message)) {
    const checked = checkCitations(outcome, pedagogy?.citable ?? new Set());
    outcome = { ...outcome, message: checked.message, comments: checked.comments, operations: checked.operations };
  }
  // Ask first plugins the model wanted: recorded, so the chat offers the teacher Allow.
  // A class or year group chat would have used a pedagogy draft not yet allowed here, so it asks too (#159).
  const asked = new Set([...outcome.requests, ...(about && a.plugins.pedagogyRequest ? [a.plugins.pedagogyRequest] : [])]);
  for (const id of asked) await plugins.request(sessionId, thread.id, id, turn_id, envelope);
  const ids = outcome.steps.map(() => newGatewayCallId());
  const committed = await commitTurn(deps, a, {
    message: outcome.message,
    rawOperations: outcome.operations,
    finalCallId: ids.at(-1)!,
    saveCalls: async (tx, _validated, at) => {
      for (const [i, rec] of outcome.steps.entries()) await saveGatewayCall(tx, stepCall(rec, ids[i]!, at), pricing, worst[rec.step]);
    },
    rewrite: agentAssistantContent,
    writeComments: async (tx) => {
      const written: Comment[] = [];
      for (const d of outcome.comments) {
        // A block or thread deleted while the model worked: that comment is left out, not the turn.
        try {
          written.push(await comments.create(sessionId, { doc_id: d.doc_id, block_id: d.block_id, root_id: d.root_id, author: 'model', body: d.body, quote: d.quote, turn_id }, envelope, tx));
        } catch (err) {
          if (!(err instanceof HttpError)) throw err;
        }
      }
      return written;
    },
    trace: { steps: outcome.trace, worked_ms: outcome.worked_ms },
    pictures: { searches: outcome.pictures, fetched },
    copyRequests: outcome.copy_requests,
    readDocIds: [...new Set(outcome.steps.flatMap((r) => r.tool_calls.filter((x) => x.name === 'read_document').map((x) => docIdOf(x.arguments))).filter((id): id is string => !!id))],
    openedDocIds: outcome.opened.map((o) => o.doc.id),
  });
  return withOpened(committed, outcome.opened);
}
