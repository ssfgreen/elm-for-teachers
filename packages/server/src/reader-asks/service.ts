/**
 * A pupil's ask (#214): every check, then one model call, then the ask saved with its cost. In
 * order: the pupil may use the reading's class (`openReading`, before the body is read: a member,
 * the class open, pupils on; an unknown reading is refused the same way) and it is not removed; the passage is in the reading (422); the prompt is allowed and still in the library
 * (409), ticked for this place (409); a follow-up's parent is this member's ask on this reading
 * (404) and the chain is under the limit in force (409); the provider keeps nothing (503); the
 * pupil's budget in the class and the workspace's budget each cover the call at its worst (429).
 * Only then is the model called. A failed call stores and charges nothing (502).
 *
 * The result is a value, never a throw, so the route logs every refusal by its reason code.
 */
import { newUlid, nowIso, type AgentStep, type LoadedConfig, type ProviderAdapter, type ReaderAskRefusal } from '@edw/shared';
import { sha256Hex } from '@edw/shared/node';
import type { MemberDeps, MemberRefusal } from '../class-joins/member.js';
import { memberOf } from '../class-joins/member.js';
import type { ReaderSettingsStore } from '../classes/reader-settings.js';
import type { Db } from '../db/client.js';
import { callCostGbp, worstCostGbp } from '../gateway/calls.js';
import { ProviderError } from '../gateway/errors.js';
import { BudgetError, checkCallBudget } from '../gateway/limits.js';
import { checkHighlight, readingText } from './article.js';
import { askRequest, requestBytes, type AskRequest } from './request.js';
import type { AskReading, ReaderAskStore } from './store.js';
import type { Member } from '../class-joins/store.js';

export interface ReaderAskDeps {
  db: Db;
  loaded: LoadedConfig;
  provider: ProviderAdapter;
  asks: ReaderAskStore;
  settings: Pick<ReaderSettingsStore, 'get'>;
  member: MemberDeps;
}

export interface AskInput {
  prompt_id: string;
  highlighted_text: string;
  parent_ask_id?: string | null;
}

export type AskOutcome =
  | { ok: true; ask: { id: string; reply: string; follow_ups_left: number }; ids: { ask_id: string; reading_id: string; class_id: string; member_id: string } }
  | { ok: false; status: number; code: ReaderAskRefusal | MemberRefusal | 'not_found'; message: string; provider?: { kind: string; status?: number } };

const refuse = (status: number, code: Extract<AskOutcome, { ok: false }>['code'], message: string): AskOutcome => ({ ok: false, status, code, message });

/** A failed call's kind and HTTP status, for the log: never its message, which can quote the provider. */
const providerDetail = (err: unknown): { kind: string; status?: number } =>
  err instanceof ProviderError ? { kind: err.kind, ...(err.status !== undefined ? { status: err.status } : {}) } : { kind: 'other' };

/** What the pupil reads when a budget stops an ask. */
export const PUPIL_BUDGET_MESSAGE = 'You have used all the help you can ask for in this class. Please ask your teacher.';
export const WORKSPACE_BUDGET_MESSAGE = 'Your teacher’s helper has used all of its budget. Please ask your teacher.';

/** The model pupils' asks go to: config `reader.model`, else the provider's default. */
export const readerModel = (loaded: LoadedConfig, provider: Pick<ProviderAdapter, 'model'>): string => loaded.config.reader.model ?? provider.model;

/** A model listed as taking no reasoning is sent none; any other is asked to think little (replies are short). */
const effortFor = (loaded: LoadedConfig, model: string): 'low' | 'none' => (loaded.config.provider.models?.find((m) => m.id === model)?.reasoning === false ? 'none' : 'low');

/** The one model call of an ask, no tools (the evals make the same call). Throws what the provider throws. */
export async function callReader(provider: ProviderAdapter, loaded: LoadedConfig, model: string, request: AskRequest): Promise<AgentStep> {
  if (!provider.respond) throw new Error('the provider has no agent calls');
  return provider.respond({ instructions: request.instructions, input: request.input, tools: [], toolChoice: 'none', model, reasoningEffort: effortFor(loaded, model) });
}

/** A reading the pupil may ask about, and their membership of its class. */
export interface OpenReading {
  reading: AskReading;
  member: Member;
}

/**
 * The reading and the pupil's membership, before anything else is read (as R1's reader routes):
 * an unknown reading is 403 `not_member` like another class's, so a pupil cannot tell which ids
 * exist; a removed one is 404 to its own pupils.
 */
