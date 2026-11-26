/**
 * Grow a textarea with its content, from one line up to `maxPx`, then scroll. Call on
 * every value change (and once on mount); setting `height: auto` first lets it shrink.
 */
export function autoGrow(el: HTMLTextAreaElement | null, maxPx: number): void {
  if (!el) return;
  el.style.height = 'auto';
  const h = Math.min(el.scrollHeight, maxPx);
  el.style.height = `${h}px`;
  el.style.overflowY = el.scrollHeight > maxPx ? 'auto' : 'hidden';
}
