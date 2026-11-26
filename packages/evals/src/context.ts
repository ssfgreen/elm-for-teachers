/**
 * Which model and settings the evals run against, from the environment:
 *   EVAL_PROVIDER     elm (default) or mock (the offline mock, to check the harness itself)
 *   EVAL_CONFIG_DIR   a config directory (default: the repo's config/), to compare variants
 *   EVAL_MODE         agent or single, overriding the config's mode
 *   EVAL_RUNS         repetitions per case (default 1; one run cannot show stability)
 *   EVAL_STRICT=1     fail a case when a check fails (default: failures are report data)
 * ELM settings come from the environment or the repo's .env, as for the server.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Mode, type LoadedConfig, type ProviderAdapter } from '@edw/shared';
import { loadAppConfig } from '@edw/shared/node';
import { createProvider } from '../../server/src/gateway/provider.js';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Values from the repo's .env for keys not already set (never overriding the environment). */
function readDotEnv(): void {
  const file = path.join(REPO_ROOT, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
}

export interface EvalContext {
  provider: ProviderAdapter;
  loaded: LoadedConfig;
  /** The same config with these skills switched on (a case's `skills`). */
  withSkills(names: string[]): LoadedConfig;
  providerKind: 'elm' | 'mock';
  runs: number;
  strict: boolean;
}

let cached: EvalContext | null = null;

export function evalContext(): EvalContext {
  if (cached) return cached;
  readDotEnv();
  const providerKind = (process.env.EVAL_PROVIDER ?? 'elm') as 'elm' | 'mock';
  if (providerKind !== 'elm' && providerKind !== 'mock') throw new Error(`EVAL_PROVIDER must be elm or mock, not ${providerKind}`);
  const configDir = process.env.EVAL_CONFIG_DIR ? path.resolve(process.env.EVAL_CONFIG_DIR) : path.join(REPO_ROOT, 'config');
  const mode = process.env.EVAL_MODE ? Mode.parse(process.env.EVAL_MODE) : undefined;
  const load = (skills?: string[]) =>
    loadAppConfig(configDir, (c) => ({ ...c, ...(mode ? { mode } : {}), ...(skills ? { agent: { ...(c.agent as object), skills } } : {}) }));
  const loaded = load();
  const p = loaded.config.provider;
  if (providerKind === 'elm' && (!process.env.ELM_PROXY_BASE_URL || !process.env.ELM_PROXY_API_KEY)) {
    throw new Error('The evals call ELM: set ELM_PROXY_BASE_URL and ELM_PROXY_API_KEY (or put them in .env), or EVAL_PROVIDER=mock.');
  }
  const provider = createProvider({
    kind: providerKind,
    model: providerKind === 'mock' ? 'mock-model' : p.model,
    temperature: p.temperature,
    baseUrl: process.env.ELM_PROXY_BASE_URL,
    apiKey: process.env.ELM_PROXY_API_KEY,
    chatPath: process.env.ELM_PROXY_CHAT_PATH || undefined,
    responsesPath: process.env.ELM_PROXY_RESPONSES_PATH || undefined,
    reasoningEffort: loaded.config.agent.reasoning_effort,
    maxOutputTokens: p.max_output_tokens,
    mockStreamDelayMs: 0,
  });
  cached = { provider, loaded, withSkills: (names) => load(names), providerKind, runs: Math.max(1, Number(process.env.EVAL_RUNS ?? 1) || 1), strict: process.env.EVAL_STRICT === '1' };
  return cached;
}
