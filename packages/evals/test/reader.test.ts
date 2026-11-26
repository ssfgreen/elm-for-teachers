/** The reader eval's checks (#214). */
import { describe, expect, it } from 'vitest';
import { replyAtMost, replyDoesNotMatch } from '../src/reader-case.js';

describe('reader checks', () => {
  it('replyAtMost passes a reply within the cap, and fails an empty or long one', () => {
    expect(replyAtMost(10)('Short.').pass).toBe(true);
    expect(replyAtMost(10)('').pass).toBe(false);
    expect(replyAtMost(10)('Far too long a reply.')).toMatchObject({ pass: false, detail: '21 characters' });
  });

  it('replyDoesNotMatch names what it found', () => {
    expect(replyDoesNotMatch(/pineapple/i)('Milestones told travellers the distance.').pass).toBe(true);
    expect(replyDoesNotMatch(/pineapple/i)('PINEAPPLE')).toMatchObject({ pass: false, detail: 'found "PINEAPPLE"' });
  });
});
