/**
 * Where a pupil's ask goes (#214, questions 49 and 91): its own tables only, never `events`,
 * `gateway_calls`, the export or the log's words; its cost in the workspace's spend and Usage;
 * and on Remove the ask and its words stay, under the anonymised id, and nothing names the pupil.
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { spendGbp } from '../budget/store.js';
import type { AppDeps } from '../deps.js';
import { buildBundle } from '../export/bundle.js';
import { forgetPupil } from '../pupils/tables.js';
import { tempDb, testDeps, testEnv, type TempDb } from '../test-helpers.js';
import { usageReport } from '../usage/routes.js';
import { BASE, readingWorld, RecordingProvider } from './test-reading.js';

let t: TempDb;
let deps: AppDeps;
let provider: RecordingProvider;
let app: FastifyInstance;
const lines: string[] = [];

beforeAll(async () => {
  t = await tempDb();
  provider = new RecordingProvider('gpt-6-sol', 'A secret-ish reply about straight roads.');
  deps = { ...testDeps(t.db, provider), env: testEnv({ AUTH_BASE_URL: BASE, PUPILS: 'on' }) };
  app = await buildApp(deps, { logger: true, logStream: { write: (l) => void lines.push(l) } });
});
afterAll(async () => {
  await app.close();
  t.cleanup();
});

const PASSAGE = 'soldiers could march quickly';
type World = Awaited<ReturnType<typeof readingWorld>>;
const askOnce = async (w: World) => {
  const r = await app.inject({ method: 'POST', url: `/api/pupil/readings/${w.reading.id}/asks`, headers: { origin: BASE, cookie: w.pupil.cookie }, payload: { prompt_id: w.explain.id, highlighted_text: PASSAGE } });
  expect(r.statusCode).toBe(200);
  return r.json().ask as { id: string; reply: string };
};
const count = async (sql: string, args: unknown[]) => Number((await t.db.execute(sql, args as never)).rows[0]!.n);

/** Each export file as a hash, so two exports compare whole. */
const exported = async (sid: string) => {
  const { files } = await buildBundle(deps, sid);
  return Object.fromEntries(Object.entries(files).map(([name, body]) => [name, createHash('sha256').update(body).digest('hex')]));
};

describe('research data', () => {
  it('an ask adds no event or call-log row, leaves the export byte for byte as it was, and logs no words', async () => {
    const w = await readingWorld(deps);
    const events = await count('SELECT COUNT(*) AS n FROM events WHERE session_id = ?', [w.sid]);
    const before = await exported(w.sid);
    lines.length = 0;
    const a = await askOnce(w);
    expect(await count('SELECT COUNT(*) AS n FROM events WHERE session_id = ?', [w.sid])).toBe(events);
    expect(await count('SELECT COUNT(*) AS n FROM gateway_calls WHERE session_id = ?', [w.sid])).toBe(0);
    expect(await exported(w.sid)).toEqual(before);
    const log = lines.join('');
    expect(log).toContain(a.id);
    for (const words of [PASSAGE, provider.reply, w.explain.instruction, 'Romans']) expect(log).not.toContain(words);
  });

  it('keeps the ask’s ids, tokens, cost and hashes apart from its words', async () => {
    const w = await readingWorld(deps);
    const a = await askOnce(w);
    const row = (await t.db.execute('SELECT * FROM reader_asks WHERE id = ?', [a.id])).rows[0]!;
    expect(row).toMatchObject({ member_id: w.pupil.member.id, reading_id: w.reading.id, prompt_id: w.explain.id, parent_ask_id: null, model: 'gpt-6-luna', input_tokens: 1000, output_tokens: 200, config_hash: deps.loaded.config_hash });
    expect(String(row.safety_hash)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(PASSAGE);
    const words = (await t.db.execute('SELECT highlighted_text, reply FROM reader_ask_texts WHERE ask_id = ?', [a.id])).rows[0]!;
    expect([words.highlighted_text, words.reply]).toEqual([PASSAGE, provider.reply]);
  });
});

describe('a failed call', () => {
  it('is logged with the provider error’s kind and status, and no words', async () => {
    const w = await readingWorld(deps);
    provider.fail = true;
    lines.length = 0;
    try {
      const r = await app.inject({ method: 'POST', url: `/api/pupil/readings/${w.reading.id}/asks`, headers: { origin: BASE, cookie: w.pupil.cookie }, payload: { prompt_id: w.explain.id, highlighted_text: PASSAGE } });
      expect(r.statusCode).toBe(502);
    } finally {
      provider.fail = false;
    }
    const refused = lines.map((l) => JSON.parse(l) as { msg?: string; reason?: string; provider?: unknown }).find((l) => l.msg === 'reader ask refused');
    expect(refused).toMatchObject({ reason: 'provider_error', provider: { kind: 'http', status: 500 } });
    expect(lines.join('')).not.toContain('provider said');
    expect(lines.join('')).not.toContain(PASSAGE);
  });
});

describe('spend', () => {
  it('counts in the workspace’s spend and in Usage', async () => {
    const w = await readingWorld(deps);
    await askOnce(w);
    // gpt-6-luna: 1000 in at $0.10 and 200 out at $0.50 a million, at config's rate.
    const cost = ((1000 * 0.1 + 200 * 0.5) / 1_000_000) * deps.loaded.config.provider.usd_to_gbp!;
    expect(await spendGbp(t.db, w.sid)).toBeCloseTo(cost, 12);
    const usage = await usageReport(deps, w.sid, 'all');
    expect(usage.spent_gbp).toBeCloseTo(cost, 12);
    expect(usage.days.reduce((n, d) => n + d.gbp, 0)).toBeCloseTo(cost, 12);
  });
});

describe('Remove (question 91, Sam 24 Nov 2026: keep what was asked about)', () => {
  it('keeps the ask, its passage and its reply under the removed_pupils id; nothing still names the pupil; its cost still counts', async () => {
    const w = await readingWorld(deps);
    const a = await askOnce(w);
    const spent = await spendGbp(t.db, w.sid);
    const anon = await forgetPupil(t.db, w.pupil.pupil.id);
    const row = (await t.db.execute('SELECT member_id FROM reader_asks WHERE id = ?', [a.id])).rows[0]!;
    expect(row.member_id).toBe(anon[w.cls.id]);
    expect(await count('SELECT COUNT(*) AS n FROM removed_pupils WHERE id = ?', [row.member_id])).toBe(1);
    const words = (await t.db.execute('SELECT highlighted_text, reply FROM reader_ask_texts WHERE ask_id = ?', [a.id])).rows[0];
    expect(words && [words.highlighted_text, words.reply]).toEqual([PASSAGE, provider.reply]);
    expect(await spendGbp(t.db, w.sid)).toBe(spent);
    // No row of any table still holds the pupil's id or their membership's.
    const tables = (await t.db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.map((r) => String(r.name));
    for (const table of tables) {
      const all = JSON.stringify((await t.db.execute(`SELECT * FROM "${table}"`)).rows);
      expect([table, all.includes(w.pupil.pupil.id), all.includes(w.pupil.member.id)]).toEqual([table, false, false]);
    }
  });
});
