import { describe, expect, it } from 'vitest';
import { decideCommit, formatPounds, parseFollowUps, parsePounds } from './readerSettings';

describe('parsePounds', () => {
  it('reads pounds and pence written in the usual ways', () => {
    expect(parsePounds('0.5')).toBe(0.5);
    expect(parsePounds('£0.50')).toBe(0.5);
    expect(parsePounds('50p')).toBe(0.5);
    expect(parsePounds(' 50 P ')).toBe(0.5);
    expect(parsePounds('£1')).toBe(1);
    expect(parsePounds('1.2')).toBe(1.2);
    expect(parsePounds('.75')).toBe(0.75);
    expect(parsePounds('7p')).toBe(0.07);
    expect(parsePounds('0')).toBe(0);
    expect(parsePounds('£5.00')).toBe(5);
    expect(parsePounds('500p')).toBe(5);
  });

  it('is null for a blank box, so the default comes back', () => {
    expect(parsePounds('')).toBeNull();
    expect(parsePounds('   ')).toBeNull();
  });

  it('refuses what is not a sum in limits, to the penny', () => {
    for (const t of ['£5.01', '501p', '0.505', '-1', '£', 'p', 'fifty', '1,50', '£0.5p', '0.5.0', '1e1']) expect(parsePounds(t)).toBe('invalid');
  });
});

describe('parseFollowUps', () => {
  it('reads whole numbers from 0 to 10', () => {
    expect(parseFollowUps('0')).toBe(0);
    expect(parseFollowUps(' 3 ')).toBe(3);
    expect(parseFollowUps('10')).toBe(10);
    expect(parseFollowUps('')).toBeNull();
    for (const t of ['11', '-1', '1.5', 'three', '2x']) expect(parseFollowUps(t)).toBe('invalid');
  });
});

describe('formatPounds', () => {
  it('shows pence when there are any', () => {
    expect(formatPounds(0.5)).toBe('£0.50');
    expect(formatPounds(2)).toBe('£2');
    expect(formatPounds(1.25)).toBe('£1.25');
  });
});

describe('decideCommit', () => {
  it('does nothing for the shown text, and puts the default back for an empty box already at the default', () => {
    expect(decideCommit(' £0.50 ', '£0.50', true, parsePounds)).toEqual({ kind: 'none' });
    expect(decideCommit('', '£0.50', true, parsePounds)).toEqual({ kind: 'reset' });
  });

  it('saves a value, or null for an empty box that was set', () => {
    expect(decideCommit('75p', '£0.50', true, parsePounds)).toEqual({ kind: 'save', value: 0.75 });
    expect(decideCommit('', '£0.75', false, parsePounds)).toEqual({ kind: 'save', value: null });
    expect(decideCommit('0', '3', true, parseFollowUps)).toEqual({ kind: 'save', value: 0 });
  });

  it('only tidies the box when the value typed is the one already set', () => {
    expect(decideCommit('75p', '£0.75', false, parsePounds)).toEqual({ kind: 'reset' });
    expect(decideCommit('03', '3', false, parseFollowUps)).toEqual({ kind: 'reset' });
    // At the default, typing the same value sets it, so it stops following config.
    expect(decideCommit('03', '3', true, parseFollowUps)).toEqual({ kind: 'save', value: 3 });
  });

  it('refuses what does not parse', () => {
    expect(decideCommit('£9', '£0.50', true, parsePounds)).toEqual({ kind: 'invalid' });
  });
});
