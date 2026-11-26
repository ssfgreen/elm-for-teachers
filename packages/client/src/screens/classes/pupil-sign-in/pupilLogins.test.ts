import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../api/http';
import type { PupilLogin } from '../../../api/pupilLogins';
import { canDelete, deleteRefusal, loginCount, loginStatus, makeLabel, makeRefusal, newPasswordRefusal, showLoginsCard } from './pupilLogins';

const refused = (status: number, code: string) => new ApiError(status, JSON.stringify({ error: 'no', code }));
const login = (over: Partial<PupilLogin> = {}): PupilLogin => ({ id: 'L1', username: 'u', used: false, label: null, locked: false, ...over });

describe('the pupil logins card’s wording', () => {
  it('takes a whole number from 1 to 40', () => {
    expect(loginCount('1')).toBe(1);
    expect(loginCount(' 40 ')).toBe(40);
    for (const bad of ['', '0', '41', '2.5', '-3', 'ten', '1e1']) expect(loginCount(bad)).toBeNull();
  });

  it('names the Make button by the count', () => {
    expect(makeLabel(1)).toBe('Make 1 login');
    expect(makeLabel(12)).toBe('Make 12 logins');
    expect(makeLabel(null)).toBe('Make logins');
  });

  it('says whether a login is used, and only an unused one can be deleted', () => {
    expect(loginStatus(login())).toBe('Not used yet');
    expect(loginStatus(login({ used: true, label: 'Pupil 3' }))).toBe('Pupil 3');
    expect(canDelete(login())).toBe(true);
    expect(canDelete(login({ used: true, label: 'Pupil 3' }))).toBe(false);
  });

  it('is drawn whenever the class has logins, and when empty only while pupils can join', () => {
    expect(showLoginsCard(2, false)).toBe(true);
    expect(showLoginsCard(0, true)).toBe(true);
    expect(showLoginsCard(0, false)).toBe(false);
  });

  it('names each refusal by its code, and says to try again for anything else', () => {
    expect(makeRefusal(refused(403, 'pupils_off'))).toMatch(/cannot sign in on this site/);
    expect(makeRefusal(refused(403, 'feature_off'))).toMatch(/switched off for this workspace/);
    expect(makeRefusal(refused(409, 'class_archived'))).toMatch(/archived/);
    expect(makeRefusal(new Error('offline'))).toMatch(/Try again/);
    expect(deleteRefusal(refused(409, 'login_used'))).toMatch(/Remove the pupil under Pupils who joined instead/);
    expect(deleteRefusal(refused(404, 'not_found'))).toMatch(/no longer in this class/);
    expect(deleteRefusal(new ApiError(500, 'oops'))).toMatch(/Try again/);
    expect(newPasswordRefusal(refused(403, 'pupils_off'))).toBe('Pupils cannot sign in on this site yet, so the password was not changed.');
    expect(newPasswordRefusal(refused(403, 'feature_off'))).toBe('Pupils are switched off for this workspace, so the password was not changed.');
    expect(newPasswordRefusal(refused(409, 'class_archived'))).toBe('This class is archived, so its passwords cannot change.');
    expect(newPasswordRefusal(refused(404, 'not_found'))).toBe('That login is no longer in this class.');
    expect(newPasswordRefusal(new Error('offline'))).toBe('The new password could not be made. Try again.');
  });
});
