/**
 * Brings a place in the document to about the middle of its view, as when a card in the comments
 * column is chosen. Left alone when it is already well inside the view.
 */
export function scrollToMiddle(target: Element | null) {
  if (!target || inMiddle(target)) return;
  target.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
}

/** Within the middle three fifths of the document's pane (or the window). */
function inMiddle(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (!r.height) return false;
  const pane = el.closest('.doc-panel');
  const view = pane ? pane.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  const band = (view.bottom - view.top) / 5;
  return r.top >= view.top + band && r.bottom <= view.bottom - band;
}
