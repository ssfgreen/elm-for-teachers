/**
 * Drawing a tall window as a landscape one (the replay's default): it keeps its logged width and
 * is cut down to 16:10. A logged height is moved as the app's layout moves when a window gets
 * shorter: the top band (the headers and toolbar) stays where it was, the bottom band (the chat
 * box, pinned to the foot) moves up with the bottom edge, and the scrolling middle is squeezed.
 * A window already landscape is drawn as logged.
 */
import type { Snapshot, Viewport } from './snapshot';

export const LANDSCAPE = 10 / 16;
/** The bands of the app that stay put against the top and against the bottom. */
export const TOP_PX = 120;
export const BOTTOM_PX = 180;

/** The height a window is drawn at: its own, or 16:10 of its width if it was taller. */
export const landscapeHeight = (vp: Pick<Viewport, 'width' | 'height'>) => Math.min(vp.height, Math.round(vp.width * LANDSCAPE));

/** A height in a window `from` tall, as drawn in one `to` tall. */
export function mapY(y: number, from: number, to: number): number {
  if (to >= from) return y;
  if (y <= TOP_PX) return y;
  if (y >= from - BOTTOM_PX) return y - (from - to);
  const middle = from - TOP_PX - BOTTOM_PX;
  return TOP_PX + ((y - TOP_PX) * (to - TOP_PX - BOTTOM_PX)) / middle;
}

/** The window as drawn: the same regions, their heights mapped. */
export function landscapeOf(vp: Viewport): Viewport {
  const height = landscapeHeight(vp);
  if (height === vp.height) return vp;
  const regions: Viewport['regions'] = {};
  for (const [name, r] of Object.entries(vp.regions)) {
    const top = mapY(r.top, vp.height, height);
    regions[name] = { ...r, top, height: mapY(r.top + r.height, vp.height, height) - top };
  }
  return { ...vp, height, regions };
}

/** The snapshot as drawn: its window landscape, and the pointer's and clicks' heights mapped. */
export function drawnSnapshot(snap: Snapshot): Snapshot {
  const vp = snap.viewport;
  if (!vp) return snap;
  const drawn = landscapeOf(vp);
  if (drawn === vp) return snap;
  const y = (v: number) => mapY(v, vp.height, drawn.height);
  return {
    ...snap,
    viewport: drawn,
    pointer: snap.pointer ? { ...snap.pointer, y: y(snap.pointer.y) } : null,
    clicks: snap.clicks.map((c) => ({ ...c, y: y(c.y) })),
    upcoming: snap.upcoming.map((c) => ({ ...c, y: y(c.y) })),
  };
}

/** A name for a window size, to compare clicks made in the same one. */
export const windowKey = (vp: Pick<Viewport, 'width' | 'height'> | null) => (vp ? `${vp.width}x${vp.height}` : null);
