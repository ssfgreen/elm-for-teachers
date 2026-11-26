import type { ModelPrice } from "./config.js";
import type { GatewayCall } from "./gateway.js";

/**
 * A chat's model use so far, as the counter under the chat box shows it: its tokens, and what its
 * calls cost in pounds as stored when each was made (`gateway_calls.cost_gbp`). The same figures
 * the budget adds up, so a later price change does not alter them; a call from before costs were
 * stored counts as nothing.
 */
export interface ChatUsage {
  input_tokens: number;
  output_tokens: number;
  gbp: number;
}

export type PricedCall = Pick<GatewayCall, "model" | "input_tokens" | "output_tokens" | "cached_tokens" | "cache_write_tokens">;

const PER = 1_000_000;

/**
 * What the calls cost in pounds at these prices: the price of a call when it is saved. Cached input
 * and cache writes are part of `input_tokens` and cost their own price where the model has one. A
 * call that failed before the provider answered has no counts and costs nothing. Null when a call's
 * model has no price, or there is no exchange rate.
 */
export function priceCalls(calls: readonly PricedCall[], prices: Record<string, ModelPrice> = {}, usdToGbp?: number): number | null {
  if (usdToGbp === undefined) return null;
  let usd = 0;
  for (const c of calls) {
    const tin = c.input_tokens ?? 0;
    const tout = c.output_tokens ?? 0;
    if (!tin && !tout) continue;
    const p = prices[c.model];
    if (!p) return null;
    const cached = Math.min(c.cached_tokens ?? 0, tin);
    const written = Math.min(c.cache_write_tokens ?? 0, tin - cached);
    usd += ((tin - cached - written) * p.input + cached * (p.cached_input ?? p.input) + written * (p.cache_write ?? p.input) + tout * p.output) / PER;
  }
  return usd * usdToGbp;
}
