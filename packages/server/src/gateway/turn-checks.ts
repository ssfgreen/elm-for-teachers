/**
 * Spyglass's checks on a turn, after its commit (docs/spyglass.md, Part 4). Never inside the
 * commit's transaction: the judge is a network call.
 *
 * 1. The turn's effect (shared/src/turn-effect.ts), from the docs as the commit found them and the
 *    operations it applied, with the ids it made. A turn that changed no content stops here.
 * 2. The judge (judge.ts), with its own time limit, skipped when too little is left of the
 *    function's; on a timeout, an error or a second bad answer, the fallback flags.
 * 3. One write: the judge's gateway calls (`purpose: "judge"`), the flags on the stored turn (and a
 *    note in the content later turns replay, when the teacher saw them), and `spyglass_shown`.
 *
 * The checks run and are logged under every config value, with the workspace's switch off and with
 * the teacher's toggle off: only what is shown changes (`hidden`).
 */
import { capFlags, contentChanged, modelChoices, newGatewayCallId, nowIso, turnEffect, type AgentStep, type KeyDecision, type SpyglassHidden, type StoredSpyglass, type TurnEffect, type TurnEffectInput } from '@edw/shared';
import type { ServerEnvelope } from '../deps.js';
import { callDetail, mayHaveRun, worstCostGbp } from './calls.js';
import { saveGatewayCall, loadTurn, updateTurn } from './history.js';
import { fallbackList, JUDGE_PROMPT_HASH, JUDGE_PROMPT_RECORD, judgeModelFor, judgeTurn } from './judge.js';
import type { JudgeDoc } from './judge-prompt.js';
import type { ChatServiceDeps } from './turn-types.js';

/** vercel.json's maxDuration, the function limit when none is given (env FUNCTION_LIMIT_MS sets it). */
export const FUNCTION_LIMIT_MS = 300_000;
/** Kept free after the judge's own limit, for the write and the response. */
export const CHECKS_MARGIN_MS = 5_000;

/** What the commit hands the checks. */
export interface CommittedTurn {
  effect: TurnEffectInput;
  /** The chat's docs after the commit, those the turn made with what they copy. */
  docs: JudgeDoc[];
  /** Editing mode: the turn's changes went straight in. */
  direct: boolean;
}

export interface CheckTurn {
  sessionId: string;
  thread_id: string;
  doc_id: string;
  turn_id: string;
  envelope: ServerEnvelope;
  prompt: string;
  reply: string;
  /** The model the turn ran on (the teacher's pick). */
  model?: string;
  /** The teacher's toggle under the chat box (absent: on, as a client without the toggle). */
  spyglass?: boolean;
  /** The workspace's Spyglass switch (shared/src/features.ts). Off hides the flags whatever the toggle says. */
  workspaceSpyglass: boolean;
  /** When the request began (performance.now()), to keep within the function's limit. */
  startedAt: number;
}

export type CheckDeps = Pick<ChatServiceDeps, 'db' | 'events' | 'provider' | 'loaded' | 'functionLimitMs'>;

/**
 * Flags only where nothing else on screen shows the change (Part 5): in Suggest mode a block the
 * turn deleted in place has its own suggestion card, so it is not flagged.
 */
export function visibleFlags(flags: readonly KeyDecision[], effect: TurnEffect, direct: boolean): KeyDecision[] {
  if (direct) return [...flags];
  const inPlace = new Set(effect.items.flatMap((i) => (i.kind === 'removed' && !i.from_copy ? [i.block_id] : [])));
  return flags.filter((f) => !(f.label === 'removed' && f.block_ids.every((id) => inPlace.has(id))));
}

/** The line later turns replay after the reply, so the assistant knows what the teacher was shown. */
export function spyglassNote(s: Pick<StoredSpyglass, 'flags' | 'others'>): string {
  const parts = s.flags.map((f) => `${f.label} "${f.title}"`);
  if (s.others) parts.push(`${s.others} more`);
  return `[Spyglass: ${parts.join('; ')}]`;
}

