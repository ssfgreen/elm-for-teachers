import { describe, expect, it } from 'vitest';
import { findLooseCodes, isCodeOnly, normaliseCodes } from './codes.js';
import { search } from './search.js';
import { fixture } from './test-fixture.js';
import { parseQuery } from './tokens.js';

describe('search', () => {
  it('ranks the line that starts with an exact code first', () => {
    const { results } = search(fixture(), { query: 'MNU 2-03a' });
    expect(results[0]!.snippet).toMatch(/^MNU 2-03a:/);
    expect(results[0]!.line).toBe(13);
    expect(results[1]!.snippet).toMatch(/^Fractions appear again in MNU 2-03a/);
    expect(results[0]!.source_url).toBe('https://example.org/numeracy.pdf');
  });

  it('finds codes however they are typed, and a code without its letter as a prefix', () => {
    expect(search(fixture(), { query: 'mnu 2 - 03b' }).results[0]!.snippet).toMatch(/^MNU 2-03b/);
    const prefix = search(fixture(), { query: 'MNU 2-03' }).results.map((r) => r.snippet.slice(0, 9));
    expect(prefix.slice(0, 2).sort()).toEqual(['MNU 2-03a', 'MNU 2-03b']);
  });

  it('ranks by words, with stemming, and honours filters and limit', () => {
    const { results } = search(fixture(), { query: 'solving problems' });
    expect(results[0]!.snippet).toMatch(/solving problems/);
    expect(search(fixture(), { query: 'problem', filters: { subject: 'literacy and english' } }).results.map((r) => r.path)).toEqual([
      'literacy.md',
    ]);
    expect(search(fixture(), { query: 'problems', limit: 1 }).results).toHaveLength(1);
  });

  it('uses headings as context', () => {
    const { results } = search(fixture(), { query: 'estimation' });
    expect(results.some((r) => r.snippet.startsWith('MNU 0-01a'))).toBe(true);
  });

  it('returns nothing for words that are not there, and refuses an empty query', () => {
    expect(search(fixture(), { query: 'photosynthesis' }).results).toEqual([]);
    expect(() => search(fixture(), { query: '  ' })).toThrow(/empty/);
    expect(() => search(fixture(), { query: 'x', limit: 0 })).toThrow(/limit/);
  });
});

describe('codes', () => {
  it('normalises messy codes from PDFs', () => {
    expect(findLooseCodes('LIT 0-01a / L IT 0-11a / LIT 0-20a')).toEqual(['LIT 0-01a', 'LIT 0-11a', 'LIT 0-20a']);
    expect(findLooseCodes('E NG 0-12a')).toEqual(['ENG 0-12a']);
    expect(findLooseCodes('TCH 02-02a')).toEqual(['TCH 2-02a']);
    expect(findLooseCodes('MLAN 1-03')).toEqual(['MLAN 1-03']);
    expect(findLooseCodes('MNU 2–03a')).toEqual(['MNU 2-03a']);
    expect(normaliseCodes('RERC 1-01a  /  E NG 0-03a')).toBe('RERC 1-01a  /  ENG 0-03a');
    expect(findLooseCodes('RME 0-07a / 1-07a / RME 2-07a')).toEqual(['RME 0-07a', 'RME 1-07a', 'RME 2-07a']);
    expect(isCodeOnly('RME 0-07a / 1-07a')).toBe(true);
  });

  it('tells a code-only line from text', () => {
    expect(isCodeOnly('LIT 1-01a / LIT 2-01a')).toBe(true);
    expect(isCodeOnly('SOC 0-01a to SOC 4-01a')).toBe(true);
    expect(isCodeOnly('MNU 1-01a .')).toBe(false);
    expect(isCodeOnly('I can count')).toBe(false);
  });

  it('splits a query into codes and words', () => {
    expect(parseQuery('fractions MNU 2-07a')).toMatchObject({ codes: ['MNU 2-07a'], terms: ['fraction', 'mnu2-07a'] });
  });
});
