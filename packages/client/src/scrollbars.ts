/**
 * Scrollbars appear only while a pane scrolls (and for a moment after), like macOS overlay
 * scrollbars: each scrolling element gets the `is-scrolling` class, which styles/base.css uses
 * to show the thumb. Scroll events do not bubble, so one capturing listener covers every pane.
 */
export const SCROLLING_CLASS = 'is-scrolling';
export const HIDE_AFTER_MS = 800;

export function installScrollbarReveal(doc: Document = document): () => void {
  const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
  const onScroll = (e: Event) => {
    const el = e.target instanceof Element ? e.target : doc.documentElement;
    el.classList.add(SCROLLING_CLASS);
    clearTimeout(timers.get(el));
    timers.set(
      el,
      setTimeout(() => el.classList.remove(SCROLLING_CLASS), HIDE_AFTER_MS),
    );
  };
  doc.addEventListener('scroll', onScroll, { capture: true, passive: true });
  return () => doc.removeEventListener('scroll', onScroll, { capture: true });
}
