import { useEffect } from 'react';

/**
 * Sets `--app-height` on the page to the visible height (the visual viewport), so a screen
 * sized with it shrinks when a phone's keyboard opens instead of going under it. Without a
 * visual viewport the variable is not set and the screen falls back to 100dvh.
 */
export function useAppHeight(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty('--app-height', `${Math.round(vv.height)}px`);
      // iOS scrolls the page up under the keyboard; the screen fits, so keep it at the top.
      if (window.scrollY) window.scrollTo(0, 0);
    };
    update();
    vv.addEventListener('resize', update);
    return () => {
      vv.removeEventListener('resize', update);
      root.style.removeProperty('--app-height');
    };
  }, []);
}
