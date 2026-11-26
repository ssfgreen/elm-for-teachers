/**
 * What a logged point was over, found in the replay's drawing. Pointer samples and clicks say
 * which block (`block_id`) or marked item (`item`: a suggestion card, comment thread or chat
 * message, the app's `data-track`) they were over, and a click names its control. The replay
 * draws with the app's own components, which carry the same marks, so the point can be kept on
 * the thing the teacher was pointing at even where the drawing is laid out a little differently.
 */
import { controlName, nearestOf, type Box } from './calibration';

export interface Target {
  block_id: string | null;
  item: string | null;
  /** A click's control, by name without its shortcut. */
  name?: string | null;
  /** The drawn region the point is in. */
  region: string | null;
}

const NAMED = 'button, a, input, textarea, [role], [aria-label]';
const nameOf = (el: Element) => controlName(el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent?.trim() || '');

/** The on-screen part of the target, in the drawing's own pixels (before it is scaled), or null. */
export function targetBox(root: HTMLElement, target: Target, near?: { x: number; y: number }): Box | null {
  const o = root.getBoundingClientRect();
  const scale = o.width / root.offsetWidth || 1;
  const own = (r: DOMRect): Box => ({ left: (r.left - o.left) / scale, top: (r.top - o.top) / scale, width: r.width / scale, height: r.height / scale });
  const pane = target.region ? root.querySelector<HTMLElement>(`[data-region="${target.region}"]`) : null;
  if (!pane) return null;
  const item = target.item ? pane.querySelector<HTMLElement>(`[data-track="${CSS.escape(target.item)}"]`) : null;
  // An item no longer drawn (a suggestion just decided): not some other card of the same name.
  if (target.item && !item) return null;
  let el: HTMLElement | null = null;
  if (target.name) {
    const hits = [...(item ?? pane).querySelectorAll<HTMLElement>(NAMED)].filter((h) => nameOf(h) === target.name && h.getBoundingClientRect().width > 0);
    // Several of that name (the toolbar's Bold and the bubble menu's): the one clearly nearest.
    const pick = hits.length === 1 ? 0 : near ? nearestOf(hits.map((h) => own(h.getBoundingClientRect())), near) : -1;
    if (pick >= 0) el = hits[pick]!;
  }
  el ??= item ?? (target.block_id ? pane.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(target.block_id)}"]`) : null);
  if (!el) return null;
  // Only the part showing: a block scrolled out of its pane is not where the pointer was.
  const r = el.getBoundingClientRect();
  const clip = (el.parentElement?.closest('[data-scroll-root], .canvas') as HTMLElement | null) ?? pane;
  const c = clip.getBoundingClientRect();
  const left = Math.max(r.left, c.left);
  const top = Math.max(r.top, c.top);
  const right = Math.min(r.right, c.right);
  const bottom = Math.min(r.bottom, c.bottom);
  if (right <= left || bottom <= top) return null;
  return own(new DOMRect(left, top, right - left, bottom - top));
}
