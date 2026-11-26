import { afterEach, describe, expect, it } from 'vitest';
import { DOC_ID, testBlock, testDoc } from '../test-utils';
import { fontNoticeHidden, fontsNotInWord, hideFontNotice } from './fontNotice';

const OTHER = '01JD0C0000000000000000000B';

afterEach(() => localStorage.clear());

describe('fontsNotInWord', () => {
  it('finds OpenDyslexic set for a whole doc', () => {
    const snap = { docs: [testDoc({ id: DOC_ID, style: { font: 'open_dyslexic' } })], blocks: [] };
    expect(fontsNotInWord(snap, [DOC_ID])).toEqual(['open_dyslexic']);
  });

  it('finds it on some text, but not in another doc or a suggestion not yet accepted', () => {
    const text = 'Read <span data-font="open_dyslexic">this</span>.';
    const snap = {
      docs: [testDoc({ id: DOC_ID, style: { font: 'lexend' } }), testDoc({ id: OTHER })],
      blocks: [testBlock({ id: 'B1', doc_id: OTHER, content: text }), testBlock({ id: 'B2', content: text, status: 'proposed' })],
    };
    expect(fontsNotInWord(snap, [DOC_ID])).toEqual([]);
    expect(fontsNotInWord(snap, [DOC_ID, OTHER])).toEqual(['open_dyslexic']);
  });
});

describe('hiding the notice', () => {
  it('is remembered in this browser', () => {
    expect(fontNoticeHidden()).toBe(false);
    hideFontNotice();
    expect(fontNoticeHidden()).toBe(true);
  });
});
