import { describe, expect, it } from 'vitest';
import { checkDraftAddress, newDraftId } from './address.js';

const origins = ['https://studio.example', 'http://localhost:3000'];

describe('checkDraftAddress', () => {
  it('takes a draft address at an allowed studio, in one form', () => {
    expect(checkDraftAddress(' https://studio.example/d/Abc_123-xyz/ ', origins)).toEqual({ address: 'https://studio.example/d/Abc_123-xyz' });
    expect(checkDraftAddress('http://localhost:3000/d/abcdefgh', origins)).toEqual({ address: 'http://localhost:3000/d/abcdefgh' });
  });

  it('refuses an address off the allow-list, or that is not a draft', () => {
    expect(checkDraftAddress('https://evil.example/d/abcdefgh', origins)).toEqual({ problem: 'not_the_studio' });
    expect(checkDraftAddress('http://studio.example/d/abcdefgh', origins)).toEqual({ problem: 'not_the_studio' });
    expect(checkDraftAddress('https://studio.example.evil.example/d/abcdefgh', origins)).toEqual({ problem: 'not_the_studio' });
    expect(checkDraftAddress('https://studio.example/p/abcdefgh', origins)).toEqual({ problem: 'not_a_draft' });
    expect(checkDraftAddress('https://studio.example/d/abcdefgh?x=1', origins)).toEqual({ problem: 'not_a_draft' });
    expect(checkDraftAddress('https://me:pw@studio.example/d/abcdefgh', origins)).toEqual({ problem: 'not_a_draft' });
    expect(checkDraftAddress('https://studio.example/d/../admin', origins)).toEqual({ problem: 'not_a_draft' });
    expect(checkDraftAddress('studio.example/d/abcdefgh', origins)).toEqual({ problem: 'not_an_address' });
    expect(checkDraftAddress('https://studio.example/d/abcdefgh', [])).toEqual({ problem: 'not_the_studio' });
  });

  it('gives short random ids', () => {
    const a = newDraftId();
    expect(a).toMatch(/^d-[a-z2-9]{8}$/);
    expect(newDraftId()).not.toBe(a);
  });
});
