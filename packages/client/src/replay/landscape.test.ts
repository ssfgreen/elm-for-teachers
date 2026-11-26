import { describe, expect, it } from 'vitest';
import { BOTTOM_PX, landscapeHeight, landscapeOf, mapY, TOP_PX } from './landscape';
import type { Viewport } from './snapshot';

const tall: Viewport = {
  width: 1484,
  height: 1642,
  regions: {
    threads: { left: 0, top: 0, width: 200, height: 1642 },
    canvas: { left: 703, top: 0, width: 781, height: 1642 },
    comments: { left: 1184, top: 49, width: 300, height: 1593 },
  },
};

describe('landscapeHeight', () => {
  it('cuts a tall window to 16:10 of its width and leaves a landscape one alone', () => {
    expect(landscapeHeight(tall)).toBe(928);
    expect(landscapeHeight({ width: 1440, height: 698 })).toBe(698);
    expect(landscapeHeight({ width: 1492, height: 929 })).toBe(929);
  });
});

describe('mapY', () => {
  it('keeps the top band, moves the bottom band with the bottom edge and squeezes the middle', () => {
    expect(mapY(40, 1642, 928)).toBe(40);
    expect(mapY(1642 - 50, 1642, 928)).toBe(928 - 50);
    expect(mapY(TOP_PX, 1642, 928)).toBe(TOP_PX);
    expect(mapY(1642 - BOTTOM_PX, 1642, 928)).toBeCloseTo(928 - BOTTOM_PX);
    const mid = mapY(800, 1642, 928);
    expect(mid).toBeGreaterThan(TOP_PX);
    expect(mid).toBeLessThan(928 - BOTTOM_PX);
  });

  it('leaves heights alone when the window is not made shorter', () => {
    expect(mapY(600, 698, 698)).toBe(600);
  });
});

describe('landscapeOf', () => {
  it('gives every region the drawn height, keeping the comments column under the header', () => {
    const drawn = landscapeOf(tall);
    expect(drawn.height).toBe(928);
    expect(drawn.regions.threads).toEqual({ left: 0, top: 0, width: 200, height: 928 });
    expect(drawn.regions.comments).toEqual({ left: 1184, top: 49, width: 300, height: 879 });
  });

  it('returns a landscape window as it was', () => {
    const wide = { ...tall, height: 698 };
    expect(landscapeOf(wide)).toBe(wide);
  });
});
