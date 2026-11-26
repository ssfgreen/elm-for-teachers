/**
 * Pages for the Word preview. docx-preview draws a Word file as one `<section>` per page, but it
 * only starts a new page where the file has a page break: it does not lay text out into pages.
 * This does, the way Word would, closely enough to judge a worksheet:
 *
 *  - a block that would run past the bottom margin starts the next page;
 *  - a heading is kept with the block after it (Word's "keep with next", which our headings have);
 *  - a table that runs past the bottom is split between rows, its header row repeated (as Word
 *    does for a header row);
 *  - a single block taller than a page is left whole, running long.
 *
 * Line endings can differ slightly from Word's, since the browser wraps the text, so a page can
 * end a line or two away from where Word ends it.
 */

/** Where an element sits, in pixels; `getBoundingClientRect` in the browser, stubbed in tests. */
export type Measure = (el: Element) => { top: number; bottom: number };

const px = (v: string) => Number.parseFloat(v) || 0;

/** The height a page has for text: the page less its top and bottom margins (padding in docx-preview). */
function textHeight(page: HTMLElement): number {
  const s = getComputedStyle(page);
  return px(s.minHeight || s.height) - px(s.paddingTop) - px(s.paddingBottom);
}

const isHeading = (el: Element) => /^H[1-6]$/.test(el.tagName) || /(^|\s)\S*heading\d/i.test(el.className);

const rowsOf = (table: Element) => Array.from(table.querySelectorAll(':scope > tr, :scope > tbody > tr, :scope > thead > tr'));

/** A Word header row: drawn with `th` cells or in the Table Heading style the download uses. */
const isHeaderRow = (row: Element) => row.querySelector('th') !== null || /tableheading/i.test(row.innerHTML);

/**
 * Splits a table that runs past `limit` between rows. Returns the part for the next page, or null
 * when no row fits on this page (the table then moves whole).
 */
function splitTable(table: HTMLElement, limit: number, measure: Measure): HTMLElement | null {
  const rows = rowsOf(table);
  const first = rows.findIndex((r) => measure(r).bottom > limit);
  const header = rows[0] && isHeaderRow(rows[0]) ? rows[0] : null;
  // Nothing but the header fits: move the whole table.
  if (first <= (header ? 1 : 0)) return null;
  const rest = table.cloneNode(false) as HTMLElement;
  for (const c of Array.from(table.children)) if (c.tagName === 'COLGROUP') rest.appendChild(c.cloneNode(true));
  const body = rows[first]!.parentElement === table ? rest : rest.appendChild(rows[first]!.parentElement!.cloneNode(false));
  if (header) body.appendChild(header.cloneNode(true));
  for (const r of rows.slice(first)) body.appendChild(r);
  return rest;
}

/**
 * Lays the content of each page in `root` (docx-preview's wrapper) out into pages, adding pages
 * where it runs over. Returns the number of pages.
 */
export function paginate(root: HTMLElement, measure: Measure = (el) => el.getBoundingClientRect()): number {
  const pages = Array.from(root.children).filter((c): c is HTMLElement => c.tagName === 'SECTION');
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    const article = Array.from(page.children).find((c): c is HTMLElement => c.tagName === 'ARTICLE');
    if (!article) continue;
    const limit = measure(article).top + textHeight(page);
    const blocks = Array.from(article.children) as HTMLElement[];
    let cut = blocks.findIndex((b) => measure(b).bottom > limit + 0.5);
    if (cut < 0) continue;

    let carried: HTMLElement | null = null;
    if (blocks[cut]!.tagName === 'TABLE') {
      carried = splitTable(blocks[cut]!, limit, measure);
      if (carried) cut += 1;
    }
    // Keep headings with what follows them, unless that would leave the page empty.
    while (!carried && cut > 0 && isHeading(blocks[cut - 1]!)) cut -= 1;
    if (cut === 0 && !carried) {
      // One block taller than a page: leave it whole and look at what comes after it.
      cut = 1;
      if (blocks.length === 1) continue;
    }

    const next = page.cloneNode(false) as HTMLElement;
    const nextArticle = article.cloneNode(false) as HTMLElement;
    if (carried) nextArticle.appendChild(carried);
    for (const b of blocks.slice(cut)) nextArticle.appendChild(b);
    next.appendChild(nextArticle);
    page.after(next);
    pages.splice(i + 1, 0, next);
  }
  return pages.length;
}
