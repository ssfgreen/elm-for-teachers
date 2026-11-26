/**
 * Zero-pupil CI guardrail for Elm for Teachers (docs/specs/02-elm-for-teachers-spec.md, T6).
 *
 * Enforces the five-level separation boundary at build/test time:
 *   1. The server registers zero pupil-facing or pupil-reader routes.
 *   2. No server source file inserts into or updates any dormant pupil/reader table.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, RouteOptions } from 'fastify';
import { buildApp } from './app.js';
import { findRepoRoot } from './env.js';
import { tempDb, testDeps, type TempDb } from './test-helpers.js';

const FORBIDDEN_ROUTE =
  /^\/api\/pupil(?:\/|$)|^\/r(?:\/|$)|\/(?:reader-prompts|readings|reading-sources|reader-settings|view-as-pupil|logins|code|members)(?:\/|$)/;

const DORMANT_PUPIL_TABLES = [
  'pupils',
  'pupil_sign_ins',
  'class_codes',
  'class_members',
  'removed_pupils',
  'pupil_logins',
  'reader_prompts',
  'readings',
  'reading_prompts',
  'reader_highlights',
  'reader_asks',
  'reader_ask_texts',
] as const;

const WRITE_SQL = new RegExp(`\\b(?:INSERT\\s+(?:OR\\s+\\w+\\s+)?INTO|UPDATE)\\s+["']?(?:${DORMANT_PUPIL_TABLES.join('|')})\\b`, 'i');

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTs(full));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

let t: TempDb;
let app: FastifyInstance;
const registered: RouteOptions[] = [];

beforeAll(async () => {
  t = await tempDb();
  app = await buildApp(testDeps(t.db), { onRoute: (r) => registered.push(r) });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  t.cleanup();
});

describe('zero-pupil separation guardrail', () => {
  it('registers zero pupil-facing or pupil-reader routes', () => {
    const offending = registered.filter((r) => FORBIDDEN_ROUTE.test(r.url)).map((r) => `${String(r.method)} ${r.url}`);
    expect(offending).toEqual([]);
  });

  it('has zero server source files that write to any dormant pupil or reader table', () => {
    const srcRoot = path.join(findRepoRoot(), 'packages', 'server', 'src');
    const offending: string[] = [];
    for (const file of walkTs(srcRoot)) {
      const text = readFileSync(file, 'utf8');
      if (WRITE_SQL.test(text)) offending.push(path.relative(srcRoot, file));
    }
    expect(offending).toEqual([]);
  });
});
