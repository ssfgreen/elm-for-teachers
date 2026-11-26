import { describe, expect, it } from 'vitest';
import { CLASS_CODE_LENGTH, formatClassCode, newClassCode, normaliseClassCode } from './codes.js';

describe('class codes', () => {
  it('are eight characters, shown as XXXX-XXXX', () => {
    const code = newClassCode();
    expect(code).toHaveLength(CLASS_CODE_LENGTH);
    expect(formatClassCode(code)).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  });

  it('forgive case, spaces, hyphens, I, L and O, and refuse anything else', () => {
    expect(normaliseClassCode(' ab1d-efgh ')).toBe('AB1DEFGH');
    expect(normaliseClassCode('abId efgO')).toBe('AB1DEFG0');
    expect(normaliseClassCode('ABCD-EFG')).toBeNull();
    expect(normaliseClassCode('ABCD-EFGU')).toBeNull();
    expect(normaliseClassCode('ABCD-EFGH-JKMN')).toBeNull();
  });
});
