import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../api/http';
import { pupilAddress, refusalMessage, siteAddress } from './classCode';

const refused = (status: number, code: string) => new ApiError(status, JSON.stringify({ error: 'no', code }));

describe('refusalMessage', () => {
  it('names each refusal the code routes give', () => {
    expect(refusalMessage(refused(403, 'pupils_off'))).toMatch(/cannot sign in on this site/);
    expect(refusalMessage(refused(403, 'feature_off'))).toMatch(/switched off for this workspace/);
    expect(refusalMessage(refused(409, 'class_archived'))).toMatch(/archived/);
  });

  it('says to try again for anything else', () => {
    expect(refusalMessage(new Error('network'))).toBe('The code could not be changed. Try again.');
    expect(refusalMessage(new ApiError(500, 'oops'))).toBe('The code could not be changed. Try again.');
  });
});

describe('pupilAddress', () => {
  it('is the site without its scheme, then /r/join', () => {
    expect(pupilAddress('https://edw.example.org')).toBe('edw.example.org/r/join');
    expect(pupilAddress('http://localhost:5173/')).toBe('localhost:5173/r/join');
  });
});

describe('siteAddress', () => {
  it('is the site without its scheme or a trailing slash', () => {
    expect(siteAddress('https://edw.example.org')).toBe('edw.example.org');
    expect(siteAddress('http://localhost:5173/')).toBe('localhost:5173');
  });
});