export async function openReading(deps: Pick<ReaderAskDeps, 'asks' | 'member'>, pupilId: string, readingId: string): Promise<{ ok: true; open: OpenReading } | Extract<AskOutcome, { ok: false }>> {
  const reading = await deps.asks.reading(readingId);
  const m = reading ? await memberOf(deps.member, pupilId, reading.class_id) : ({ ok: false, reason: 'not_member' } as const);
  if (!m.ok) return { ok: false, status: 403, code: m.reason, message: 'not open to this pupil' };
  if (reading!.removed) return { ok: false, status: 404, code: 'not_found', message: 'reading not found' };
  return { ok: true, open: { reading: reading!, member: m.member } };
}

export async function askReader(deps: ReaderAskDeps, { reading, member }: OpenReading, input: AskInput): Promise<AskOutcome> {
  const { asks, loaded } = deps;

  const highlight = checkHighlight(reading.blocks, input.highlighted_text);
  if (!highlight.ok) return refuse(422, highlight.reason, highlight.reason === 'highlight_too_long' ? 'that passage is too long' : 'that passage is not in the reading');

  const prompt = await asks.prompt(reading, input.prompt_id);
  if (!prompt) return refuse(409, 'prompt_unavailable', 'that button is no longer offered: reload and try again');
  const parentId = input.parent_ask_id ?? null;
  if (!(parentId ? prompt.follow_up : prompt.after_highlight)) return refuse(409, 'prompt_not_offered', 'that button is not offered here');

  const settings = await deps.settings.get(reading.session_id, reading.class_id);
  if (!settings) return refuse(404, 'not_found', 'reading not found');
  const limit = reading.follow_ups_max ?? settings.follow_ups_max;
  const chain = parentId ? await asks.chain(member.id, reading.id, parentId) : [];
  if (chain === null) return refuse(404, 'not_found', 'ask not found');
  // A chain of n asks makes this one follow-up number n.
  if (chain.length > limit) return refuse(409, 'follow_ups_used', 'no more follow-ups on this answer');

  if (!loaded.config.provider.zero_retention) return refuse(503, 'no_zero_retention', 'pupils cannot ask yet: the model provider is not set to keep nothing');

  const request = askRequest({ safety_instruction: settings.safety_instruction, article: readingText(reading.blocks), highlighted_text: highlight.text, instruction: prompt.instruction, chain });
  const model = readerModel(loaded, deps.provider);
  const pricing = loaded.config.provider;
  const next = { model, inputBytes: requestBytes(request), maxOutputTokens: pricing.max_output_tokens };
  const worst = worstCostGbp(next.model, next.inputBytes, next.maxOutputTokens, pricing);

  if ((await asks.memberSpendGbp(member.id)) + (worst ?? 0) > settings.pupil_budget_gbp) return refuse(429, 'pupil_budget_spent', PUPIL_BUDGET_MESSAGE);
  try {
    await checkCallBudget(deps.db, loaded.config.limits, pricing, reading.session_id, next, []);
  } catch (err) {
    if (err instanceof BudgetError) return refuse(429, 'budget_spent', WORKSPACE_BUDGET_MESSAGE);
    throw err;
  }

  let step;
  try {
    step = await callReader(deps.provider, loaded, model, request);
  } catch (err) {
    return { ...refuse(502, 'provider_error', 'the helper could not answer just now: try again'), provider: providerDetail(err) } as AskOutcome;
  }

  const counts = { model, input_tokens: step.input_tokens, output_tokens: step.output_tokens, cached_tokens: step.cached_tokens ?? null, cache_write_tokens: step.cache_write_tokens ?? null };
  const counted = counts.input_tokens != null || counts.output_tokens != null;
  // As the gateway: a call that came back without its counts is charged at its worst.
  const cost = counted ? callCostGbp(counts, pricing) : worst;
  const id = newUlid();
  const reply = step.text.trim();
  await asks.save({
    id,
    session_id: reading.session_id,
    class_id: reading.class_id,
    reading_id: reading.id,
    member_id: member.id,
    prompt_id: prompt.id,
    parent_ask_id: parentId,
    ...counts,
    cost_gbp: cost,
    config_hash: loaded.config_hash,
    safety_hash: `sha256:${sha256Hex(settings.safety_instruction)}`,
    created_at: nowIso(),
    highlighted_text: highlight.text,
    reply,
  });
  return { ok: true, ask: { id, reply, follow_ups_left: limit - chain.length }, ids: { ask_id: id, reading_id: reading.id, class_id: reading.class_id, member_id: member.id } };
}
