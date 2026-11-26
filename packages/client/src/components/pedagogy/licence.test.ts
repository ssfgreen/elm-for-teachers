import { describe, expect, it } from 'vitest';
import { licenceLabel } from './licence';

describe('licenceLabel', () => {
  it('marks a licence not yet confirmed as unconfirmed', () => {
    for (const l of ['TODO_check', 'UNCONFIRMED: free full text via PMC', 'not confirmed (publisher page)', '', null]) expect(licenceLabel(l)).toBe('(licence unconfirmed)');
  });
  it('gives a known licence without the curator’s notes', () => {
    expect(licenceLabel('OGL v3 (stated on the page itself)')).toBe('OGL v3');
    expect(licenceLabel('all rights reserved; fetched from a course copy')).toBe('all rights reserved');
    expect(licenceLabel('CC BY 4.0')).toBe('CC BY 4.0');
  });
});
