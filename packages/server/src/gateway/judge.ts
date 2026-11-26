/**
 * The Spyglass judge's call (docs/spyglass.md, Part 4): one forced tool call, parsed and checked
 * against the findings, retried once. The fallback, for a timeout or a second bad answer, is the
 * effect's removed and changed findings in document order, with no `why`.
 */
import { createHash } from 'node:crypto';
import { capFlags, normalise, type AgentStep, type KeyDecision, type ProviderAdapter, type SpyglassResult, type TurnEffect } from '@edw/shared';
import { z } from 'zod';
import { findingsOf, JUDGE_LABELS, JUDGE_SYSTEM_PROMPT, JUDGE_TOOL, JUDGE_TOOL_NAME, judgeMessage, type Finding, type JudgeCase } from './judge-prompt.js';

/** What the judge is told, as recorded in config_versions: the prompt, then its tool's schema. */
export const JUDGE_PROMPT_RECORD = `${JUDGE_SYSTEM_PROMPT}${JSON.stringify(JUDGE_TOOL)}`;
/** Recorded with each judge call, as the summary call's prompt is. */
export const JUDGE_PROMPT_HASH = createHash('sha256').update(JUDGE_PROMPT_RECORD).digest('hex');

const Answer = z.object({
  flags: z.array(
    z.object({
      findings: z.array(z.string()).min(1),
      label: z.enum(JUDGE_LABELS),
      title: z.string().min(1),
      why: z.string(),
    }),
  ),
});

/** The answer's flags, or why it cannot be used (unparseable, or a finding that does not exist). */
export function parseAnswer(step: AgentStep, findings: readonly Finding[]): { flags: KeyDecision[] } | { error: string } {
  const call = step.toolCalls.find((c) => c.name === JUDGE_TOOL_NAME);
  if (!call) return { error: 'no tool call' };
  let raw: unknown;
  try {
    raw = JSON.parse(call.arguments);
  } catch {
    return { error: 'arguments are not JSON' };
  }
  const parsed = Answer.safeParse(raw);
  if (!parsed.success) return { error: `arguments do not fit: ${parsed.error.issues[0]?.message ?? ''}` };
  const byRef = new Map(findings.map((f) => [f.ref, f]));
  const flags: KeyDecision[] = [];
  for (const f of parsed.data.flags) {
    const named = f.findings.map((r) => byRef.get(r.trim()));
    if (named.some((n) => !n)) return { error: `unknown finding in ${JSON.stringify(f.findings)}` };
    const items = named as Finding[];
    const was = items.map((n) => (n.item.kind === 'changed' ? n.item.before : null)).find((t) => t !== null);
    flags.push({ check: 'scope', label: f.label, block_ids: [...new Set(items.flatMap((n) => n.block_ids))], title: capWords(f.title, MAX_TITLE_WORDS), why: capWords(f.why, MAX_WHY_WORDS), ...(was ? { was } : {}) });
  }
  return { flags };
}

/** Past these, a title or why is cut: teachers skim the callout (the prompt asks for 5 and 12). */
export const MAX_TITLE_WORDS = 8;
export const MAX_WHY_WORDS = 20;

export function capWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length > max ? `${words.slice(0, max).join(' ')}…` : words.join(' ');
}

/** The effect's removed and changed findings, titled by their first words. */
export function fallbackFlags(effect: TurnEffect): SpyglassResult {
  return capFlags(fallbackList(effect), 'fallback');
}

/** The same, every one, before the cap. */
export function fallbackList(effect: TurnEffect): KeyDecision[] {
  return findingsOf(effect).flatMap((f): KeyDecision[] => {
    const i = f.item;
    if (i.kind === 'removed') return [{ check: 'scope', label: 'removed', block_ids: f.block_ids, title: `“${firstWords(i.text)}” removed`, why: '' }];
    if (i.kind === 'changed') return [{ check: 'scope', label: 'changed', block_ids: f.block_ids, title: `“${firstWords(i.before)}” changed`, why: '', was: i.before }];
    return [];
  });
}

function firstWords(text: string): string {
  const words = normalise(text).replace(/^#+\s*/, '').split(/\s+/).filter(Boolean);
  return words.slice(0, 4).join(' ') + (words.length > 4 ? '…' : '') || '(empty)';
}

/**
 * Which model judges a turn: the turn's own model when it is one of `judge_models` (Luna checks
 * Luna), otherwise `judge_model`, otherwise the provider's default. docs/model-decisions.md.
 */
export function judgeModelFor(cfg: { judge_model?: string; judge_models: readonly string[] }, turnModel: string | undefined, providerDefault: string): string {
  if (turnModel && cfg.judge_models.includes(turnModel)) return turnModel;
  return cfg.judge_model ?? providerDefault;
}

export interface JudgeOptions {
  model?: string;
  reasoningEffort?: 'low' | 'medium' | 'high' | 'none';
  signal?: AbortSignal;
}

export interface JudgeOutcome {
  /** Null when neither answer could be used. */
  result: SpyglassResult | null;
  /** Each call made (one, or two after a bad answer), for the gateway log. */
  steps: AgentStep[];
  /** Why each unusable answer was refused. */
  errors: string[];
  /** All the flags the judge gave, before the cap: what the experiment compares. */
  flags: KeyDecision[] | null;
}

/** Asks the judge about one turn. Throws only what the provider throws (a timeout, an abort). */
export async function judgeTurn(provider: ProviderAdapter, c: JudgeCase, opts: JudgeOptions = {}): Promise<JudgeOutcome> {
  if (!provider.respond) throw new Error('the provider has no agent calls');
  const findings = findingsOf(c.effect);
  const input = [{ role: 'user', content: judgeMessage(c, findings) }];
  const steps: AgentStep[] = [];
  const errors: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const step = await provider.respond(
      { instructions: JUDGE_SYSTEM_PROMPT, input, tools: [JUDGE_TOOL], toolChoice: { name: JUDGE_TOOL_NAME }, ...(opts.model ? { model: opts.model } : {}), ...(opts.reasoningEffort ? { reasoningEffort: opts.reasoningEffort } : {}) },
      undefined,
      opts.signal,
    );
    steps.push(step);
    const answer = parseAnswer(step, findings);
    if ('flags' in answer) return { result: capFlags(answer.flags, 'judge'), steps, errors, flags: answer.flags };
    errors.push(answer.error);
  }
  return { result: null, steps, errors, flags: null };
}
