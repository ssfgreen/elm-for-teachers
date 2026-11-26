import { describe, expect, it } from 'vitest';
import { accessErrorMessage, cleanAccessCode, cleanCode, signInErrorMessage } from './codes';

describe('cleanCode', () => {
  it('takes out spaces and line breaks, as pasted from an email', () => {
    expect(cleanCode('  ABCD-EFGH-JKMN\n')).toBe('ABCD-EFGH-JKMN');
    expect(cleanCode('ABCD EFGH\tJKMN')).toBe('ABCDEFGHJKMN');
  });

  it('keeps the case: an older invite code is case-sensitive', () => {
    expect(cleanCode('aBc_dEf-123')).toBe('aBc_dEf-123');
  });

  it('takes the code out of a pasted /join/ link', () => {
    expect(cleanCode('https://elm.example/join/ABCD-EFGH-JKMN')).toBe('ABCD-EFGH-JKMN');
    expect(cleanCode(' https://elm.example/join/ABCD%20EFGH?x=1 ')).toBe('ABCDEFGH');
  });

  it('leaves an empty field empty', () => {
    expect(cleanCode('   ')).toBe('');
  });
});

describe('cleanAccessCode', () => {
  it('shows an access code in capitals, without spaces', () => {
    expect(cleanAccessCode(' abcd efgh-jkmn ')).toBe('ABCDEFGH-JKMN');
  });
});

describe('signInErrorMessage', () => {
  it.each([
    ['cancelled', 'Sign-in was cancelled. You can try again.'],
    ['provider_error', 'Google or Microsoft did not respond. Please try again in a minute.'],
    ['failed', 'Sign-in did not complete. Please try again.'],
    ['not_allowed', 'This account has no workspace yet. Ask for an invite code, or use an access code.'],
    ['invite_unknown', 'That invite code was not recognised. Please check it.'],
    ['invite_used', 'That invite code has already been used. If it was you, just sign in.'],
    ['invite_expired', 'That invite code has expired. Please ask for a new one.'],
    ['pupil_account', 'This account signs in as a pupil. Pupils sign in on the pupil page.'],
  ])('%s', (reason, message) => {
    expect(signInErrorMessage(reason)).toBe(message);
  });

  it('says nothing without a reason, and reads an unknown one as failed', () => {
    expect(signInErrorMessage(null)).toBeNull();
    expect(signInErrorMessage('')).toBeNull();
    expect(signInErrorMessage('something_new')).toBe('Sign-in did not complete. Please try again.');
  });
});

describe('accessErrorMessage', () => {
  it('names a wrong code, too many tries, and anything else', () => {
    expect(accessErrorMessage(404)).toBe('That access code was not recognised. Please check it, or ask the person who gave it to you.');
    expect(accessErrorMessage(429)).toMatch(/wait a minute/);
    expect(accessErrorMessage(500)).toBe('The workspace could not be opened. Please try again.');
    expect(accessErrorMessage(null)).toBe('The workspace could not be opened. Please try again.');
  });
});
