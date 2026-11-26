/**
 * `viewport`: the window's size and where each region is (`data-pane` threads, canvas, chat,
 * and `data-region` comments), on start, on resize and when a region changes size. A hidden
 * region is left out. Nothing is logged when the layout is as last logged.
 */
import type { PayloadOfKind } from '@edw/shared';
import type { EventLogger } from '../logger';

type Viewport = PayloadOfKind<'viewport'>;

export function readViewport(win: Window): Viewport {
  const regions: Viewport['regions'] = {};
  for (const el of win.document.querySelectorAll('[data-pane], [data-region]')) {
    const name = el.getAttribute('data-region') ?? el.getAttribute('data-pane');
    const r = el.getBoundingClientRect();
    if (!name || r.width === 0 || r.height === 0) continue;
    regions[name] = { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
  }
  return { width: win.innerWidth, height: win.innerHeight, device_pixel_ratio: win.devicePixelRatio || 1, regions };
}

export function attachViewportTracking(logger: Pick<EventLogger, 'log'>, win: Window, root: HTMLElement, waitMs = 500): () => void {
  let last = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  const log = () => {
    timer = null;
    const v = readViewport(win);
    const key = JSON.stringify(v);
    if (key === last) return;
    last = key;
    logger.log('viewport', v);
  };
  const later = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(log, waitMs);
  };
  log();
  win.addEventListener('resize', later);
  // A pane dragged or a column opened changes the regions inside the screen, not the window.
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(later);
  const observe = () => root.querySelectorAll('[data-pane], [data-region]').forEach((el) => observer?.observe(el));
  observer?.observe(root);
  observe();
  // Regions come and go (the comments column): observe new ones as they appear.
  const mutations = typeof MutationObserver === 'undefined' || !observer ? null : new MutationObserver(() => observe());
  mutations?.observe(root, { childList: true, subtree: true });
  return () => {
    if (timer !== null) clearTimeout(timer);
    win.removeEventListener('resize', later);
    observer?.disconnect();
    mutations?.disconnect();
  };
}
