import { describe, expect, it } from 'vitest';
import { fitInFrame } from './frame';

describe('fitInFrame', () => {
  it('fits a window of the frame’s shape exactly', () => {
    expect(fitInFrame(1600, 1000, 1440, 900)).toEqual({ scale: 1600 / 1440, left: 0, top: 0 });
  });

  it('centres a tall window between bars at the sides', () => {
    const fit = fitInFrame(1600, 1000, 1484, 1642);
    expect(fit.scale).toBeCloseTo(1000 / 1642);
    expect(fit.top).toBeCloseTo(0);
    expect(fit.left).toBeCloseTo((1600 - 1484 * (1000 / 1642)) / 2);
  });

  it('centres a wide, short window between bars above and below', () => {
    const fit = fitInFrame(1600, 1000, 1440, 698);
    expect(fit.left).toBeCloseTo(0);
    expect(fit.top).toBeCloseTo((1000 - 698 * (1600 / 1440)) / 2);
  });

  it('draws nothing before the frame has a size', () => {
    expect(fitInFrame(0, 0, 1440, 900)).toEqual({ scale: 0, left: 0, top: 0 });
  });
});
