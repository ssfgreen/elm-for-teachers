import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/http';
import { ADD_FAILED, addRefusal, addedOn, isDraftsOff, isGone, withDraft, withoutDraft } from './drafts';

const refused = (status: number, code: string) => new ApiError(status, JSON.stringify({ error: 'x', code }));
const a = { id: 'd-aaaaaaaa', name: 'Fractions helper', added_at: '2026-11-22T09:00:00.000Z' };
const b = { id: 'd-bbbbbbbb', name: 'Spelling', added_at: '2026-11-22T10:00:00.000Z' };

describe('draft rules', () => {
  it('gives each refusal its own plain message', () => {
    expect(addRefusal(refused(400, 'not_the_studio'))).toMatch(/only be added from the plugin studio/);
    expect(addRefusal(refused(400, 'not_a_draft'))).toMatch(/not a draft's address/);
    expect(addRefusal(refused(400, 'not_an_address'))).toMatch(/not a web address/);
    expect(addRefusal(refused(409, 'too_many_drafts'))).toMatch(/already has 20 drafts/);
    expect(addRefusal(refused(500, 'whatever'))).toBe(ADD_FAILED);
    expect(addRefusal(new Error('offline'))).toBe(ADD_FAILED);
    expect(addRefusal(new ApiError(502, '<html>'))).toBe(ADD_FAILED);
  });

  it('knows drafts are off, and a draft already gone', () => {
    expect(isDraftsOff(refused(404, 'drafts_off'))).toBe(true);
    expect(isDraftsOff(refused(404, 'not_found'))).toBe(false);
    expect(isGone(refused(404, 'not_found'))).toBe(true);
    expect(isGone(refused(404, 'drafts_off'))).toBe(false);
  });

  it('adds a draft once and removes it', () => {
    expect(withDraft([a], b)).toEqual([a, b]);
    expect(withDraft([a, b], a)).toEqual([a, b]);
    expect(withoutDraft([a, b], a.id)).toEqual([b]);
  });

  it('writes the date it was added', () => {
    expect(addedOn(a.added_at)).toBe('22 Nov 2026');
    expect(addedOn('not a date')).toBe('');
  });
});
