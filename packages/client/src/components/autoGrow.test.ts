import { describe, expect, it } from 'vitest';
import { autoGrow } from './autoGrow';

function area(scrollHeight: number): HTMLTextAreaElement {
  const el = document.createElement('textarea');
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => scrollHeight });
  return el;
}

describe('autoGrow', () => {
  it('fits the content height and hides the scroll bar while under the cap', () => {
    const el = area(42);
    autoGrow(el, 240);
    expect(el.style.height).toBe('42px');
    expect(el.style.overflowY).toBe('hidden');
  });

  it('stops at the cap and scrolls beyond it', () => {
    const el = area(500);
    autoGrow(el, 240);
    expect(el.style.height).toBe('240px');
    expect(el.style.overflowY).toBe('auto');
  });

  it('ignores a missing element', () => {
    expect(() => autoGrow(null, 240)).not.toThrow();
  });
});
