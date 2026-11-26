import { describe, expect, it } from 'vitest';
import { READER_ASK_REFUSALS } from '@edw/shared';
import { ASK_REFUSED, askRefusal, REFUSED } from './messages';

describe('askRefusal', () => {
  it('has words for every ask refusal the server gives', () => {
    for (const code of READER_ASK_REFUSALS) expect(ASK_REFUSED[code], code).toBeTruthy();
    expect(askRefusal('follow_ups_used')).toBe('No more follow-ups on this answer.');
    expect(askRefusal('prompt_not_offered')).toBe('That button has changed. Reload the page to see the new ones.');
    expect(askRefusal('highlight_not_in_reading')).toBe('That part cannot be asked about. Try selecting less.');
    expect(askRefusal('no_zero_retention')).toBe('Asking is not ready here yet. Please ask your teacher.');
    expect(askRefusal('provider_error')).toBe('The helper could not answer just now. Please try again.');
  });

  it('gives the server’s own words when a budget is spent', () => {
    expect(askRefusal('pupil_budget_spent')).toBe('You have used all the help you can ask for in this class. Please ask your teacher.');
    expect(askRefusal('budget_spent')).toBe('Your teacher’s helper has used all of its budget. Please ask your teacher.');
  });

  it('keeps R1’s words for the membership codes', () => {
    for (const code of Object.keys(REFUSED)) expect(askRefusal(code)).toBe(REFUSED[code]);
    expect(askRefusal('class_archived')).toBe('This class has finished, so its readings are closed.');
  });

  it('gives general words for anything else', () => {
    expect(askRefusal('something_new')).toBe('That did not work. Please try again.');
    expect(askRefusal(null)).toBe('That did not work. Please try again.');
  });
});
