/**
 * The system prompt and app config by hash (table config_versions). The server records the
 * pair it loaded when it starts and whenever it creates a session, with the summary calls'
 * system prompt (gateway/summary.ts); a bundle then carries the exact text behind every hash
 * its session and gateway calls name.
 */
import { run, type DbOrTx } from './db/run.js';
import { nowIso, type LoadedConfig } from '@edw/shared';
import { sha256Hex } from '@edw/shared/node';
import { SUMMARY_SYSTEM_PROMPT } from './gateway/summary.js';
import { JUDGE_PROMPT_HASH, JUDGE_PROMPT_RECORD } from './gateway/judge.js';

export type ConfigKind = 'system_prompt' | 'config';
export interface ConfigVersion {
  hash: string;
  kind: ConfigKind;
  content: string;
  first_seen_at: string;
}

/**
 * The config is stored as its parsed JSON (zod defaults filled in), which is what config_hash
 * hashes: `hashJson(JSON.parse(content))` gives the hash back.
 */
export async function recordConfigVersions(x: DbOrTx, loaded: LoadedConfig): Promise<void> {
  const at = nowIso();
  const rows: [string, ConfigKind, string][] = [
    // With skills on, the text behind the hash is the prompt followed by the skills' files.
    [loaded.system_prompt_hash, 'system_prompt', loaded.system_prompt_record ?? loaded.system_prompt],
    [loaded.config_hash, 'config', `${JSON.stringify(loaded.config, null, 2)}\n`],
    [sha256Hex(SUMMARY_SYSTEM_PROMPT), 'system_prompt', SUMMARY_SYSTEM_PROMPT],
    // Spyglass's judge: its prompt, then its tool's schema (both are under its hash).
    [JUDGE_PROMPT_HASH, 'system_prompt', JUDGE_PROMPT_RECORD],
  ];
  for (const [hash, kind, content] of rows) {
    await run(x, { sql: 'INSERT OR IGNORE INTO config_versions (hash, kind, content, first_seen_at) VALUES (?, ?, ?, ?)', args: [hash, kind, content, at] });
  }
}

export async function loadConfigVersions(x: DbOrTx, hashes: string[]): Promise<ConfigVersion[]> {
  const unique = [...new Set(hashes)];
  if (unique.length === 0) return [];
  const r = await run(x, { sql: `SELECT * FROM config_versions WHERE hash IN (${unique.map(() => '?').join(', ')}) ORDER BY first_seen_at, hash`, args: unique });
  return r.rows.map((row) => ({ hash: String(row.hash), kind: String(row.kind) as ConfigKind, content: String(row.content), first_seen_at: String(row.first_seen_at) }));
}
