import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { Highlight, ReadingBlock } from '@edw/shared';
import { ReadingBlocks } from './ReadingBlocks';
import { rangeFromSelection } from './selection';

const BLOCKS: ReadingBlock[] = [
  { id: 'h', type: 'heading', content: '## The **water** cycle' },
  { id: 'p', type: 'paragraph', content: 'Rain falls from clouds.' },
  { id: 't', type: 'table', content: '| Name | Age |\n| --- | --- |\n| Ann | 9 |' },
];

function draw(highlights: Highlight[] = []) {
  const { container } = render(
    <MemoryRouter>
      <article data-reading>
        <ReadingBlocks readingId="r1" blocks={BLOCKS} highlights={highlights} onPick={() => {}} />
      </article>
    </MemoryRouter>,
  );
  return container;
}

/** The text node holding `text` (the first). */
function textNode(root: Element, text: string): Text {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.textContent?.includes(text)) return n as Text;
  throw new Error(`no text ${text}`);
}

afterEach(cleanup);

describe('rangeFromSelection', () => {
  it('reads a selection inside a block as offsets in its reader text, across marks', () => {
    const c = draw();
    const the = textNode(c, 'The ');
    const cycle = textNode(c, ' cycle');
    // "e water c": from in "The " to in " cycle".
    expect(rangeFromSelection({ startContainer: the, startOffset: 2, endContainer: cycle, endOffset: 2 })).toEqual({ block_id: 'h', start: 2, end: 11 });
  });

  it('keeps the part in the first block of a selection over two', () => {
    const c = draw();
    expect(rangeFromSelection({ startContainer: textNode(c, 'Rain'), startOffset: 5, endContainer: textNode(c, 'Ann'), endOffset: 2 })).toEqual({ block_id: 'p', start: 5, end: 23 });
  });

  it('reads a boundary between elements, as a triple click gives', () => {
    const c = draw();
    const p = c.querySelector('[data-block-id="p"]')!;
    const next = c.querySelector('[data-block-id="t"]')!;
    expect(rangeFromSelection({ startContainer: p, startOffset: 0, endContainer: next, endOffset: 0 })).toEqual({ block_id: 'p', start: 0, end: 23 });
  });

  it('counts table cells in the block’s text, and nothing for an empty selection', () => {
    const c = draw();
    const ann = textNode(c, 'Ann');
    expect(rangeFromSelection({ startContainer: ann, startOffset: 0, endContainer: ann, endOffset: 3 })).toEqual({ block_id: 't', start: 9, end: 12 });
    expect(rangeFromSelection({ startContainer: ann, startOffset: 1, endContainer: ann, endOffset: 1 })).toBeNull();
  });

  it('reads offsets the same with a highlight drawn in the block', () => {
    const c = draw([{ id: 'x', block_id: 'p', start: 0, end: 4, category: 'dont_understand', created_at: '2026-11-23T09:00:00.000Z' }]);
    const falls = textNode(c, ' falls');
    expect(rangeFromSelection({ startContainer: falls, startOffset: 1, endContainer: falls, endOffset: 6 })).toEqual({ block_id: 'p', start: 5, end: 10 });
  });
});
