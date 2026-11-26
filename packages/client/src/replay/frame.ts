/**
 * The stage is a fixed frame; each logged window is scaled to fit inside it and centred
 * (letterboxed), so a window that changes size changes shape inside a steady frame instead of
 * resizing the page around it.
 */

/** The frame's height for its width: 16:10, a laptop screen's shape. */
export const FRAME_ASPECT = 10 / 16;

export interface Fit {
  scale: number;
  left: number;
  top: number;
}

/** How a `w` × `h` window fits a `frameW` × `frameH` frame: as large as fits, centred. */
export function fitInFrame(frameW: number, frameH: number, w: number, h: number): Fit {
  if (frameW <= 0 || frameH <= 0 || w <= 0 || h <= 0) return { scale: 0, left: 0, top: 0 };
  const scale = Math.min(frameW / w, frameH / h);
  return { scale, left: (frameW - w * scale) / 2, top: (frameH - h * scale) / 2 };
}
