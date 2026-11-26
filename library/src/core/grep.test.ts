import { describe, expect, it } from 'vitest';
import { grep } from './grep.js';
import { fixture } from './test-fixture.js';

describe('grep', () => {
  it('finds lines by regex with their path and line number', () => {
    const { matches, truncated } = grep(fixture(), { pattern: '^MNU 2-03' });
    expect(truncated).toBe(false);
    expect(matches.map((m) => [m.path, m.line, m.text.slice(0, 9)])).toEqual([
      ['numeracy.md', 13, 'MNU 2-03a'],
      ['numeracy.md', 14, 'MNU 2-03b'],
    ]);
    expect(matches[0]!.before).toBeUndefined();
  });

  it('ignores case when asked and adds context lines', () => {
    const { matches } = grep(fixture(), { pattern: 'patterns AND sounds', ignore_case: true, context: 1 });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.before).toEqual(['']);
    expect(matches[0]!.after).toEqual([matches[0]!.after![0]]);
    expect(matches[0]!.after![0]).toMatch(/^LIT 1-02a/);
  });

  it('honours filters and path globs', () => {
    expect(grep(fixture(), { pattern: 'problems', filters: { subject: 'literacy and english' } }).matches).toHaveLength(1);
    expect(grep(fixture(), { pattern: 'problems', path_glob: 'num*' }).matches).toHaveLength(3);
  });

  it('caps matches and says it was truncated', () => {
    const r = grep(fixture(), { pattern: '.', max_matches: 2 });
    expect(r.matches).toHaveLength(2);
    expect(r.truncated).toBe(true);
  });

  it('stops when the time budget runs out', () => {
    let t = 0;
    const r = grep(fixture(), { pattern: '.' }, () => (t += 100));
    expect(r.truncated).toBe(true);
    expect(r.matches.length).toBeLessThan(5);
  });

  it('refuses long, invalid and catastrophic patterns', () => {
    expect(() => grep(fixture(), { pattern: 'a'.repeat(201) })).toThrow(/200/);
    expect(() => grep(fixture(), { pattern: '(' })).toThrow(/not a valid/);
    expect(() => grep(fixture(), { pattern: '(a+)+$' })).toThrow(/repeats/);
    expect(() => grep(fixture(), { pattern: '(\\w*)*x' })).toThrow(/repeats/);
    expect(() => grep(fixture(), { pattern: '(.*a){20}' })).toThrow(/repeats/);
    expect(() => grep(fixture(), { pattern: 'x', context: 4 })).toThrow(/context/);
    expect(() => grep(fixture(), { pattern: 'x', max_matches: 201 })).toThrow(/max_matches/);
  });

  it('still allows ordinary groups and quantifiers', () => {
    expect(grep(fixture(), { pattern: '(MNU|LIT) [0-4]-0[1-3]a' }).matches.length).toBeGreaterThan(3);
    expect(grep(fixture(), { pattern: '(?:sense)+ of' }).matches).toHaveLength(1);
  });
});
