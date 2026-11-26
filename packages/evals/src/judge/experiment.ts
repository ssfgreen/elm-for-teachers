/**
 * The judge experiment (docs/spyglass.md, Part 8), run by hand: `pnpm judge-models`. Every
 * session case that calls the judge, several runs per model, a few calls at a time. Writes
 * `.eval/judge-<time>/`: records.jsonl (one line per run), report.txt and report.json, and
 * flags.md (every flag, for reading the `why`s and the disagreements). It calls the model.
 */
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { JUDGE_PROMPT_HASH, judgeTurn } from '../../../server/src/gateway/judge.js';
import { evalContext, REPO_ROOT } from '../context.js';
import type { SessionCase } from '../sessions/bundle.js';
import { flagsMarkdown, reportText, summarise, type JudgeRecord, type Pair } from './judge-report.js';

/** Astra is the larger model, the reference (Sam, 11 Nov). */
const DEFAULT_MODELS = ['gpt-6-astra', 'gpt-6-luna', 'mistralai/Mistral-Small-4-119B-2603'];

/** Every pair of the models run; the first model listed is the reference, so it comes second. */
export function pairsOf(models: readonly string[]): Pair[] {
  return models.flatMap((b, i) => models.slice(i + 1).map((a) => ({ a, b })));
}
const CALL_TIMEOUT_MS = 60_000;
const AT_ONCE = 4;

export const SESSIONS_DIR = path.join(REPO_ROOT, 'fixtures/sessions');

export function judgedCases(dir = SESSIONS_DIR): SessionCase[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((f) => (JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as { cases: SessionCase[] }).cases)
    .filter((c) => c.judged);
}

async function pool<T>(jobs: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, jobs.length) }, async () => {
      while (next < jobs.length) {
        const k = next++;
        out[k] = await jobs[k]!();
      }
    }),
  );
  return out;
}

export async function runJudgeExperiment(): Promise<string> {
  const ctx = evalContext();
  const mock = ctx.providerKind === 'mock';
  const listed = ctx.loaded.config.provider.models ?? [];
  const models = mock ? ['mock'] : process.env.JUDGE_MODELS ? process.env.JUDGE_MODELS.split(',').map((m) => m.trim()) : DEFAULT_MODELS;
  const label = (m: string) => listed.find((x) => x.id === m)?.label ?? m;
  const effort = (m: string) => (listed.find((x) => x.id === m)?.reasoning ? ('low' as const) : ('none' as const));
  const runs = Math.max(1, Number(process.env.JUDGE_RUNS ?? 5) || 5);
  const cases = judgedCases();
  const dir = path.join(REPO_ROOT, 'packages/evals/.eval', `judge-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'protocol.json'), `${JSON.stringify({ models, runs, cases: cases.map((c) => c.id), prompt_hash: JUDGE_PROMPT_HASH, effort: Object.fromEntries(models.map((m) => [m, effort(m)])), provider: ctx.providerKind }, null, 2)}\n`);

  const jobs = cases.flatMap((c) =>
    models.flatMap((model) =>
      Array.from({ length: runs }, (_, run) => async (): Promise<JudgeRecord> => {
        const started = performance.now();
        const record: JudgeRecord = { case: c.id, model, run, flags: null, errors: [], latency_ms: 0, calls: 0, input_tokens: 0, output_tokens: 0 };
        try {
          const out = await judgeTurn(ctx.provider, { prompt: c.prompt, reply: c.reply, effect: c.effect, docs: c.docs }, { ...(mock ? {} : { model, reasoningEffort: effort(model) }), signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
          Object.assign(record, { flags: out.flags, errors: out.errors, calls: out.steps.length, input_tokens: out.steps.reduce((s, x) => s + (x.input_tokens ?? 0), 0), output_tokens: out.steps.reduce((s, x) => s + (x.output_tokens ?? 0), 0) });
        } catch (err) {
          record.errors.push(err instanceof Error ? err.message : String(err));
        }
        record.latency_ms = Math.round(performance.now() - started);
        appendFileSync(path.join(dir, 'records.jsonl'), `${JSON.stringify(record)}\n`);
        return record;
      }),
    ),
  );
  const records = await pool(jobs, AT_ONCE);
  const pairs = mock ? [] : pairsOf(models);
  const summary = summarise(records, models, pairs);
  const text = reportText(summary, label, runs, cases.length);
  writeFileSync(path.join(dir, 'report.txt'), text);
  writeFileSync(path.join(dir, 'report.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(path.join(dir, 'flags.md'), flagsMarkdown(records, cases, models, label));
  return `${text}\nSaved in ${path.relative(REPO_ROOT, dir)}`;
}
