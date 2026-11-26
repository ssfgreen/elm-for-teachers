/**
 * The report (Pi's report.ts): per case, the pass rate of its behaviour checks, its budget
 * checks, which checks failed, and mean cost and time; totals; and, against a baseline, what
 * got worse. One run per case cannot show stability, so the report says how many runs it had.
 */
import type { Observation } from './suite.js';

export interface CaseSummary {
  case: string;
  runs: number;
  /** Runs whose behaviour checks all passed. */
  passRate: number;
  /** Runs within every budget. */
  budgetRate: number;
  /** Failed check name -> number of runs it failed in. */
  failed: Record<string, number>;
  mean: { steps: number; uncachedInput: number; cachedInput: number; output: number; latencyMs: number };
  errors: number;
}

export interface Report {
  cases: CaseSummary[];
  totals: { cases: number; runs: number; passRate: number; budgetRate: number; steps: number; input: number; cachedInput: number; uncachedInput: number; output: number; reasoning: number; latencyMs: number };
  /** Against the baseline: what got worse, and cases it does not have. */
  regressions: string[];
  newCases: string[];
}

/** The part of a report kept as the baseline (baseline.json). */
export type Baseline = Record<string, Pick<CaseSummary, 'passRate' | 'budgetRate' | 'mean'>>;

/** How much more a cost may be than the baseline's before it is flagged. */
export const COST_TOLERANCE = 1.25;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round = (x: number) => Math.round(x * 100) / 100;

export function buildReport(observations: Observation[], baseline: Baseline | null = null): Report {
  const byCase = new Map<string, Observation[]>();
  for (const o of observations) byCase.set(o.case, [...(byCase.get(o.case) ?? []), o]);
  const cases: CaseSummary[] = [...byCase.entries()].map(([id, runs]) => {
    const failed: Record<string, number> = {};
    for (const r of runs) for (const c of r.checks) if (!c.pass) failed[c.name] = (failed[c.name] ?? 0) + 1;
    const allPass = (r: Observation, kind: 'behaviour' | 'budget') => !r.error && r.checks.filter((c) => c.kind === kind).every((c) => c.pass);
    return {
      case: id,
      runs: runs.length,
      passRate: round(runs.filter((r) => allPass(r, 'behaviour')).length / runs.length),
      budgetRate: round(runs.filter((r) => allPass(r, 'budget')).length / runs.length),
      failed,
      mean: {
        steps: round(mean(runs.map((r) => r.steps))),
        uncachedInput: Math.round(mean(runs.map((r) => r.usage?.uncached ?? 0))),
        cachedInput: Math.round(mean(runs.map((r) => r.usage?.cached ?? 0))),
        output: Math.round(mean(runs.map((r) => r.usage?.output ?? 0))),
        latencyMs: Math.round(mean(runs.map((r) => r.latencyMs))),
      },
      errors: runs.filter((r) => r.error).length,
    };
  });
  const sum = (f: (o: Observation) => number) => observations.reduce((a, o) => a + f(o), 0);
  const runs = observations.length;
  const regressions: string[] = [];
  const newCases: string[] = [];
  if (baseline) {
    for (const c of cases) {
      const b = baseline[c.case];
      if (!b) {
        newCases.push(c.case);
        continue;
      }
      if (c.passRate < b.passRate) regressions.push(`${c.case}: pass rate ${b.passRate} → ${c.passRate}`);
      if (c.budgetRate < b.budgetRate) regressions.push(`${c.case}: within budget ${b.budgetRate} → ${c.budgetRate}`);
      for (const k of ['steps', 'uncachedInput', 'output'] as const) {
        if (b.mean[k] > 0 && c.mean[k] > b.mean[k] * COST_TOLERANCE) regressions.push(`${c.case}: ${k} ${b.mean[k]} → ${c.mean[k]}`);
      }
    }
  }
  return {
    cases,
    totals: {
      cases: cases.length,
      runs,
      passRate: round(cases.length ? mean(cases.map((c) => c.passRate)) : 0),
      budgetRate: round(cases.length ? mean(cases.map((c) => c.budgetRate)) : 0),
      steps: sum((o) => o.steps),
      input: sum((o) => o.usage?.input ?? 0),
      cachedInput: sum((o) => o.usage?.cached ?? 0),
      uncachedInput: sum((o) => o.usage?.uncached ?? 0),
      output: sum((o) => o.usage?.output ?? 0),
      reasoning: sum((o) => o.usage?.reasoning ?? 0),
      latencyMs: sum((o) => o.latencyMs),
    },
    regressions,
    newCases,
  };
}

export function toBaseline(report: Report): Baseline {
  return Object.fromEntries(report.cases.map((c) => [c.case, { passRate: c.passRate, budgetRate: c.budgetRate, mean: c.mean }]));
}

export function formatReport(report: Report, protocol: { model: string; mode: string; runs: number }): string {
  const t = report.totals;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const lines = [
    `Evals: ${t.cases} cases, ${t.runs} runs (${protocol.runs} per case) on ${protocol.model}, ${protocol.mode} mode`,
    `Behaviour: ${pct(t.passRate)} of runs passed every check. Budget: ${pct(t.budgetRate)} within every budget.`,
    `Cost: ${t.steps} model calls; input ${t.input} tokens (${t.cachedInput} cached, ${t.uncachedInput} uncached); output ${t.output} (${t.reasoning} thinking); ${Math.round(t.latencyMs / 1000)} s.`,
    protocol.runs === 1 ? 'One run per case: pass rates show what happened once, not how stable it is (EVAL_RUNS=5 for that).' : '',
    '',
  ];
  for (const c of report.cases) {
    const mark = c.passRate === 1 && c.budgetRate === 1 ? 'ok  ' : c.passRate === 1 ? 'COST' : 'FAIL';
    lines.push(`${mark} ${c.case}`);
    lines.push(`     pass ${pct(c.passRate)}, budget ${pct(c.budgetRate)} | calls ${c.mean.steps}, uncached ${c.mean.uncachedInput}, cached ${c.mean.cachedInput}, out ${c.mean.output}, ${c.mean.latencyMs} ms`);
    for (const [name, k] of Object.entries(c.failed)) lines.push(`     failed (${k}/${c.runs}): ${name}`);
    if (c.errors) lines.push(`     harness errors: ${c.errors}`);
  }
  if (report.regressions.length) lines.push('', 'Worse than the baseline:', ...report.regressions.map((r) => `  - ${r}`));
  if (report.newCases.length) lines.push('', `Not in the baseline: ${report.newCases.length} case(s)`);
  return `${lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')}\n`;
}
