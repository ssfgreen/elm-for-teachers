import { readdirSync, readFileSync } from 'node:fs';
import { posix, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { covers, parsePassport, publishCheck, type PublishLevel } from './index.js';

type Change = Record<string, unknown> | 'no passport';
interface CheckCase {
  name: string;
  level: PublishLevel;
  change: Change;
  blocking: string[];
  suggestions: string[];
}
const cases = JSON.parse(readFileSync(new URL('./passport.cases.json', import.meta.url), 'utf8')) as {
  base: Record<string, unknown>;
  check: CheckCase[];
  refuse: { name: string; change: Record<string, unknown>; error: string }[];
  covers: { name: string; version: string; content_hash: string; covered: boolean }[];
};

/** The base passport with each dotted path in `change` set to its value. */
function apply(change: Record<string, unknown>): Record<string, unknown> {
  const out = structuredClone(cases.base);
  for (const [path, value] of Object.entries(change)) {
    const keys = path.split('.');
    const last = keys.pop() as string;
    let at = out;
    for (const k of keys) at = at[k] as Record<string, unknown>;
    at[last] = structuredClone(value);
  }
  return out;
}

describe('publishCheck, from passport.cases.json', () => {
  it.each(cases.check)('$name', ({ level, change, blocking, suggestions }) => {
    const passport = change === 'no passport' ? null : parsePassport(apply(change));
    const result = publishCheck(passport, level);
    expect(result.blocking.map((p) => p.code)).toEqual(blocking);
    expect(result.suggestions.map((p) => p.code)).toEqual(suggestions);
  });
});

describe('parsePassport, from passport.cases.json', () => {
  it('accepts the base', () => expect(() => parsePassport(cases.base)).not.toThrow());
  it.each(cases.refuse)('refuses $name', ({ change, error }) => {
    expect(() => parsePassport(apply(change))).toThrow(error);
  });
  it('names the field in its message', () => {
    expect(() => parsePassport(apply({ 'sections.risks.text': '' }))).toThrow(/^passport\.json: sections\.risks\.text: /);
  });
});

describe('covers, from passport.cases.json', () => {
  const passport = parsePassport(cases.base);
  it.each(cases.covers)('$name', ({ version, content_hash, covered }) => {
    expect(covers(passport, version, content_hash)).toBe(covered);
  });
});

describe('publishCheck messages', () => {
  it('name the section and the person', () => {
    const p = parsePassport(apply({ 'sections.risks.approved_by': ['author_z'] }));
    const { blocking, suggestions } = publishCheck(p, 'limited');
    expect(blocking[0]).toMatchObject({ section: 'risks', message: 'Risks is approved by author_z, who is not among the authors.' });
    expect(suggestions[0]).toMatchObject({ section: 'risks', message: 'Risks has not been approved by an author.' });
  });
});

/** The studio copies this folder, so it may only import itself, zod and node:crypto. */
describe('the passport folder is self-contained', () => {
  const dir = new URL('./', import.meta.url);
  const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => /\.[cm]?[jt]s$/.test(f));
  const SPEC = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

  /** Returns the imports in `source` (at `file`, relative to the folder) that are not allowed. */
  function outside(source: string, file = 'index.ts'): string[] {
    return [...source.matchAll(SPEC)]
      .map((m) => m[1] as string)
      .filter((spec) => !(spec === 'zod' || spec === 'node:crypto' || staysInside(file, spec)));
  }

  /** A relative import that, resolved from `file`, is still inside the folder. */
  function staysInside(file: string, spec: string): boolean {
    if (!spec.startsWith('./') && !spec.startsWith('../')) return false;
    const resolved = posix.normalize(posix.join(posix.dirname(file), spec));
    return resolved !== '..' && !resolved.startsWith('../');
  }

  it('finds the folder files', () => expect(files).toEqual(expect.arrayContaining(['schema.ts', 'check.ts', 'index.ts'])));

  it.each(files.filter((f) => !f.endsWith('.test.ts')))('%s imports only zod, node:crypto and ./', (file) => {
    expect(outside(readFileSync(new URL(file, dir), 'utf8'), file.split(sep).join('/'))).toEqual([]);
  });

  it('the scan catches imports from outside', () => {
    const bad = [
      "import { x } from '../plugin/manifest.js';",
      "import y from 'yaml';",
      "export * from '../core/index.js';",
      "const z = await import('node:fs');",
      "import './a/../../b.js';",
      "const w = require('node:path');",
    ];
    expect(outside(bad.join('\n'))).toEqual(['../plugin/manifest.js', 'yaml', '../core/index.js', 'node:fs', './a/../../b.js', 'node:path']);
    expect(outside("import { z } from 'zod';\nimport { a } from './schema.js';")).toEqual([]);
    expect(outside("import { a } from '../schema.js';", 'sub/render.ts')).toEqual([]);
    expect(outside("import { a } from '../../core/index.js';", 'sub/render.ts')).toEqual(['../../core/index.js']);
  });
});
