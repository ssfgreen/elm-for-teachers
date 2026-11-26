/** Helpers for the gateway log (`gateway_calls`), shared by every kind of model call in a turn. */
import { priceCalls, type GatewayCall, type LoadedConfig, type PricedCall, type ProviderResult } from '@edw/shared';
import { ProviderError } from './errors.js';

/** What the provider was sent, and its cache and reasoning counts, for the gateway log. */
export function callDetail(raw: ProviderResult | null): Pick<GatewayCall, 'request' | 'cached_tokens' | 'cache_write_tokens' | 'reasoning_tokens'> {
  return {
    ...(raw?.request !== undefined ? { request: raw.request } : {}),
    cached_tokens: raw?.cached_tokens ?? null,
    cache_write_tokens: raw?.cache_write_tokens ?? null,
    reasoning_tokens: raw?.reasoning_tokens ?? null,
  };
}

/** The config's prices: what a call is costed at when it is saved. */
export type Pricing = Pick<LoadedConfig['config']['provider'], 'prices' | 'usd_to_gbp'>;

/** A call's cost in pounds at these prices; null when its model has no price or there is no exchange rate. */
export function callCostGbp(call: PricedCall, pricing: Pricing): number | null {
  return priceCalls([call], pricing.prices, pricing.usd_to_gbp);
}

/**
 * The most a call could cost, before it is made: one input token per byte of the request as
 * UTF-8 (a token is never shorter than a byte, so this is an upper bound whatever the text: short
 * blocks, numbers, emoji, other scripts), all at the dearest input price, and its whole output
 * cap. Null when the model has no price.
 */
export function worstCostGbp(model: string, inputBytes: number, maxOutputTokens: number, pricing: Pricing): number | null {
  const p = pricing.prices?.[model];
  if (!p || pricing.usd_to_gbp === undefined) return null;
  const inPrice = Math.max(p.input, p.cached_input ?? 0, p.cache_write ?? 0);
  const usd = (inputBytes * inPrice + maxOutputTokens * p.output) / 1_000_000;
  return usd * pricing.usd_to_gbp;
}

/**
 * Whether a failed call may have run at the provider, and so may be billed without the counts
 * to show it: false only for an HTTP error status (the provider refused it). A network failure
 * counts as run: the provider can fail before or after the headers with the same kind, and
 * charging is the safe side.
 */
export function mayHaveRun(err: unknown): boolean {
  return !(err instanceof ProviderError && err.kind === 'http');
}
