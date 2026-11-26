import { describe, expect, it } from 'vitest';
import { judgeModelFor } from './judge.js';

describe("the judge's model", () => {
  const cfg = { judge_model: 'gpt-6-sol', judge_models: ['gpt-6-sol', 'gpt-6-luna'] };

  it("is the turn's own model when that model judges its own turns", () => {
    expect(judgeModelFor(cfg, 'gpt-6-luna', 'gpt-6-sol')).toBe('gpt-6-luna');
    expect(judgeModelFor(cfg, 'gpt-6-sol', 'gpt-6-sol')).toBe('gpt-6-sol');
  });

  it('is the judge model for any other turn, Astra included', () => {
    expect(judgeModelFor(cfg, 'gpt-6-astra', 'gpt-6-sol')).toBe('gpt-6-sol');
    expect(judgeModelFor(cfg, undefined, 'gpt-6-sol')).toBe('gpt-6-sol');
  });

  it("is the provider's default when no judge model is set", () => {
    expect(judgeModelFor({ judge_models: [] }, 'gpt-6-astra', 'gpt-6-sol')).toBe('gpt-6-sol');
  });
});
