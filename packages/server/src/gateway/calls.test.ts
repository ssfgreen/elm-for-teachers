/** Pricing a call when it is saved, and its worst cost before it is made. */
import { describe, expect, it } from 'vitest';
import { serializeCanvas } from './prompt.js';
import { block, doc, DOC } from './test-fixtures.js';
import { callCostGbp, worstCostGbp } from './calls.js';

const pricing = { prices: { m: { input: 2, output: 10, cached_input: 0.5, cache_write: 4 } }, usd_to_gbp: 0.5 };
const call = (over: object = {}) => ({ model: 'm', input_tokens: 1_000_000, output_tokens: 100_000, cached_tokens: null, cache_write_tokens: null, ...over });

describe('callCostGbp', () => {
  it('prices input, output, cached input and cache writes, in pounds', () => {
    expect(callCostGbp(call(), pricing)).toBe(1.5);
    // 600k at $2, 300k cached at $0.50, 100k written at $4, and 100k out at $10: $2.75.
    expect(callCostGbp(call({ cached_tokens: 300_000, cache_write_tokens: 100_000 }), pricing)).toBeCloseTo(1.375);
  });

  it('is nothing for a call with no counts, and null without a price or an exchange rate', () => {
    expect(callCostGbp(call({ input_tokens: null, output_tokens: null }), pricing)).toBe(0);
    expect(callCostGbp(call({ model: 'other' }), pricing)).toBeNull();
    expect(callCostGbp(call(), { prices: pricing.prices })).toBeNull();
  });
});

/** One dollar a million tokens, a pound to the dollar: the worst cost of no output, times a million, is the tokens reckoned. */
const perToken = { prices: { m: { input: 1, output: 1 } }, usd_to_gbp: 1 };
const tokensReckoned = (bytes: number) => Math.round(worstCostGbp('m', bytes, 0, perToken)! * 1_000_000);

describe('worstCostGbp', () => {
  it('takes the input as a token a byte at the dearest input price, and the whole output cap', () => {
    // 1,000,000 tokens at $4 (the cache write price) and 100k at $10: $5.
    expect(worstCostGbp('m', 1_000_000, 100_000, pricing)).toBe(2.5);
    expect(worstCostGbp('m', 1, 0, pricing)).toBe(0.000002);
  });

  it('reckons at least a token for every character of a canvas of short blocks, numbers, emoji and other scripts', () => {
    // Text like this runs at one to two characters a token, not four: a characters rule undercounts it.
    const blocks = ['1', '2.5', '½', '7 × 8 = 56', '🙂', '✅ Yes', 'Ναι', 'да', '是', 'x²'].map((content, i) => block({ id: `01HB${String(i).padStart(22, '0')}`, content }));
    const canvas = serializeCanvas(blocks, [doc({ id: DOC })], DOC);
    const bytes = Buffer.byteLength(canvas);
    expect(tokensReckoned(bytes)).toBe(bytes);
    expect(tokensReckoned(bytes)).toBeGreaterThanOrEqual(canvas.length);
  });

  it('is null for a model with no price', () => {
    expect(worstCostGbp('other', 100, 100, pricing)).toBeNull();
    expect(worstCostGbp('m', 100, 100, { prices: pricing.prices })).toBeNull();
  });
});
