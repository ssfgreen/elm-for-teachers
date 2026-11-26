/**
 * Measures, as the replay is watched, where named controls are drawn against where the teacher
 * clicked them (calibration.ts), and returns each region's offset. A click is measured when its
 * moment is on screen (any control), or at any moment for a control that does not move: one
 * outside a scrolling area and the bubble menu (the sidebar, the chat box, the toolbar).
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { ReplayEvent } from './bundle';
import { landscapeHeight, mapY, windowKey } from './landscape';
import { lastAtOrBefore } from './timeline';
import { controlName, offsetsOf, regionAt, type Offset, type Sample } from './calibration';
import type { Viewport } from './snapshot';

export interface NamedClick {
  t: number;
  x: number;
  y: number;
  name: string;
  /** The window it was made in (windowKey), so it is only compared with that window's drawing. */
  window: string | null;
}

/** Clicks on a control with a name, from `first` to `last`; with `landscape`, placed as drawn so. */
export function namedClicks(events: readonly ReplayEvent[], first: number, last: number, landscape = false): NamedClick[] {
  const windows = events.filter((e) => e.kind === 'viewport').map((e) => ({ t: e.t, vp: e.payload as unknown as Viewport }));
  const out: NamedClick[] = [];
  for (let i = first; i <= last; i++) {
    const e = events[i]!;
    const label = e.kind === 'click' ? ((e.payload.control as { label?: string | null } | null)?.label ?? null) : null;
    if (!label || typeof e.payload.x !== 'number' || typeof e.payload.y !== 'number') continue;
    const vp = windows[lastAtOrBefore(windows, e.t)]?.vp ?? null;
    const y = landscape && vp ? mapY(e.payload.y, vp.height, landscapeHeight(vp)) : e.payload.y;
    out.push({ t: e.t, x: e.payload.x, y, name: controlName(label), window: windowKey(vp) });
  }
  return out;
}

/** Within this of a click, the drawing shows that moment and any control can be measured. */
const AT_CLICK_MS = 400;
const EVERY_MS = 250;
const MOVES = '[data-scroll-root], .canvas, .bubble-menu';
const nameOf = (el: Element) => controlName(el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent?.trim() || '');

/**
 * `viewport` is the window as drawn, `window` the logged one's windowKey: only clicks made in
 * that window are measured, and the offsets are its own.
 */
export function useCalibration(root: RefObject<HTMLElement>, clicks: readonly NamedClick[], viewport: Viewport | null, window: string | null, t: number): { offsets: Record<string, Offset>; samples: number } {
  const [samples, setSamples] = useState<Map<number, Sample & { window: string | null }>>(() => new Map());
  const lastRun = useRef(0);
  useEffect(() => setSamples(new Map()), [clicks]);

  useEffect(() => {
    const el = root.current;
    const now = performance.now();
    if (!el || !viewport || now - lastRun.current < EVERY_MS) return;
    lastRun.current = now;
    const scale = el.getBoundingClientRect().width / el.offsetWidth || 1;
    const origin = el.getBoundingClientRect();
    const found = new Map<number, Sample & { window: string | null }>();
    clicks.forEach((c, i) => {
      if (samples.has(i) || c.window !== window) return;
      const region = regionAt(viewport, c.x, c.y);
      const pane = region ? el.querySelector(`[data-region="${region}"]`) : null;
      if (!region || !pane) return;
      const atClick = Math.abs(t - c.t) < AT_CLICK_MS;
      const hits = [...pane.querySelectorAll('button, a, input, textarea, [role], [aria-label]')].filter((h) => nameOf(h) === c.name && h.getBoundingClientRect().width > 0);
      if (hits.length !== 1) return;
      const hit = hits[0]!;
      if (!atClick && hit.closest(MOVES)) return;
      const r = hit.getBoundingClientRect();
      found.set(i, { window: c.window, region, dx: c.x - (r.left + r.width / 2 - origin.left) / scale, dy: c.y - (r.top + r.height / 2 - origin.top) / scale });
    });
    if (found.size) setSamples((cur) => new Map([...cur, ...found]));
  }, [root, viewport, window, clicks, samples, t]);

  const offsets = useMemo(() => offsetsOf([...samples.values()].filter((s) => s.window === window)), [samples, window]);
  return { offsets, samples: samples.size };
}
