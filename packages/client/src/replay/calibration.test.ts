import { describe, expect, it } from 'vitest';
import { clampInto, controlName, nearestOf, MAX_SHIFT_PX, offsetsOf, regionAt, shifted } from './calibration';
import type { Viewport } from './snapshot';

const vp: Viewport = {
  width: 1440,
  height: 760,
  regions: {
    threads: { left: 0, top: 0, width: 260, height: 760 },
    chat: { left: 261, top: 0, width: 400, height: 760 },
    canvas: { left: 662, top: 0, width: 778, height: 760 },
    comments: { left: 1140, top: 49, width: 300, height: 711 },
  },
};

describe('offsetsOf', () => {
  it('takes each region’s median, so one stray click does not pull it', () => {
    const o = offsetsOf([
      { region: 'chat', dx: 4, dy: 10 },
      { region: 'chat', dx: 6, dy: 11 },
      { region: 'chat', dx: 70, dy: -60 },
    ]);
    expect(o.chat).toEqual({ dx: 6, dy: 10, n: 3 });
  });

  it('leaves a region with one click alone, ignores far-off samples and caps the shift', () => {
    const o = offsetsOf([
      { region: 'threads', dx: 3, dy: 3 },
      { region: 'canvas', dx: 200, dy: 0 },
      { region: 'canvas', dx: 200, dy: 0 },
      { region: 'chat', dx: 60, dy: 0 },
      { region: 'chat', dx: 60, dy: 0 },
    ]);
    expect(o.threads).toBeUndefined();
    expect(o.canvas).toBeUndefined();
    expect(o.chat?.dx).toBe(MAX_SHIFT_PX);
  });
});

describe('controlName', () => {
  it('drops a keyboard shortcut, Mac or not, and keeps other brackets', () => {
    expect(controlName('Bold (⌘B)')).toBe('Bold');
    expect(controlName('Bold (Ctrl+B)')).toBe('Bold');
    expect(controlName('Bulleted list (⌘⇧8)')).toBe('Bulleted list');
    expect(controlName('Similes and Metaphors Homework (copy)')).toBe('Similes and Metaphors Homework (copy)');
  });
});

describe('placing points', () => {
  it('finds the drawn region, counting the comments column as the document’s', () => {
    expect(regionAt(vp, 100, 100)).toBe('threads');
    expect(regionAt(vp, 1200, 300)).toBe('canvas');
    expect(regionAt(null, 1, 1)).toBeNull();
  });

  it('shifts a point by its region’s offset and leaves others as logged', () => {
    const offsets = { chat: { dx: 5, dy: 10, n: 4 } };
    expect(shifted(offsets, vp, 300, 600)).toEqual({ x: 295, y: 590 });
    expect(shifted(offsets, vp, 100, 600)).toEqual({ x: 100, y: 600 });
  });
});

describe('clampInto', () => {
  const box = { left: 100, top: 200, width: 80, height: 30 };
  it('leaves a point already inside, and moves one outside just inside the nearest edge', () => {
    expect(clampInto({ x: 120, y: 210 }, box)).toEqual({ x: 120, y: 210 });
    expect(clampInto({ x: 90, y: 260 }, box)).toEqual({ x: 104, y: 226 });
  });
  it('goes to the middle of a box smaller than the margins', () => {
    expect(clampInto({ x: 0, y: 0 }, { left: 10, top: 10, width: 4, height: 2 })).toEqual({ x: 12, y: 11 });
  });
});

describe('nearestOf', () => {
  const toolbar = { left: 100, top: 50, width: 30, height: 30 };
  const bubble = { left: 300, top: 200, width: 30, height: 30 };
  it('takes the control clearly nearest the click', () => {
    expect(nearestOf([toolbar, bubble], { x: 310, y: 190 })).toBe(1);
    expect(nearestOf([toolbar, bubble], { x: 115, y: 65 })).toBe(0);
  });
  it('takes none when both are about as near, or both far', () => {
    expect(nearestOf([toolbar, bubble], { x: 215, y: 140 })).toBe(-1);
    expect(nearestOf([toolbar], { x: 600, y: 600 })).toBe(-1);
  });
});
