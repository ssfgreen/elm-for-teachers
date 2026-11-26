import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadCollection } from '../core/fs.js';
import { describeCollection, runOperation } from '../server/api.js';

const real = loadCollection(fileURLToPath(new URL('../../collections/cfe-curriculum', import.meta.url)));
const run = (op: 'structure' | 'outcomes' | 'benchmarks', body: unknown) => runOperation(real, op, body).body as Record<string, unknown>;

describe('the structured curriculum as built', () => {
  it('has every area, and P7 (Second) and S1 (Third) benchmarks', () => {
    expect(describeCollection(real)).toMatchObject({ kind: 'curriculum' });
    const s = run('structure', {});
    expect(s.benchmark_levels).toEqual(['second', 'third']);
    expect((s.areas as { name: string }[]).map((a) => a.name)).toEqual(expect.arrayContaining(['Literacy and English', 'Social studies', 'Numeracy and mathematics']));
  });

  it('lists P7 literacy outcomes by organiser, and finds one by code', () => {
    const r = run('outcomes', { stage: 'p7', area: 'Literacy and English' });
    expect(r.total).toBeGreaterThan(25);
    const one = run('outcomes', { code: 'LIT 2-16a' }).outcomes as { organiser: string; sub_organiser: string; text: string }[];
    expect(one[0]).toMatchObject({ organiser: 'Reading', sub_organiser: 'Understanding, analysing and evaluating' });
  });

  it('gives the benchmarks for an S1 history outcome', () => {
    const b = run('benchmarks', { codes: ['SOC 3-01a'] }).benchmarks as { level: string; text: string }[];
    expect(b.length).toBeGreaterThan(5);
    expect(b.every((x) => x.level === 'third')).toBe(true);
    expect(b.some((x) => /primary and secondary sources/.test(x.text))).toBe(true);
  });

  it('covers every Second level literacy code and Third level social studies code', () => {
    const cov = run('structure', {}).coverage as { area: string; level: string; missing: string[] }[];
    expect(cov.find((c) => c.area === 'Literacy and English' && c.level === 'second')!.missing).toEqual([]);
    expect(cov.find((c) => c.area === 'Social studies' && c.level === 'third')!.missing).toEqual([]);
  });

  it('refuses a level that is not one, and benchmarks with nothing to look for', () => {
    expect(runOperation(real, 'outcomes', { level: 'fifth' }).status).toBe(400);
    expect(runOperation(real, 'benchmarks', {}).status).toBe(400);
  });
});
