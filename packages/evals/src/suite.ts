/**
 * `evalCase`: one case = a fixture, the teacher's message and its checks (Pi: "eval files
 * contain only scenario setup, the model task, and deterministic grading"). Each run is
 * recorded to the run directory with its metrics and check results; a failed check fails the
 * test only with EVAL_STRICT=1. Infrastructure failures (the harness throwing) always fail it.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, inject, it } from 'vitest';
import { evalContext } from './context.js';
import { runCase, type CaseFixture, type EvalRun } from './harness.js';
import { budgetChecks, succeeded, type Budget, type Check, type CheckResult } from './judges.js';

declare module 'vitest' {
  export interface ProvidedContext {
    evalRunDir: string;
  }
}

/** One line of observations.jsonl. */
export interface Observation {
  case: string;
  run: number;
  ok: boolean;
  error: string | null;
  steps: number;
  tools: string[];
  usage: EvalRun['usage'] | null;
  latencyMs: number;
  checks: CheckResult[];
}

export interface CaseOptions {
  budget?: Budget;
  /** Skills switched on for this case (config `agent.skills`), whatever the config says. */
  skills?: string[];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

export function evalCase(name: string, fixture: CaseFixture, checks: Check[], opts: CaseOptions = {}): void {
  it(name, async () => {
    const ctx = evalContext();
    const dir = inject('evalRunDir');
    const file = path.basename(expect.getState().testPath ?? 'unknown', '.eval.ts');
    const id = `${file} > ${name}`;
    const all = [succeeded, ...checks, ...budgetChecks(opts.budget)];
    for (let run = 0; run < ctx.runs; run++) {
      let result: EvalRun | null = null;
      let error: string | null = null;
      try {
        result = await runCase(fixture, opts.skills ? { provider: ctx.provider, loaded: ctx.withSkills(opts.skills) } : ctx);
      } catch (err) {
        error = err instanceof Error ? (err.stack ?? err.message) : String(err);
      }
      const results = result ? all.map((c) => c(result)) : [];
      const obs: Observation = {
        case: id,
        run,
        ok: result?.ok ?? false,
        error,
        steps: result?.steps.length ?? 0,
        tools: result?.toolCalls.map((c) => c.name) ?? [],
        usage: result?.usage ?? null,
        latencyMs: result?.latencyMs ?? 0,
        checks: results,
      };
      appendFileSync(path.join(dir, 'observations.jsonl'), `${JSON.stringify(obs)}\n`);
      // The whole run, for reading what the assistant actually did (it holds the docs and reply).
      mkdirSync(path.join(dir, 'runs'), { recursive: true });
      writeFileSync(path.join(dir, 'runs', `${slug(id)}-${run}.json`), `${JSON.stringify({ case: id, run, fixture, result, checks: results, error }, null, 2)}\n`);
      if (error) throw new Error(`harness failed on ${id}: ${error}`);
      if (ctx.strict) expect(results.filter((r) => !r.pass), id).toEqual([]);
    }
  });
}
