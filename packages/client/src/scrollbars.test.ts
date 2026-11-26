import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HIDE_AFTER_MS, SCROLLING_CLASS, installScrollbarReveal } from './scrollbars';

let off: () => void;
beforeEach(() => {
  vi.useFakeTimers();
  off = installScrollbarReveal();
});
afterEach(() => {
  off();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('installScrollbarReveal', () => {
  it('marks a pane while it scrolls and clears the mark once scrolling stops', () => {
    const pane = document.createElement('div');
    document.body.appendChild(pane);
    pane.dispatchEvent(new Event('scroll'));
    expect(pane.classList.contains(SCROLLING_CLASS)).toBe(true);
    vi.advanceTimersByTime(HIDE_AFTER_MS - 100);
    pane.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(HIDE_AFTER_MS - 100);
    expect(pane.classList.contains(SCROLLING_CLASS)).toBe(true);
    vi.advanceTimersByTime(200);
    expect(pane.classList.contains(SCROLLING_CLASS)).toBe(false);
  });
});
