/**
 * The workspace's limits (config `limits`), checked before a turn: its budget in pounds (config
 * `limits.budget_gbp` plus its top-ups, budget/store.ts) against saved spend, and its messages in the last hour. Before each agent call (not the running
 * summary, the Spyglass judge or single mode, which are costed but not checked one by one) the
 * call's worst cost is checked against saved spend plus this turn's own unsaved steps. Turns
 * running at once each see only their own unsaved spend, so together they can pass budget plus
 * overrun.
 */
import type { LoadedConfig, PricedCall } from '@edw/shared';
import type { Db } from '../db/client.js';
import type { EventStore, ServerEnvelope } from '../deps.js';
import { tooManyRequests } from '../http-error.js';
import { callCostGbp, worstCostGbp, type Pricing } from './calls.js';
import { budgetGbp, spendGbp } from '../budget/store.js';
import { countTurns } from './history.js';

const HOUR_MS = 60 * 60 * 1000;

type Limits = LoadedConfig['config']['limits'];

/** What the teacher reads when the budget stops a turn, before it starts or part way through. */
export const BUDGET_MESSAGE = 'This workspace has used all of its budget for the assistant. Please contact the study team if you need more.';

/** Throws a 429 (and logs it) when the workspace has spent its budget or sent its messages this hour. */
export async function checkLimits(db: Db, events: EventStore, limits: Limits, sessionId: string, envelope: ServerEnvelope): Promise<void> {
  const now = Date.now();
  let refusal: { message: string; code: string } | null = null;
  if ((await spendGbp(db, sessionId)) >= (await budgetGbp(db, limits, sessionId))) {
    refusal = { code: 'budget_spent', message: BUDGET_MESSAGE };
  } else {
    const used = await countTurns(db, sessionId, new Date(now - HOUR_MS).toISOString());
    if (used.recent >= limits.messages_per_hour) {
      const freesAt = used.oldestRecent ? Date.parse(used.oldestRecent) + HOUR_MS : now + HOUR_MS;
      const minutes = Math.max(1, Math.ceil((freesAt - now) / 60_000));
      refusal = {
        code: 'usage_limit_hourly',
        message: `This workspace has sent ${limits.messages_per_hour} messages to the assistant in the last hour, the most allowed. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      };
    }
  }
  if (!refusal) return;
  await events.appendServer(sessionId, 'error', { source: 'server', message: `${refusal.code}: ${refusal.message}` }, envelope);
  throw tooManyRequests(refusal.message, refusal.code);
}

/**
 * A model call the budget refused: the turn ends with BUDGET_MESSAGE. The amounts stay on the
 * object, out of the message, which goes into the gateway log and the error event (the export).
 */
export class BudgetError extends Error {
  constructor(
    readonly spent: number,
    readonly worst: number,
  ) {
    super('budget_spent: the next call could take spend past the budget and its overrun');
    this.name = 'BudgetError';
  }
}

/** The call about to be made: its model, its request's size in UTF-8 bytes and its output cap. */
export interface NextCall {
  model: string;
  inputBytes: number;
  maxOutputTokens: number;
}

/**
 * Before each agent call: throws a BudgetError when the call, at its worst, could take spend past
 * budget (with its top-ups) plus overrun, else gives that worst cost (the charge if the call comes back without its
 * counts). Spend is what is saved plus `unsaved`, this turn's own calls so far, each at its
 * counts or else its worst cost (a turn saves its calls when it ends). Another turn's unsaved
 * calls are not seen. The config prices every model (loadAppConfig checks), so `null` comes back
 * only from a config made in a test.
 */
export async function checkCallBudget(db: Db, limits: Limits, pricing: Pricing, sessionId: string, next: NextCall, unsaved: readonly { call: PricedCall; worst: number | null }[]): Promise<number | null> {
  const worst = worstCostGbp(next.model, next.inputBytes, next.maxOutputTokens, pricing);
  if (worst === null) return null;
  const counted = (c: PricedCall) => c.input_tokens != null || c.output_tokens != null;
  const own = unsaved.reduce((n, u) => n + ((counted(u.call) ? callCostGbp(u.call, pricing) : u.worst) ?? 0), 0);
  const spent = (await spendGbp(db, sessionId)) + own;
  if (spent + worst > (await budgetGbp(db, limits, sessionId)) + limits.budget_overrun_gbp) throw new BudgetError(spent, worst);
  return worst;
}
