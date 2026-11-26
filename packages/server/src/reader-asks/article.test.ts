/** The reading's words and the highlight check (#214). */
import { describe, expect, it } from 'vitest';
import { READER_HIGHLIGHT_MAX, readerBlock, type ReadingBlock } from '@edw/shared';
import { checkHighlight, cleanPassage, normalise, readingText } from './article.js';

const b = (type: string, content: string): ReadingBlock => ({ id: `${type}-${content.length}`, type, content });

const BLOCKS = [
  b('heading', '# The **Romans** in Britain'),
  b('paragraph', 'They built *straight* roads, with <mark>milestones</mark> and [maps](https://example.com/maps).'),
  b('image', '![A road](asset:01J000)'),
  b('bullet_item', '- Forts'),
  b('numbered_item', '2. Baths'),
  b('table', '| Place | Built |\n| --- | --- |\n| York | 71 |\n<!-- colwidths: 0 0 -->'),
  b('divider', '---'),
  b('paragraph', 'Soldiers’ boots — “caligae” — had nails.'),
];

describe('readingText', () => {
  it('keeps each block’s words without their markup, and leaves out pictures and dividers', () => {
    expect(readingText(BLOCKS)).toBe(
      ['The Romans in Britain', 'They built straight roads, with milestones and maps.', 'Forts', 'Baths', 'Place   Built\nYork   71', 'Soldiers’ boots — “caligae” — had nails.'].join('\n\n'),
    );
  });

  it('is each block’s reader text, as the pupil sees it, for markup the old reading took off (#247)', () => {
    const edges = [
      b('paragraph', 'A back\\\\slash, a \\<u> tag and [a\\](https://example.com) bracket.'),
      b('paragraph', 'Five \\* three \\` makes fifteen.'),
      b('paragraph', 'Some `a*b` code.'),
      b('heading', '## 1. Introduction to Rome'),
      b('heading', '#### Small heading'),
      b('paragraph', '1. Read the passage below.'),
      b('paragraph', '• Pasted from Word'),
      b('quote', '> Veni, vidi, vici.\n> - Julius Caesar'),
      b('paragraph', 'Line one\n# not a heading here'),
      b('paragraph', 'If x<y and y>z then x is smallest.'),
      b('paragraph', 'a <b> tag'),
      b('paragraph', 'Before <!-- a note --> after.'),
      b('paragraph', 'A road ![map](asset:01J001) here.'),
      b('code_block', '```js\nconst road = "straight";\n```'),
    ];
    for (const e of edges) expect(readingText([e]), e.content).toBe(readerBlock(e).text);
    expect(readingText(edges.slice(0, 4))).toBe(
      ['A back\\slash, a <u> tag and [a](https://example.com) bracket.', 'Five * three ` makes fifteen.', 'Some a*b code.', '1. Introduction to Rome'].join('\n\n'),
    );
    expect(readingText([edges[4]!, edges[7]!])).toBe('#### Small heading\n\nVeni, vidi, vici.\n- Julius Caesar');
  });

  it('lays a table out one row per line, its cells apart by three spaces, markers in cells kept', () => {
    expect(readingText([b('table', '| 1. Step | 2) **Mix** |\n| --- | --- |\n| Flour | Water |')])).toBe('1. Step   2) Mix\nFlour   Water');
  });

  it('gives plain paragraphs as written, a blank line between them', () => {
    expect(readingText([b('paragraph', 'Rain falls.'), b('paragraph', 'Clouds form.')])).toBe('Rain falls.\n\nClouds form.');
  });
});

describe('checkHighlight', () => {
  it('finds a passage whatever its spacing, case, quotes or dashes, across blocks, and gives it trimmed', () => {
    expect(checkHighlight(BLOCKS, '  straight roads, with milestones ')).toEqual({ ok: true, text: 'straight roads, with milestones' });
    expect(checkHighlight(BLOCKS, 'THE ROMANS IN BRITAIN They built').ok).toBe(true);
    expect(checkHighlight(BLOCKS, "Soldiers' boots - \"caligae\" - had").ok).toBe(true);
    expect(checkHighlight(BLOCKS, 'with milestones and maps').ok).toBe(true);
  });

  it('keeps and sends the passage without zero-width characters or runs of space, its * and backticks kept', () => {
    expect(cleanPassage('  straight\u200B **roads**,\n\n  with `milestones` ')).toBe('straight **roads**, with `milestones`');
    // The reading has no marks here: they are set aside to match, and kept in what is sent (#247).
    expect(checkHighlight(BLOCKS, 'straight\u200B **roads**,   with')).toEqual({ ok: true, text: 'straight **roads**, with' });
  });

  it('finds a passage with the * and backticks the pupil sees, or a lone mark', () => {
    const blocks = [b('paragraph', 'Five \\* three is `a*b` here.')];
    expect(checkHighlight(blocks, 'Five * three is a*b')).toEqual({ ok: true, text: 'Five * three is a*b' });
    expect(checkHighlight(blocks, '*')).toEqual({ ok: true, text: '*' });
    expect(checkHighlight(blocks, '`')).toEqual({ ok: false, reason: 'highlight_not_in_reading' });
  });

  it('finds a passage across a word joiner in the reading', () => {
    const blocks = [b('paragraph', 'They built straight\u2060roads.')];
    expect(checkHighlight(blocks, 'straight\u2060roads')).toEqual({ ok: true, text: 'straightroads' });
  });

  it('refuses a passage the reading does not have, an empty one, and markup the pupil never sees', () => {
    for (const text of ['They built crooked roads', '', '   ', 'https://example.com', 'asset:01J000', 'colwidths']) {
      expect(checkHighlight(BLOCKS, text)).toEqual({ ok: false, reason: 'highlight_not_in_reading' });
    }
  });

  it('refuses a passage over the limit before looking for it', () => {
    const long = Array.from({ length: 200 }, () => 'roads').join(' ');
    const blocks = [b('paragraph', long)];
    expect(checkHighlight(blocks, long.slice(0, READER_HIGHLIGHT_MAX)).ok).toBe(true);
    expect(checkHighlight(blocks, long.slice(0, READER_HIGHLIGHT_MAX + 1))).toEqual({ ok: false, reason: 'highlight_too_long' });
  });
});

describe('normalise', () => {
  it('folds typography, space and case', () => {
    expect(normalise(' A “b”—c­d\n\nE ')).toBe('a "b"-cd e');
  });
});
