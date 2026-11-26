import { describe, expect, it } from 'vitest';
import { ALPHABET, formatCode, newCode, normaliseCode } from './codes.js';

describe('codes', () => {
  it('makes twelve characters of the alphabet, different each time', () => {
    const a = newCode();
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    expect(newCode()).not.toBe(a);
    expect(ALPHABET).toHaveLength(32);
  });

  it('shows a code in groups of four', () => {
    expect(formatCode('ABCDEFGHJKMN')).toBe('ABCD-EFGH-JKMN');
  });

  it('forgives case, spaces, hyphens, I and L for 1, and O for 0', () => {
    expect(normaliseCode('ABCD-EFGH-JKMN')).toBe('ABCDEFGHJKMN');
    expect(normaliseCode(' abcd efgh jkmn ')).toBe('ABCDEFGHJKMN');
    expect(normaliseCode('abcd-efgh-jkmn')).toBe('ABCDEFGHJKMN');
    expect(normaliseCode('IL0O-1111-2222')).toBe('11001111' + '2222');
    expect(normaliseCode('ab\tcd-ef--gh-jkmn')).toBe('ABCDEFGHJKMN');
  });

  it('refuses what cannot be a code', () => {
    expect(normaliseCode('')).toBeNull();
    expect(normaliseCode('ABCD-EFGH-JKM')).toBeNull();
    expect(normaliseCode('ABCD-EFGH-JKMNP')).toBeNull();
    expect(normaliseCode('ABCD-EFGH-JKMU')).toBeNull();
    expect(normaliseCode('ABCD_EFGH_JKMN')).toBeNull();
  });

  it('normalises every code it makes to itself, and its shown form too', () => {
    for (let i = 0; i < 50; i++) {
      const c = newCode();
      expect(normaliseCode(c)).toBe(c);
      expect(normaliseCode(formatCode(c).toLowerCase())).toBe(c);
    }
  });
});
