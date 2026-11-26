/**
 * Vitest global setup for the evals (Pi's runner, in miniature). Before the cases: a run
 * directory `.eval/<timestamp>_<id>/` with protocol.json (model, mode, config and prompt
 * hashes, tools, runs per case, git commit). After them: report.json and report.txt, compared
 * with baseline.json, and printed. EVAL_UPDATE_BASELINE=1 writes this run's numbers as the new
 * baseline; with EVAL_STRICT=1 anything worse than the baseline fails the run.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GlobalSetupContext } from 'vitest/node';
import { Mode } from '@edw/shared';
import { loadAppConfig } from '@edw/shared/node';
import { buildReport, formatReport, toBaseline, type Baseline } from './report.js';
import type { Observation } from './suite.js';

const PACKAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(PACKAGE, '../..');
const BASELINE = path.join(PACKAGE, 'baseline.json');

export default function setup({ provide }: GlobalSetupContext) {
  const startedAt = new Date();
  const id = Math.random().toString(36).slice(2, 8);
  const dir = path.join(PACKAGE, '.eval', `${startedAt.toISOString().replace(/[:.]/g, '-')}_${id}`);
  mkdirSync(dir, { recursive: true });
  provide('evalRunDir', dir);

  const loaded = loadAppConfig(process.env.EVAL_CONFIG_DIR ? path.resolve(process.env.EVAL_CONFIG_DIR) : path.join(REPO_ROOT, 'config'));
  const mode = process.env.EVAL_MODE ? Mode.parse(process.env.EVAL_MODE) : loaded.config.mode;
  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    /* not a git checkout */
  }
  const protocol = {
    started_at: startedAt.toISOString(),
    provider: process.env.EVAL_PROVIDER ?? 'elm',
    model: process.env.EVAL_PROVIDER === 'mock' ? 'mock-model' : (process.env.EVAL_MODEL ?? loaded.config.provider.model),
    mode,
    tools: mode === 'agent' ? loaded.config.agent.tools : [],
    max_steps: loaded.config.agent.max_steps,
    reasoning_effort: loaded.config.agent.reasoning_effort,
    config_hash: loaded.config_hash,
    system_prompt_hash: loaded.system_prompt_hash,
    runs: Math.max(1, Number(process.env.EVAL_RUNS ?? 1) || 1),
    commit,
  };
  writeFileSync(path.join(dir, 'protocol.json'), `${JSON.stringify(protocol, null, 2)}\n`);

  return () => {
    const file = path.join(dir, 'observations.jsonl');
    const observations: Observation[] = existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Observation) : [];
    const baseline = existsSync(BASELINE) ? (JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline) : null;
    const report = buildReport(observations, baseline);
    const text = formatReport(report, protocol);
    writeFileSync(path.join(dir, 'report.json'), `${JSON.stringify({ protocol, ...report }, null, 2)}\n`);
    writeFileSync(path.join(dir, 'report.txt'), text);
    console.log(`\n${text}\nRun saved in ${path.relative(REPO_ROOT, dir)}`);
    if (process.env.EVAL_UPDATE_BASELINE === '1') {
      // Only cases that ran are replaced, so a filtered run updates just those.
      writeFileSync(BASELINE, `${JSON.stringify({ ...(baseline ?? {}), ...toBaseline(report) }, null, 2)}\n`);
      console.log(`Baseline updated: ${path.relative(REPO_ROOT, BASELINE)}`);
    }
    if (process.env.EVAL_STRICT === '1' && report.regressions.length) throw new Error(`${report.regressions.length} regression(s) against the baseline`);
  };
}
