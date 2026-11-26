import { describe, expect, it } from 'vitest';
import type { ReaderPrompt } from '@edw/shared';
import { ApiError } from '../../../api/http';
import { followUpsText, parseOverride, promptLabels, refusal, ticked, toggled } from './readingView';

const p = (id: string, label = id): ReaderPrompt => ({ id, label, instruction: 'x', after_highlight: true, follow_up: false });
const library = [p('a', 'Explain'), p('b', 'Simpler'), p('c', 'Example')];

describe('reading helpers', () => {
  it('reads the override: empty is the class, else a whole number 0 to 10', () => {
    expect(parseOverride('')).toBeNull();
    expect(parseOverride('  ')).toBeNull();
    expect(parseOverride('0')).toBe(0);
    expect(parseOverride(' 10 ')).toBe(10);
    for (const bad of ['11', '-1', '2.5', 'two', '1e1']) expect(parseOverride(bad), bad).toBe('invalid');
  });

  it("keeps ticks in the library's order and drops prompts no longer in it", () => {
    expect(ticked(library, ['c', 'gone', 'a'])).toEqual(['a', 'c']);
    expect(toggled(library, ['c'], 'a')).toEqual(['a', 'c']);
    expect(toggled(library, ['a', 'c'], 'a')).toEqual(['c']);
    expect(promptLabels(library, ['c', 'a', 'gone'])).toBe('Explain, Example');
  });

  it('says the follow-up limit', () => {
    expect(followUpsText(null)).toBe('Same as the class');
    expect(followUpsText(1)).toBe('1 follow-up');
    expect(followUpsText(0)).toBe('0 follow-ups');
  });

  it('says why the server refused, and whether to reload', () => {
    const refused = (status: number, code: string) => new ApiError(status, JSON.stringify({ error: 'x', code }));
    expect(refusal(refused(409, 'class_archived'))).toEqual({ message: 'This class is archived, so it cannot have new readings.', reload: false });
    expect(refusal(refused(409, 'prompt_unavailable')).reload).toBe(true);
    expect(refusal(refused(404, 'not_found')).reload).toBe(true);
    expect(refusal(new Error('offline')).message).toBe('That change could not be saved. Please try again.');
  });
});
