import { describe, expect, it } from 'vitest';
import { pupilErrorMessage } from './messages';

/** Every code in the server's LOGIN_STATUS (server/src/pupils/login-routes.ts, with JOIN_STATUS), written out. */
const LOGIN_CODES = [
  'code_unknown',
  'too_many_codes',
  'class_archived',
  'pupils_off',
  'feature_off',
  'login_wrong',
  'login_locked',
  'code_other_class',
  'code_needed',
  'teacher_account',
  'login_taken',
];

describe('pupilErrorMessage', () => {
  it('has words for each reason the server sends, and reads an unknown one as failed', () => {
    expect(pupilErrorMessage(null)).toBeNull();
    expect(pupilErrorMessage('teacher_account')).toMatch(/teacher page/);
    expect(pupilErrorMessage('pupils_off')).toMatch(/switched off/);
    expect(pupilErrorMessage('test_pupil')).toMatch(/test pupil stays in its own class/);
    expect(pupilErrorMessage('something')).toBe(pupilErrorMessage('failed'));
  });

  it('has its own words for every refusal of a teacher’s login', () => {
    for (const code of LOGIN_CODES) expect(pupilErrorMessage(code), code).not.toBe(pupilErrorMessage('failed'));
    expect(pupilErrorMessage('login_wrong')).toBe('That username and password do not match. Check your slip and try again.');
    expect(pupilErrorMessage('login_locked')).toBe('Too many wrong passwords. Ask your teacher for a new password.');
    expect(pupilErrorMessage('code_other_class')).toBe('That code is for a different class. Check it with your teacher.');
    expect(pupilErrorMessage('login_taken')).toBe('That login is already in use. Ask your teacher.');
  });
});
