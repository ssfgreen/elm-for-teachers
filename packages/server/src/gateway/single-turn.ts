/**
 * Single mode: the turn as one model call, whose reply carries the message and a fenced block of
 * operations. Provider errors and unparseable output log an `error` event and a gateway call with
 * `error` set, and leave the docs and the history untouched.
 */
import { nowIso, type ChatMessage, type GatewayCall, type Operation, type ProviderAdapter, type ProviderResult } from '@edw/shared';
import { callDetail } from './calls.js';
import { commitTurn } from './commit.js';
import { ProviderError } from './errors.js';
import { saveGatewayCall } from './history.js';
import { historyMessages } from './history-plan.js';
import { parseModelOutput } from './parse.js';
import { buildPrompt, serializeCanvas } from './prompt.js';
import { isStop, STREAM_CLOSED } from './stop.js';
import { TURN_FAILED_MESSAGE, TURN_STOPPED_MESSAGE, type PreparedTurn, type TurnDeps, type TurnResult } from './turn-types.js';

/** The assistant message as replayed to the model: the reply plus the presented operations. */
export function assistantContent(message: string, operations: Operation[]): string {
  if (operations.length === 0) return message;
  return `${message}\n\n\`\`\`json\n${JSON.stringify(operations, null, 2)}\n\`\`\``;
}

/** Streams when asked and able; falls back to an ordinary call if streaming is refused before any text. */
async function callProvider(provider: ProviderAdapter, messages: ChatMessage[], system: string, onText?: (delta: string) => void, signal?: AbortSignal): Promise<ProviderResult> {
  if (!onText || !provider.stream) return provider.complete(messages, system, signal);
  let started = false;
  try {
    return await provider.stream(
      messages,
      system,
      (d) => {
        started = true;
        onText(d);
      },
      signal,
    );
  } catch (err) {
    if (started || !(err instanceof ProviderError && err.kind === 'http')) throw err;
    const whole = await provider.complete(messages, system, signal);
    onText(whole.text);
    return whole;
  }
}

export async function singleTurn(deps: TurnDeps, t: PreparedTurn, gateway_call_id: string): Promise<TurnResult> {
  const { db, events, provider, loaded } = deps;
  const { sessionId, thread, input, envelope, turn_id, snapshot, kept, runningSummary, stop, opts } = t;

  const built = buildPrompt({
    systemPrompt: loaded.system_prompt,
    docs: snapshot.docs,
    blocks: snapshot.blocks,
    openDocId: input.doc_id,
    history: kept,
    runningSummary,
    currentPrompt: t.promptText,
    anchor: t.anchorInfo,
  });

  const callBase = {
    gateway_call_id,
    session_id: sessionId,
    thread_id: thread.id,
    doc_id: input.doc_id,
    turn_id,
    model: provider.model,
    temperature: provider.temperature,
    system_prompt_hash: loaded.system_prompt_hash,
    serialized_canvas: serializeCanvas(snapshot.blocks, snapshot.docs, input.doc_id),
    trimmed_history: historyMessages(kept),
    running_summary: runningSummary,
  };

  const fail = async (source: 'provider' | 'server', error: string, detail: { raw: ProviderResult | null; latency_ms: number; reply: string | null; stopped?: boolean }): Promise<TurnResult> => {
    await db.transaction(async (tx) => {
      if (detail.stopped) {
        if (!(await stop.byTeacher())) await events.appendServer(sessionId, 'error', { source: 'server', message: STREAM_CLOSED }, envelope, tx);
      } else {
        if (detail.reply) {
          await events.appendServer(sessionId, 'chat_response', { turn_id, text: detail.reply, operations: [], gateway_call_id }, envelope, tx);
        }
        await events.appendServer(sessionId, 'error', { source, message: error }, envelope, tx);
      }
      await saveGatewayCall(tx, {
        ...callBase,
        raw_response: detail.raw?.text ?? null,
        parsed_message: detail.reply,
        parsed_operations: [],
        dropped: [],
        latency_ms: detail.latency_ms,
        input_tokens: detail.raw?.input_tokens ?? null,
        output_tokens: detail.raw?.output_tokens ?? null,
        provider_request_id: detail.raw?.provider_request_id ?? null,
        error,
        at: nowIso(),
        ...callDetail(detail.raw),
      }, loaded.config.provider);
    });
    return detail.stopped
      ? { ok: false, turn_id, message: TURN_STOPPED_MESSAGE, reply: detail.reply, stopped: true }
      : { ok: false, turn_id, message: TURN_FAILED_MESSAGE, reply: detail.reply };
  };

  // d. The provider call, outside any transaction.
  const started = performance.now();
  let raw: ProviderResult;
  let shown = '';
  const onText = opts.onText
    ? (d: string) => {
        shown += d;
        opts.onText!(d);
      }
    : undefined;
  try {
    if (await stop.check()) throw new ProviderError('aborted', 'the request was stopped');
    raw = await callProvider(provider, built.messages, built.system, onText, stop.signal);
  } catch (err) {
    const latency_ms = Math.round(performance.now() - started);
    const stopped = isStop(err);
    return fail('provider', err instanceof Error ? err.message : String(err), { raw: null, latency_ms, reply: stopped ? parseModelOutput(shown).message || null : null, stopped });
  }
  const latency_ms = Math.round(performance.now() - started);
  if (await stop.check()) return fail('provider', 'the request was stopped', { raw, latency_ms, reply: parseModelOutput(raw.text).message || null, stopped: true });

  // e. Parse. Validation happens against the docs as they are inside the transaction.
  const parsed = parseModelOutput(raw.text);
  if (parsed.parseError) {
    return fail('server', `unparseable model output: ${parsed.parseError}`, { raw, latency_ms, reply: parsed.message || null });
  }
  const message = parsed.message;

  // f–h, in one write transaction (commit.ts).
  return commitTurn(deps, t, {
    message,
    rawOperations: parsed.rawOperations,
    finalCallId: gateway_call_id,
    saveCalls: (tx, { operations, dropped }, at) =>
      saveGatewayCall(tx, {
        ...callBase,
        raw_response: raw.text,
        parsed_message: message,
        parsed_operations: operations,
        dropped,
        latency_ms,
        input_tokens: raw.input_tokens,
        output_tokens: raw.output_tokens,
        provider_request_id: raw.provider_request_id,
        error: null,
        at,
        ...callDetail(raw),
      } satisfies GatewayCall, loaded.config.provider),
    rewrite: assistantContent,
  });
}
