import { describe, expect, it } from 'vitest';
import { codesInLinkText, mentionHref, parseMentionHref, remarkMentions, splitMentions } from './mentions';

describe('splitMentions', () => {
  it('finds pupil labels and curriculum codes, and leaves the rest as text', () => {
    expect(splitMentions('Give tidy-puffin’s overlay and read with mellow-thimble for LIT 2-13a.', ['tidy-puffin', 'mellow-thimble'])).toEqual([
      { text: 'Give ' },
      { kind: 'pupil', value: 'tidy-puffin', text: 'tidy-puffin' },
      { text: '’s overlay and read with ' },
      { kind: 'pupil', value: 'mellow-thimble', text: 'mellow-thimble' },
      { text: ' for ' },
      { kind: 'curriculum', value: 'LIT 2-13a', text: 'LIT 2-13a' },
      { text: '.' },
    ]);
  });

  it('matches a label in any case, and keeps the label as the table has it', () => {
    expect(splitMentions('Tidy-Puffin first', ['tidy-puffin'])[0]).toEqual({ kind: 'pupil', value: 'tidy-puffin', text: 'Tidy-Puffin' });
  });

  it('does not match a label inside a longer word', () => {
    expect(splitMentions('very-tidy-puffins', ['tidy-puffin'])).toEqual([{ text: 'very-tidy-puffins' }]);
  });

  it('takes the longer of two labels that start alike', () => {
    expect(splitMentions('brave-kettle-two', ['brave-kettle', 'brave-kettle-two'])[0]).toMatchObject({ value: 'brave-kettle-two' });
  });

  it('finds codes with four letters, and each code of a pair', () => {
    expect(splitMentions('ENG 2-12a / MLAN 2-02a', []).filter((p) => 'kind' in p)).toEqual([
      { kind: 'curriculum', value: 'ENG 2-12a', text: 'ENG 2-12a' },
      { kind: 'curriculum', value: 'MLAN 2-02a', text: 'MLAN 2-02a' },
    ]);
  });

  it('leaves text alone when there is nothing to find', () => {
    expect(splitMentions('No pupils here.', [])).toEqual([{ text: 'No pupils here.' }]);
  });
});

describe('codesInLinkText', () => {
  it('reads a link whose text is only codes', () => {
    expect(codesInLinkText('LIT 2-13a')).toEqual(['LIT 2-13a']);
    expect(codesInLinkText('ENG 2-12a / ENG 3-12a')).toEqual(['ENG 2-12a', 'ENG 3-12a']);
  });

  it('is null for a link with other words', () => {
    expect(codesInLinkText('Literacy and English experiences and outcomes')).toBeNull();
    expect(codesInLinkText('see LIT 2-13a here')).toBeNull();
  });
});

describe('mention links', () => {
  it('round-trips through the link the renderer sees', () => {
    expect(parseMentionHref(mentionHref('pupil', 'tidy-puffin'))).toEqual({ kind: 'pupil', value: 'tidy-puffin' });
    expect(parseMentionHref(mentionHref('curriculum', 'LIT 2-13a'))).toEqual({ kind: 'curriculum', value: 'LIT 2-13a' });
    expect(parseMentionHref('https://example.org')).toBeNull();
  });
});

describe('remarkMentions', () => {
  const text = (value: string) => ({ type: 'text', value });
  it('turns text into mention links, but not inside links or code', () => {
    const tree = {
      type: 'root',
      children: [
        { type: 'paragraph', children: [text('For tidy-puffin: '), { type: 'inlineCode', value: 'tidy-puffin' }, { type: 'link', url: 'https://x', children: [text('tidy-puffin')] }] },
      ],
    };
    remarkMentions({ labels: ['tidy-puffin'] })(tree);
    const para = tree.children[0]!.children;
    expect(para.map((n) => n.type)).toEqual(['text', 'link', 'text', 'inlineCode', 'link']);
    expect(para[1]).toMatchObject({ type: 'link', url: mentionHref('pupil', 'tidy-puffin'), children: [text('tidy-puffin')] });
    expect(para[4]).toMatchObject({ url: 'https://x' });
  });
});
