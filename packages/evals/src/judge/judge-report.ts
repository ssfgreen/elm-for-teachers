/**
 * The judge experiment's report (docs/spyglass.md, Part 8): for each model, how often its answer
 * could be used, how fast and how big it was; each model's agreement with itself; agreement
 * between the pairs Sam chose; and the cases where models disagree most, for reading.
 */
import type { KeyDecision } from '@edw/shared';
import { findingsOf } from '../../../server/src/gateway/judge-prompt.js';
import type { SessionCase } from '../sessions/bundle.js';
import { caseAgreement, meanAgreement, type Agreement } from './agreement.js';

export interface JudgeRecord {
  case: string;
  model: string;
  run: number;
  /** All the flags given, or null when no answer could be used. */
  flags: KeyDecision[] | null;
  errors: string[];
  latency_ms: number;
  calls: number;
  input_tokens: number;
  output_tokens: number;
}

export interface Pair {
  a: string;
  b: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const fmt = (a: Agreement | null) => (a ? `${a.labelled.toFixed(2)} labelled, ${a.blocks.toFixed(2)} blocks, ${pct(a.any)} same on whether to flag` : 'no answers');

function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))]! : 0;
}

const runsOf = (records: readonly JudgeRecord[], c: string, model: string) => records.filter((r) => r.case === c && r.model === model).sort((a, b) => a.run - b.run).map((r) => r.flags);

export interface JudgeSummary {
  models: Record<string, { runs: number; valid: number; median_ms: number; p95_ms: number; input: number; output: number; flags: number; any: number }>;
  self: Record<string, Agreement | null>;
  pairs: Array<Pair & { agreement: Agreement | null }>;
  /** Per case and pair, lowest labelled agreement first. */
  disagreements: Array<{ case: string; pair: string; labelled: number }>;
}

export function summarise(records: readonly JudgeRecord[], models: readonly string[], pairs: readonly Pair[]): JudgeSummary {
  const cases = [...new Set(records.map((r) => r.case))];
  const summary: JudgeSummary = { models: {}, self: {}, pairs: [], disagreements: [] };
  for (const m of models) {
    const own = records.filter((r) => r.model === m);
    const valid = own.filter((r) => r.flags);
    const mean = (f: (r: JudgeRecord) => number, of = own) => (of.length ? of.reduce((s, r) => s + f(r), 0) / of.length : 0);
    summary.models[m] = {
      runs: own.length,
      valid: own.length ? valid.length / own.length : 0,
      median_ms: quantile(own.map((r) => r.latency_ms), 0.5),
      p95_ms: quantile(own.map((r) => r.latency_ms), 0.95),
      input: mean((r) => r.input_tokens),
      output: mean((r) => r.output_tokens),
      flags: mean((r) => r.flags!.length, valid),
      any: mean((r) => (r.flags!.length ? 1 : 0), valid),
    };
    summary.self[m] = meanAgreement(cases.map((c) => caseAgreement(runsOf(records, c, m))).filter((a): a is Agreement => a !== null));
  }
  for (const p of pairs) {
    const per = cases.map((c) => ({ c, a: caseAgreement(runsOf(records, c, p.a), runsOf(records, c, p.b)) }));
    summary.pairs.push({ ...p, agreement: meanAgreement(per.flatMap((x) => (x.a ? [x.a] : []))) });
    for (const x of per) if (x.a) summary.disagreements.push({ case: x.c, pair: `${p.a} / ${p.b}`, labelled: x.a.labelled });
  }
  summary.disagreements.sort((x, y) => x.labelled - y.labelled);
  return summary;
}

export function reportText(s: JudgeSummary, label: (model: string) => string, runs: number, cases: number): string {
  const lines = [`Judge experiment: ${cases} cases, ${runs} run(s) each per model.`, '', 'Per model:'];
  for (const [m, x] of Object.entries(s.models)) {
    lines.push(`  ${label(m)}: ${pct(x.valid)} usable answers; ${(x.median_ms / 1000).toFixed(1)} s median, ${(x.p95_ms / 1000).toFixed(1)} s at the 95th percentile; ${Math.round(x.input)} tokens in, ${Math.round(x.output)} out; ${x.flags.toFixed(1)} flags a run, something flagged in ${pct(x.any)} of runs.`);
  }
  lines.push('', 'Agreement with itself (mean over cases):');
  for (const [m, a] of Object.entries(s.self)) lines.push(`  ${label(m)}: ${fmt(a)}`);
  lines.push('', 'Agreement between models (mean over cases):');
  for (const p of s.pairs) lines.push(`  ${label(p.a)} and ${label(p.b)}: ${fmt(p.agreement)}`);
  lines.push('', 'Where they agree least (labelled):');
  for (const d of s.disagreements.slice(0, 8)) lines.push(`  ${d.labelled.toFixed(2)}  ${d.case}  (${d.pair.split(' / ').map(label).join(' and ')})`);
  return `${lines.join('\n')}\n`;
}

/** Every flag each model gave on each case, with the finding it is about, for reading the `why`s. */
export function flagsMarkdown(records: readonly JudgeRecord[], cases: readonly SessionCase[], models: readonly string[], label: (model: string) => string): string {
  const out = ['# Judge flags', ''];
  for (const c of cases) {
    const text = new Map(findingsOf(c.effect).flatMap((f) => f.block_ids.map((b) => [b, f] as const)));
    out.push(`## ${c.id}`, '', `> ${c.prompt.replace(/\s+/g, ' ')}`, '');
    for (const m of models) {
      out.push(`**${label(m)}**`, '');
      for (const r of records.filter((x) => x.case === c.id && x.model === m).sort((a, b) => a.run - b.run)) {
        if (!r.flags) out.push(`- run ${r.run + 1}: no usable answer (${r.errors.join('; ')})`);
        else if (!r.flags.length) out.push(`- run ${r.run + 1}: no flags`);
        else for (const f of r.flags) out.push(`- run ${r.run + 1}: ${f.label} [${f.block_ids.map((b) => text.get(b)?.ref ?? '?').join(', ')}] **${f.title}**: ${f.why}`);
      }
      out.push('');
    }
  }
  return out.join('\n');
}
