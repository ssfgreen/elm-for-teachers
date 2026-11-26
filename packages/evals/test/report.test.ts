import { describe, expect, it } from 'vitest';
import { buildReport, formatReport, toBaseline } from '../src/report.js';
import type { Observation } from '../src/suite.js';

const obs = (c: string, run: number, pass: boolean, uncached: number, steps = 2, budgetPass = true): Observation => ({
  case: c,
  run,
  ok: true,
  error: null,
  steps,
  tools: ['edit_document'],
  usage: { input: uncached + 1000, cached: 1000, cacheWrite: 0, uncached, output: 300, reasoning: 100 },
  latencyMs: 5000,
  checks: [
    { name: 'made edits', kind: 'behaviour', pass },
    { name: 'model calls ≤ 3', kind: 'budget', pass: budgetPass },
  ],
});

describe('buildReport', () => {
  it('summarises pass rates, failed checks and mean cost per case, and totals', () => {
    const r = buildReport([obs('A', 0, true, 1000), obs('A', 1, false, 2000, 4, false), obs('B', 0, true, 500)]);
    const a = r.cases.find((c) => c.case === 'A')!;
    expect(a).toMatchObject({ runs: 2, passRate: 0.5, budgetRate: 0.5, failed: { 'made edits': 1, 'model calls ≤ 3': 1 }, mean: { steps: 3, uncachedInput: 1500, output: 300 } });
    expect(r.totals).toMatchObject({ cases: 2, runs: 3, steps: 8, uncachedInput: 3500, cachedInput: 3000 });
    expect(formatReport(r, { model: 'm', mode: 'agent', runs: 2 })).toContain('FAIL A');
  });

  it('flags what got worse than the baseline, beyond the cost tolerance, and names new cases', () => {
    const baseline = toBaseline(buildReport([obs('A', 0, true, 1000), obs('B', 0, true, 1000)]));
    const now = buildReport([obs('A', 0, false, 1100), obs('B', 0, true, 2000), obs('C', 0, true, 1)], baseline);
    expect(now.regressions).toEqual(['A: pass rate 1 → 0', 'B: uncachedInput 1000 → 2000']);
    expect(now.newCases).toEqual(['C']);
  });
});
