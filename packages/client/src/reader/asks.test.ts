import { describe, expect, it } from 'vitest';
import { readerBlock, type PupilPrompt } from '@edw/shared';
import { askable, passageOf, promptsFor } from './asks';

const b = (type: string, content: string) => ({ id: type, type, content });
const textLength = (block: ReturnType<typeof b>) => readerBlock(block).text.length;

describe('passageOf', () => {
  it('cuts a paragraph’s words', () => {
    expect(passageOf(b('paragraph', 'Rain falls from clouds.'), 5, 10)).toBe('falls');
  });

  it('cuts a heading without its marker, bold marks or link address', () => {
    const h = b('heading', '## The **Romans** and [roads](https://example.com/roads)');
    expect(passageOf(h, 0, 21)).toBe('The Romans and roads');
  });

  it('cuts a list item without its marker', () => {
    expect(passageOf(b('bullet_item', '- Forts on the wall'), 0, 5)).toBe('Forts');
  });

  it('cuts a quote without its markers, across its lines', () => {
    expect(passageOf(b('quote', '> Veni, vidi.\n> Vici.'), 6, 17)).toBe('vidi.\nVici.');
  });

  it('cuts a table across its cells', () => {
    const t = b('table', '| Place | Built |\n| --- | --- |\n| York | 71 |');
    expect(passageOf(t, 0, 16)).toBe('Place\nBuilt\nYork');
  });
});

describe('askable', () => {
  const p = b('paragraph', 'Rain falls.');

  it('offers asks on a passage in any block', () => {
    expect(askable(p, 'Rain')).toEqual({ ok: true });
    expect(askable(p, 'x'.repeat(1000))).toEqual({ ok: true });
  });

  it('not over 1,000 characters', () => {
    expect(askable(p, 'x'.repeat(1001))).toEqual({ ok: false, why: 'too_long' });
  });

  it('not on space alone', () => {
    expect(askable(p, '')).toEqual({ ok: false, why: 'not_here' });
    expect(askable(p, '  \n ')).toEqual({ ok: false, why: 'not_here' });
  });

  it('on blocks the server once read differently (#247): a 1. heading, x<y, an escaped backslash, a code block, * and backticks', () => {
    const cases: [ReturnType<typeof b>, string][] = [
      [b('heading', '## 1. Introduction to Rome'), '1. Introduction'],
      [b('paragraph', 'If x<y and y>z then x is smallest.'), 'x<y'],
      [b('paragraph', 'A back\\\\slash'), 'back\\slash'],
      [b('code_block', '```\nlet x = 1;\n```'), 'let x'],
      [b('paragraph', 'Some `a*b` code.'), 'a*b'],
      [b('paragraph', 'Five \\* three \\` makes'), '* three `'],
    ];
    for (const [block, passage] of cases) {
      expect(passageOf(block, 0, textLength(block)).includes(passage), block.content).toBe(true);
      expect(askable(block, passage), block.content).toEqual({ ok: true });
    }
  });
});

describe('promptsFor', () => {
  const prompts: PupilPrompt[] = [
    { id: 'a', label: 'Explain', after_highlight: true, follow_up: false },
    { id: 'b', label: 'More', after_highlight: false, follow_up: true },
    { id: 'c', label: 'Both', after_highlight: true, follow_up: true },
  ];

  it('keeps the prompts ticked for the place, in the reading’s order', () => {
    expect(promptsFor(prompts, 'after_highlight').map((x) => x.id)).toEqual(['a', 'c']);
    expect(promptsFor(prompts, 'follow_up').map((x) => x.id)).toEqual(['b', 'c']);
  });
});
