import { describe, expect, it } from 'vitest';
import { paginate, type Measure } from './paginate';

/**
 * jsdom has no layout, so each block says its height (`data-h`, in pixels) and this stands in
 * for the browser: blocks sit one under another from the top of their page's text area, and a
 * table's rows one under another inside it.
 */
const heightOf = (el: Element): number => {
  if (el.tagName === 'TABLE') return Array.from(el.querySelectorAll('tr')).reduce((h, r) => h + heightOf(r), 0);
  return Number((el as HTMLElement).dataset.h ?? 0);
};
const measure: Measure = (el) => {
  if (el.tagName === 'ARTICLE') return { top: 0, bottom: 0 };
  let top = 0;
  if (el.tagName === 'TR') {
    const table = el.closest('table')!;
    top = measure(table).top;
    for (const r of Array.from(table.querySelectorAll('tr'))) {
      if (r === el) break;
      top += heightOf(r);
    }
  } else {
    for (let s = el.previousElementSibling; s; s = s.previousElementSibling) top += heightOf(s);
  }
  return { top, bottom: top + heightOf(el) };
};

/** One page 1000px tall with 100px margins top and bottom: 800px for text. */
function wrapperWith(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `<section style="min-height: 1000px; padding-top: 100px; padding-bottom: 100px"><article>${html}</article></section>`;
  return root;
}
const pagesOf = (root: HTMLElement) =>
  Array.from(root.querySelectorAll('section')).map((s) => Array.from(s.querySelector('article')!.children).map((c) => c.id || c.tagName));

describe('paginate', () => {
  it('leaves a page that fits alone', () => {
    const root = wrapperWith('<p id="a" data-h="400"></p><p id="b" data-h="400"></p>');
    expect(paginate(root, measure)).toBe(1);
    expect(pagesOf(root)).toEqual([['a', 'b']]);
  });

  it('starts a new page with the block that would run past the bottom margin, as often as needed', () => {
    const root = wrapperWith(['a', 'b', 'c', 'd', 'e'].map((id) => `<p id="${id}" data-h="350"></p>`).join(''));
    expect(paginate(root, measure)).toBe(3);
    expect(pagesOf(root)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });

  it('keeps a heading with the block after it', () => {
    const root = wrapperWith('<p id="a" data-h="600"></p><p id="h" class="docx_heading2" data-h="50"></p><p id="b" data-h="300"></p>');
    paginate(root, measure);
    expect(pagesOf(root)).toEqual([['a'], ['h', 'b']]);
  });

  it('splits a long table between rows and repeats its header row', () => {
    const rows = Array.from({ length: 12 }, (_, i) => `<tr data-h="100"><td>${i + 1}</td></tr>`).join('');
    const root = wrapperWith(`<p id="a" data-h="200"></p><table id="t"><tr data-h="50"><td><p class="docx_tableheading">No.</p></td></tr>${rows}</table>`);
    expect(paginate(root, measure)).toBe(2);
    const [first, second] = Array.from(root.querySelectorAll('table'));
    // 200 + header 50 + five rows of 100 = 750; the sixth row would end at 850.
    expect(Array.from(first!.querySelectorAll('tr')).map((r) => r.textContent)).toEqual(['No.', '1', '2', '3', '4', '5']);
    expect(Array.from(second!.querySelectorAll('tr')).map((r) => r.textContent)).toEqual(['No.', '6', '7', '8', '9', '10', '11', '12']);
  });

  it('moves a table whole when not even one row fits', () => {
    const root = wrapperWith('<p id="a" data-h="780"></p><table id="t"><tr data-h="100"><td>1</td></tr><tr data-h="100"><td>2</td></tr></table>');
    paginate(root, measure);
    expect(pagesOf(root)).toEqual([['a'], ['t']]);
    expect(root.querySelectorAll('tr')).toHaveLength(2);
  });

  it('leaves a block taller than a page whole and goes on after it', () => {
    const root = wrapperWith('<p id="big" data-h="1500"></p><p id="b" data-h="100"></p>');
    expect(paginate(root, measure)).toBe(2);
    expect(pagesOf(root)).toEqual([['big'], ['b']]);
  });

  it('lays out each page it is given, as from a page break in the file', () => {
    const root = wrapperWith('<p id="a" data-h="500"></p><p id="b" data-h="500"></p>');
    root.insertAdjacentHTML('beforeend', '<section style="min-height: 1000px; padding-top: 100px; padding-bottom: 100px"><article><p id="c" data-h="100"></p></article></section>');
    expect(paginate(root, measure)).toBe(3);
    expect(pagesOf(root)).toEqual([['a'], ['b'], ['c']]);
  });
});
