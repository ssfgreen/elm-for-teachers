import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isInsidePath, parseManifest } from './manifest.js';

interface Case {
  name: string;
  change: Record<string, unknown>;
  error?: string;
}
const cases = JSON.parse(readFileSync(new URL('./manifest.cases.json', import.meta.url), 'utf8')) as {
  base: Record<string, unknown>;
  accept: Case[];
  refuse: Case[];
};

/** The base manifest with a case's top-level fields replaced, and null ones removed. */
function apply(change: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...cases.base };
  for (const [k, v] of Object.entries(change)) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out;
}

describe('parseManifest, from manifest.cases.json', () => {
  it.each(cases.accept)('accepts $name', ({ change }) => {
    expect(() => parseManifest(apply(change))).not.toThrow();
  });

  it.each(cases.refuse)('refuses $name', ({ change, error }) => {
    expect(() => parseManifest(apply(change))).toThrow(error);
  });
});

describe('parseManifest', () => {
  it('fills the defaults: reuse adapt_with_credit, and empty lists', () => {
    const m = parseManifest({ format: 1, id: 'a/b', version: '0.0.1', name: 'B', description: 'B' });
    expect(m).toMatchObject({ reuse: 'adapt_with_credit', collections: [], tools: [], settings: {}, tags: [], use_in: [] });
  });

  it('names the plugin.json field in its message', () => {
    expect(() => parseManifest({ ...cases.base, version: 'one' })).toThrow(/^plugin\.json: version: /);
  });
});

describe('isInsidePath', () => {
  it.each(['collections/a', 'skills/x/y', 'a.b/c'])('keeps %s', (p) => expect(isInsidePath(p)).toBe(true));
  it.each(['', '/a', 'a/../b', '..', './a', 'a//b', 'a\\b', 'C:/a'])('refuses %j', (p) => expect(isInsidePath(p)).toBe(false));
});
