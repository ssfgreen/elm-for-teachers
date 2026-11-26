/**
 * Lining the logged pointer up with the replay's drawing. Each click on a named control says
 * where that control was on the teacher's screen; the replay finds the same control in its own
 * drawing, and the difference, per region, is how far its drawing is off there. The pointer and
 * clicks are then drawn shifted by it, so they land on what the teacher pointed at.
 */
import type { Viewport } from './snapshot';

export interface Sample {
  region: string;
  /** Logged position minus where the replay draws the control's centre. */
  dx: number;
  dy: number;
}
export interface Offset {
  dx: number;
  dy: number;
  n: number;
}

/** Fewer samples than this in a region and it is left as logged. */
export const MIN_SAMPLES = 2;
/** A larger difference is a different control or state, not a misdrawn one. */
export const MAX_SAMPLE_PX = 80;
/** The most a region is ever shifted. */
export const MAX_SHIFT_PX = 40;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};
const clamp = (v: number) => Math.max(-MAX_SHIFT_PX, Math.min(MAX_SHIFT_PX, v));

/** Each region's offset: the median of its samples, which a stray sample cannot pull far. */
export function offsetsOf(samples: readonly Sample[]): Record<string, Offset> {
  const by = new Map<string, Sample[]>();
  for (const s of samples) {
    if (Math.abs(s.dx) > MAX_SAMPLE_PX || Math.abs(s.dy) > MAX_SAMPLE_PX) continue;
    by.set(s.region, [...(by.get(s.region) ?? []), s]);
  }
  const out: Record<string, Offset> = {};
  for (const [region, list] of by) {
    if (list.length < MIN_SAMPLES) continue;
    out[region] = { dx: clamp(median(list.map((s) => s.dx))), dy: clamp(median(list.map((s) => s.dy))), n: list.length };
  }
  return out;
}

/** A control's name without its keyboard shortcut, which differs between Mac and the rest. */
export function controlName(label: string): string {
  return label.replace(/\s*\([^()]*(?:⌘|Ctrl|⌥|⇧|Alt\+|Shift\+)[^()]*\)\s*$/, '').trim();
}

/** The drawn region a point is in. The comments column is drawn inside the document's region. */
export function regionAt(vp: Viewport | null, x: number, y: number): string | null {
  if (!vp) return null;
  let found: string | null = null;
  for (const [name, r] of Object.entries(vp.regions)) {
    if (name === 'comments') continue;
    if (x >= r.left && x < r.left + r.width && y >= r.top && y < r.top + r.height) found = name;
  }
  return found;
}

/** Where to draw a logged point: shifted by its region's offset. */
export function shifted(offsets: Record<string, Offset>, vp: Viewport | null, x: number, y: number): { x: number; y: number } {
  const o = offsets[regionAt(vp, x, y) ?? ''];
  return o ? { x: x - o.dx, y: y - o.dy } : { x, y };
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A point moved the least way into a box, `margin` inside its edges (or to its middle, if smaller). */
export function clampInto(p: { x: number; y: number }, box: Box, margin = 4): { x: number; y: number } {
  const axis = (v: number, start: number, size: number) => {
    const m = Math.min(margin, size / 2);
    return Math.max(start + m, Math.min(start + size - m, v));
  };
  return { x: axis(p.x, box.left, box.width), y: axis(p.y, box.top, box.height) };
}

/** Nearer than this, and half as far as the next, and a control of the same name is the one meant. */
export const NEAREST_PX = 80;

/** Which of several same-named controls a point means: the nearest, if clearly so; else -1. */
export function nearestOf(boxes: readonly Box[], p: { x: number; y: number }): number {
  const dist = (b: Box) => Math.hypot(Math.max(b.left - p.x, 0, p.x - b.left - b.width), Math.max(b.top - p.y, 0, p.y - b.top - b.height));
  const ds = boxes.map(dist);
  const order = ds.map((d, i) => [d, i] as const).sort((a, b) => a[0] - b[0]);
  const [first, second] = order;
  if (!first || first[0] > NEAREST_PX) return -1;
  if (second && second[0] < Math.max(2 * first[0], 20)) return -1;
  return first[1];
}
