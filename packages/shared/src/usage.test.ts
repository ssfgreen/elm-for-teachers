import { describe, expect, it } from "vitest";
import { priceCalls } from "./usage.js";

const sol = { input: 2, output: 10, cached_input: 0.1, cache_write: 2.5 };

describe("priceCalls", () => {
  it("prices the calls' tokens in pounds", () => {
    const gbp = priceCalls(
      [
        { model: "sol", input_tokens: 1_000_000, output_tokens: 100_000 },
        { model: "sol", input_tokens: 500_000, output_tokens: 0 },
      ],
      { sol },
      0.5,
    );
    // input 1.5M at $2 = $3, output 100k at $10 = $1: $4 is £2
    expect(gbp).toBe(2);
  });

  it("prices cached input and cache writes at their own price", () => {
    const gbp = priceCalls([{ model: "sol", input_tokens: 1_000_000, output_tokens: 0, cached_tokens: 600_000, cache_write_tokens: 200_000 }], { sol }, 1);
    // 200k full (0.40) + 600k cached (0.06) + 200k written (0.50)
    expect(gbp).toBeCloseTo(0.96);
  });

  it("counts calls that failed before an answer as nothing", () => {
    expect(priceCalls([{ model: "sol", input_tokens: null, output_tokens: null }], { sol }, 1)).toBe(0);
  });

  it("gives no cost when a used model has no price, or there is no exchange rate", () => {
    expect(priceCalls([{ model: "qwen", input_tokens: 10, output_tokens: 5 }], { sol }, 1)).toBeNull();
    expect(priceCalls([{ model: "sol", input_tokens: 10, output_tokens: 5 }], { sol })).toBeNull();
  });
});
