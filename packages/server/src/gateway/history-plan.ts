/** Which earlier turns a model call sees, and the running summary of those it no longer sees. */
import { newGatewayCallId, nowIso, type ChatMessage, type GatewayCall, type StoredTurn } from '@edw/shared';
import { sha256Hex } from '@edw/shared/node';
import { callDetail } from './calls.js';
import { saveGatewayCall } from './history.js';
import { splitHistory } from './prompt.js';
import { planHistory, summariseTurns, SUMMARY_SYSTEM_PROMPT, updateRunningSummary } from './summary.js';
import type { ChatServiceDeps } from './turn-types.js';

const SUMMARY_PROMPT_HASH = sha256Hex(SUMMARY_SYSTEM_PROMPT);

/** The stored turns as replayed to the model. */
export function historyMessages(turns: StoredTurn[]): ChatMessage[] {
  return turns.flatMap((t): ChatMessage[] => [
    { role: 'user', content: t.prompt },
    { role: 'assistant', content: t.rewritten_assistant_content },
  ]);
}

export interface HistoryForInput {
  sessionId: string;
  threadId: string;
  docId: string;
  turnId: string;
  /** The thread's chat turns, oldest first. */
  history: StoredTurn[];
  signal: AbortSignal;
}

/**
 * The turns a call sends verbatim and the summary of those before them. When more than
 * `max_turns` are past the summary, the oldest are folded into it first (all but the last
 * `keep_turns`): by the model (its own gateway call, `purpose: "summary"`), or one line a turn
 * when config says `lines` or the model call fails. The summary is saved at once, whatever
 * becomes of the turn.
 */
export async function historyFor(
  deps: Pick<ChatServiceDeps, 'db' | 'threads' | 'provider' | 'loaded'>,
  { sessionId, threadId, docId, turnId, history, signal }: HistoryForInput,
): Promise<{ kept: StoredTurn[]; summary: string | null }> {
  const { db, threads, provider, loaded } = deps;
  const maxTurns = loaded.config.history.max_turns;
  const keepTurns = loaded.config.history.keep_turns ?? Math.ceil(maxTurns / 2);
  if (!loaded.config.history.running_summary) return { kept: splitHistory(history, maxTurns).kept, summary: null };
  const state = await threads.summaryState(threadId);
  // A thread summarised before summary_turns was recorded folded one turn a call: its summary
  // covers all but the last max_turns of the turns before the previous one.
  const covered = state.turns ?? (state.summary ? Math.max(0, history.length - 1 - maxTurns) : 0);
  const plan = planHistory(history, covered, maxTurns, keepTurns);
  if (plan.fold.length === 0) return { kept: plan.kept, summary: plan.covered > 0 ? state.summary : null };

  let summary = updateRunningSummary(state.summary, plan.fold);
  if (loaded.config.history.summary === 'model') {
    const started = performance.now();
    let call: Pick<GatewayCall, 'raw_response' | 'parsed_message' | 'input_tokens' | 'output_tokens' | 'provider_request_id' | 'error' | 'trimmed_history'> & ReturnType<typeof callDetail>;
    try {
      const done = await summariseTurns(provider, state.summary, plan.fold, signal);
      summary = done.summary;
      call = { raw_response: done.raw.text, parsed_message: done.summary, input_tokens: done.raw.input_tokens, output_tokens: done.raw.output_tokens, provider_request_id: done.raw.provider_request_id, error: null, trimmed_history: done.messages, ...callDetail(done.raw) };
    } catch (err) {
      // The turn goes ahead on the line-a-turn summary.
      call = { raw_response: null, parsed_message: null, input_tokens: null, output_tokens: null, provider_request_id: null, error: err instanceof Error ? err.message : String(err), trimmed_history: [], ...callDetail(null) };
    }
    await db.transaction((tx) =>
      saveGatewayCall(tx, {
        gateway_call_id: newGatewayCallId(),
        session_id: sessionId,
        thread_id: threadId,
        doc_id: docId,
        turn_id: turnId,
        model: provider.model,
        temperature: provider.temperature,
        system_prompt_hash: SUMMARY_PROMPT_HASH,
        serialized_canvas: '',
        running_summary: state.summary,
        parsed_operations: [],
        dropped: [],
        latency_ms: Math.round(performance.now() - started),
        at: nowIso(),
        purpose: 'summary',
        ...call,
      }, loaded.config.provider),
    );
  }
  await threads.setRunningSummary(threadId, summary, undefined, plan.covered);
  return { kept: plan.kept, summary };
}
