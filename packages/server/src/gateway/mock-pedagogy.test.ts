import { describe, expect, it } from 'vitest';
import { mockCitation } from './mock.js';

describe('the mock in a class chat with the pedagogy library', () => {
  it('cites the first claim listed (not the example in the rules), and nothing elsewhere', () => {
    const lib = { role: 'developer', content: '## Pedagogy library\n\nCite like [[clm-ACC-example]].\n\n### Baseline format rules\n\n- **Bold** (fmt-x)\n  - [[clm-ACC-bold]] Use bold.' };
    expect(mockCitation([lib])).toBe("\n\nThe layout follows the library's baseline format rules [[clm-ACC-bold]].");
    expect(mockCitation([{ role: 'developer', content: '## This class' }])).toBe('');
  });
});
