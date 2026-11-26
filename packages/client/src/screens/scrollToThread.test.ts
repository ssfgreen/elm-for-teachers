/** Choosing a thread in the comments column brings its text to about the middle of the document. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollToThread } from './useDocComments';

afterEach(() => {
  document.body.innerHTML = '';
});

function page(withMark: boolean) {
  document.body.innerHTML = `<section class="doc-panel"><div data-block-id="B1"><p>Some ${withMark ? '<span data-comment-id="C1">marked</span>' : 'plain'} text</p></div></section>`;
  const scroll = vi.fn();
  for (const el of document.querySelectorAll('[data-block-id], [data-comment-id]')) (el as HTMLElement).scrollIntoView = scroll;
  return scroll;
}

const rect = (top: number, bottom: number) => ({ top, bottom, height: bottom - top, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

describe('scrollToThread', () => {
  it('centres the highlighted text, not just its block', () => {
    const scroll = page(true);
    scrollToThread({ id: 'C1', block_id: 'B1' });
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(document.querySelector('[data-comment-id="C1"]'));
    expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
  });

  it('falls back to the block when the quote is no longer marked', () => {
    const scroll = page(false);
    scrollToThread({ id: 'C1', block_id: 'B1' });
    expect(scroll.mock.contexts[0]).toBe(document.querySelector('[data-block-id="B1"]'));
  });

  it('leaves the document where it is when the text is already in the middle of the view', () => {
    const scroll = page(true);
    (document.querySelector('.doc-panel') as HTMLElement).getBoundingClientRect = () => rect(0, 1000);
    const mark = document.querySelector('[data-comment-id="C1"]') as HTMLElement;
    mark.getBoundingClientRect = () => rect(480, 500);
    scrollToThread({ id: 'C1', block_id: 'B1' });
    expect(scroll).not.toHaveBeenCalled();
    mark.getBoundingClientRect = () => rect(950, 970);
    scrollToThread({ id: 'C1', block_id: 'B1' });
    expect(scroll).toHaveBeenCalledTimes(1);
  });
});
