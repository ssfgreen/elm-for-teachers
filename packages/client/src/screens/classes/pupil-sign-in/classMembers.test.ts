import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../api/http';
import { joinedCount, joinedDay, providerName, removeRefusal, showJoinedCard } from './classMembers';

describe('the joined pupils card’s wording', () => {
  it('counts, names the provider and the day', () => {
    expect(joinedCount(1)).toBe('1 pupil has joined');
    expect(joinedCount(3)).toBe('3 pupils have joined');
    expect(providerName('google')).toBe('Google');
    expect(providerName('microsoft')).toBe('Microsoft');
    expect(providerName('test')).toBe('Test');
    expect(providerName('login')).toBe('Teacher login');
    expect(joinedDay('2026-11-24')).toBe('24 Nov 2026');
    expect(joinedDay('soon')).toBe('soon');
  });

  it('says why a Remove was refused', () => {
    expect(removeRefusal(new ApiError(404, JSON.stringify({ error: 'member not found', code: 'not_found' })))).toMatch(/no longer in this class/);
    expect(removeRefusal(new ApiError(409, JSON.stringify({ error: 'that is the test pupil', code: 'test_pupil' })))).toMatch(/test pupil/);
    expect(removeRefusal(new Error('offline'))).toMatch(/Try again/);
  });

  it('is drawn whenever someone has joined, and when empty only while pupils can join', () => {
    expect(showJoinedCard(2, false)).toBe(true);
    expect(showJoinedCard(0, true)).toBe(true);
    expect(showJoinedCard(0, false)).toBe(false);
  });
});