/** Runs the checks and stores what they found; null when the turn changed no content. */
export async function runTurnChecks(deps: CheckDeps, t: CheckTurn, committed: CommittedTurn): Promise<StoredSpyglass | null> {
  const { db, events, provider, loaded } = deps;
  const effect = turnEffect(committed.effect);
  if (!contentChanged(effect)) return null;
  const cfg = loaded.config.spyglass;
  const hidden: SpyglassHidden | undefined = cfg.mode === 'off' ? 'config_off' : !t.workspaceSpyglass ? 'workspace_off' : t.spyglass === false ? 'teacher_off' : undefined;

  // `ran`: the call may have run at the provider, so is billed even without its counts.
  const calls: { step: AgentStep | null; error: string | null; latency_ms: number; ran: boolean }[] = [];
  let flags: KeyDecision[] | null = null;
  const left = (deps.functionLimitMs ?? FUNCTION_LIMIT_MS) - (performance.now() - t.startedAt);
  const model = judgeModelFor(cfg, t.model, provider.model);
  let judgeWorst: number | null = null;
  if (left >= cfg.judge_timeout_ms + CHECKS_MARGIN_MS) {
    const choice = modelChoices(loaded.config.provider).find((m) => m.id === model);
    const judged = { prompt: t.prompt, reply: t.reply, effect, docs: committed.docs };
    // A call that comes back without its counts is charged its worst cost: the prompt, the tool and the case as JSON (no shorter than the message made from it).
    judgeWorst = worstCostGbp(model, Buffer.byteLength(JUDGE_PROMPT_RECORD + JSON.stringify(judged)), loaded.config.provider.max_output_tokens, loaded.config.provider);
    const started = performance.now();
    try {
      const out = await judgeTurn(provider, judged, { model, reasoningEffort: choice && !choice.reasoning ? 'none' : 'low', signal: AbortSignal.timeout(cfg.judge_timeout_ms) });
      const each = Math.round((performance.now() - started) / Math.max(1, out.steps.length));
      out.steps.forEach((step, k) => calls.push({ step, error: out.errors[k] ? `unusable answer: ${out.errors[k]}` : null, latency_ms: each, ran: true }));
      flags = out.flags;
    } catch (err) {
      calls.push({ step: null, error: err instanceof Error ? err.message : String(err), latency_ms: Math.round(performance.now() - started), ran: mayHaveRun(err) });
    }
  }
  const by = flags ? 'judge' : 'fallback';
  const result = capFlags(visibleFlags(flags ?? fallbackList(effect), effect, committed.direct), by);
  const ids = calls.map(() => newGatewayCallId());
  const stored: StoredSpyglass = { ...result, ...(hidden ? { hidden } : {}), ...(ids.length ? { judge_call_id: ids.at(-1)! } : {}) };

  await db.transaction(async (tx) => {
    const at = nowIso();
    for (const [k, c] of calls.entries()) {
      await saveGatewayCall(tx, {
        gateway_call_id: ids[k]!,
        session_id: t.sessionId,
        thread_id: t.thread_id,
        doc_id: t.doc_id,
        turn_id: t.turn_id,
        model,
        temperature: provider.temperature,
        system_prompt_hash: JUDGE_PROMPT_HASH,
        serialized_canvas: '',
        trimmed_history: [],
        running_summary: null,
        raw_response: c.step ? JSON.stringify(c.step.output) : null,
        parsed_message: c.step?.text || null,
        parsed_operations: [],
        dropped: [],
        latency_ms: c.latency_ms,
        input_tokens: c.step?.input_tokens ?? null,
        output_tokens: c.step?.output_tokens ?? null,
        provider_request_id: c.step?.provider_request_id ?? null,
        error: c.error,
        at,
        purpose: 'judge',
        ...callDetail(c.step),
        ...(c.step ? { tool_calls: c.step.toolCalls.map((x) => ({ name: x.name, arguments: x.arguments, output: '' })) } : {}),
      }, loaded.config.provider, c.ran ? judgeWorst : null);
    }
    const turn = await loadTurn(tx, t.sessionId, t.turn_id);
    if (turn) {
      const shown = !hidden && stored.flags.length > 0;
      await updateTurn(tx, t.sessionId, { ...turn, spyglass: stored, ...(shown ? { rewritten_assistant_content: `${turn.rewritten_assistant_content}\n${spyglassNote(stored)}` } : {}) });
    }
    await events.appendServer(
      t.sessionId,
      'spyglass_shown',
      { turn_id: t.turn_id, flags: stored.flags.map((f) => ({ check: f.check, label: f.label, block_ids: f.block_ids })), others: stored.others, by: stored.by, ...(stored.judge_call_id ? { gateway_call_id: stored.judge_call_id } : {}), ...(hidden ? { hidden } : {}) },
      t.envelope,
      tx,
    );
  });
  return stored;
}
