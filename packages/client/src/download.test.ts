import { describe, expect, it } from 'vitest';
import { fileName } from './download';

describe('fileName', () => {
  it('keeps the doc name as it reads, replacing only characters file systems forbid', () => {
    expect(fileName('Metaphors and Similes - High Achievers')).toBe('Metaphors and Similes - High Achievers');
    expect(fileName('P7: Similes / Metaphors?')).toBe('P7- Similes - Metaphors-');
    expect(fileName('  ..hidden  ')).toBe('hidden');
    expect(fileName('')).toBe('Untitled');
  });
});
