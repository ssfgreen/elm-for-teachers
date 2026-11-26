import { describe, expect, it } from 'vitest';
import { pairsOf } from '../src/judge/experiment.js';

describe('the judge experiment', () => {
  it('compares every pair of the models run, against the first listed', () => {
    expect(pairsOf(['sol', 'luna', 'mistral'])).toEqual([
      { a: 'luna', b: 'sol' },
      { a: 'mistral', b: 'sol' },
      { a: 'mistral', b: 'luna' },
    ]);
  });
});
