/**
 * The pupil's selection on a reading as a highlight's range (#213). The page draws each block as
 * an element with `data-block-id` and `data-len` (its reader text's length), and each piece of
 * text in a `data-at` element (where it starts in that text); a point in the page is read back
 * through them. A selection over more than one block keeps the part in the block it starts in.
 * Depends on the DOM only, not React.
 */
export interface SelectedRange {
  block_id: string;
  start: number;
  end: number;
}

/** What a DOM Range offers (a live Range, or a plain object in tests). */
export interface RangeLike {
  startContainer: Node;
  startOffset: number;
  endContainer: Node;
  endOffset: number;
}

const AT = '[data-at]';
const at = (el: Element) => Number(el.getAttribute('data-at'));
const isElement = (n: Node): n is Element => n.nodeType === 1;

/** How much text comes before `node`'s `offset` inside `piece`. */
function textBefore(piece: Element, node: Node, offset: number): number {
  const walker = piece.ownerDocument.createTreeWalker(piece, 4 /* NodeFilter.SHOW_TEXT */);
  let n = 0;
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (t === node) return n + offset;
    n += t.textContent?.length ?? 0;
  }
  return n;
}

/**
 * The piece a boundary between elements falls next to: for a start, the first piece at or after
 * it; for an end, the last piece that ends at or before it.
 */
function pieceNear(node: Node, offset: number, edge: 'start' | 'end'): Element | null {
  const doc = node.ownerDocument;
  if (!doc) return null;
  const point = doc.createRange();
  point.setStart(node, offset);
  const pieces = [...doc.querySelectorAll(`[data-reading] ${AT}`)];
  if (edge === 'start') return pieces.find((p) => point.comparePoint(p, 0) >= 0) ?? null;
  return pieces.reverse().find((p) => point.comparePoint(p, p.childNodes.length) <= 0) ?? null;
}

/** A point in the page as a block and an offset in its text; null outside the reading's text. */
function pointOf(node: Node, offset: number, edge: 'start' | 'end'): { block: Element; at: number } | null {
  let piece: Element | null;
  let n: number;
  if (!isElement(node)) {
    piece = node.parentElement?.closest(AT) ?? null;
    if (!piece) return null;
    n = at(piece) + textBefore(piece, node, offset);
  } else {
    piece = pieceNear(node, offset, edge);
    if (!piece) return null;
    n = at(piece) + (edge === 'end' ? (piece.textContent?.length ?? 0) : 0);
  }
  const block = piece.closest('[data-block-id]');
  return block ? { block, at: n } : null;
}

/** The selected range, or null when nothing of a block's text is selected. */
export function rangeFromSelection(r: RangeLike): SelectedRange | null {
  const a = pointOf(r.startContainer, r.startOffset, 'start');
  if (!a) return null;
  const len = Number(a.block.getAttribute('data-len'));
  const b = pointOf(r.endContainer, r.endOffset, 'end');
  const end = Math.min(b && b.block === a.block ? b.at : len, len);
  if (end <= a.at) return null;
  return { block_id: a.block.getAttribute('data-block-id') ?? '', start: a.at, end };
}
