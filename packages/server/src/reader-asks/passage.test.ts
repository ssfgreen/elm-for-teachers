/**
 * The pupil's page and the server read a block's words the same way (#236, #247): a passage the
 * page cuts from a block's reader text (`readerBlock(b).text.slice(start, end)`) is found by
 * `checkHighlight`, for every range of every kind of block R1 draws, edge markup included. The
 * page offers asks on any passage not blank and not too long (`offered` below, the same rules as
 * client/src/reader/asks.ts `askable`), since the server now reads each block through
 * `readerBlock` too.
 */
import { describe, expect, it } from 'vitest';
import { READER_HIGHLIGHT_MAX, readerBlock, type ReadingBlock } from '@edw/shared';
import { checkHighlight } from './article.js';

const b = (id: string, type: string, content: string): ReadingBlock => ({ id, type, content });

/** Every block type R1 draws, with the inline marks the editor writes. */
const BLOCKS: ReadingBlock[] = [
  b('h1', 'heading', '# The **Romans** in *Britain*'),
  b('h3', 'heading', '### Roads and [maps](https://example.com/maps)'),
  b('p', 'paragraph', 'They built <u>straight</u> roads, with <mark>milestones</mark>, <span data-color="red">forts</span> and [maps](https://example.com/maps).'),
  b('pbreak', 'paragraph', 'One line<line/>and the next\nand a third.'),
  b('pmarks', 'paragraph', 'Some **bold *and italic* words** and `code` too.'),
  b('quote', 'quote', '> Veni, vidi, vici.\n> Julius Caesar'),
  b('code', 'code_block', '```js\nconst road = "straight";\n```'),
  b('bullet', 'bullet_item', '- Forts on the **wall**'),
  b('number', 'numbered_item', '2. Baths and [temples](https://example.com/t)'),
  b('check', 'checklist_item', '- [x] Read the map'),
  b('oldbullet', 'bullet_list', '- Roman roads\n- Hadrian’s Wall'),
  b('oldnumber', 'numbered_list', '1. First\n2. Second'),
  b('oldcheck', 'checklist', '- [ ] Draw\n- [x] Label'),
  b('table', 'table', '| Place | Built |\n| --- | --- |\n| York | 71 AD |\n| **Bath** | 60 AD |\n<!-- colwidths: 0 0 -->'),
  b('image', 'image', '![A road](asset:01J000)'),
  b('divider', 'divider', '---'),
  b('pagebreak', 'page_break', ''),
  // What the editor escapes (editor/inline.ts `escapePlain`): a backslash, a tag written as text, a "]" before an address.
  b('escaped', 'paragraph', 'A back\\\\slash, a \\<u> tag and [a\\](https://example.com) bracket.'),
  b('typo', 'paragraph', 'Soldiers’ boots — “caligae” — had nails.'),
  // Escaped marks: the page and the server drop the backslash and keep the mark.
  b('starred', 'paragraph', 'Five \\* three \\` makes fifteen.'),
  // Where the server once took off more than the page (review of #241): a marker at the start of any line, any tag, a comment, a picture.
  b('hnum', 'heading', '## 1. Introduction to Rome'),
  b('pnum', 'paragraph', '1. Read the passage below.'),
  b('pdot', 'paragraph', '• Pasted from Word'),
  b('plt', 'paragraph', 'If x<y and y>z then x is smallest.'),
  b('ptag', 'paragraph', 'a <b> tag'),
  b('qdash', 'quote', '> Veni, vidi, vici.\n> - Julius Caesar'),
  b('tnum', 'table', '| 1. Step | 2) Mix |\n| --- | --- |\n| Flour | Water |'),
  b('phash', 'paragraph', 'Line one\n# not a heading here'),
  b('pcomment', 'paragraph', 'Before <!-- a note --> after.'),
  b('ppic', 'paragraph', 'A road ![map](asset:01J001) here.'),
];

/**
 * Whether the page offers asks on a passage: the same rules as client/src/reader/asks.ts
 * `askable`, kept side by side (the server cannot import the client). Change both together.
 */
const offered = (passage: string) => passage.trim() !== '' && passage.trim().length <= READER_HIGHLIGHT_MAX;

describe('a passage from the page is in the reading for the server', () => {
  it('for every range of every block, code blocks and edge markup included', () => {
    const missed: string[] = [];
    let tried = 0;
    for (const block of BLOCKS) {
      const text = readerBlock(block).text;
      for (let start = 0; start < text.length; start++) {
        for (let end = start + 1; end <= text.length; end++) {
          const passage = text.slice(start, end);
          if (!offered(passage)) continue;
          tried += 1;
          if (!checkHighlight(BLOCKS, passage).ok) missed.push(`${block.id} ${JSON.stringify(passage)}`);
        }
      }
    }
    expect(tried).toBeGreaterThan(1000);
    expect(missed).toEqual([]);
  });

  it('the blocks the server once read differently are offered and found whole (#247)', () => {
    for (const id of ['code', 'escaped', 'hnum', 'pnum', 'pdot', 'plt', 'ptag', 'qdash', 'tnum', 'phash', 'pcomment', 'ppic']) {
      const text = readerBlock(BLOCKS.find((x) => x.id === id)!).text;
      expect(offered(text), id).toBe(true);
      expect(checkHighlight(BLOCKS, text).ok, id).toBe(true);
    }
  });

  it('an escaped * or backtick is a word the pupil sees, and is found with it', () => {
    expect(offered('* three ` makes')).toBe(true);
    expect(checkHighlight(BLOCKS, '* three ` makes')).toEqual({ ok: true, text: '* three ` makes' });
  });

  it('a whole table, read across its cells', () => {
    const text = readerBlock(BLOCKS.find((x) => x.id === 'table')!).text;
    expect(checkHighlight(BLOCKS, text)).toMatchObject({ ok: true });
  });
});
