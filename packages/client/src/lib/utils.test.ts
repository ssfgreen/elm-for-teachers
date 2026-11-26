import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('keeps the front page sizes beside a colour (#68)', () => {
    for (const size of ['text-display', 'text-title', 'text-lead']) {
      expect(cn(size, 'text-foreground', 'text-landing-ink-foreground')).toBe(`${size} text-landing-ink-foreground`);
    }
  });

  it('lets a later front page size or shadow replace an earlier one', () => {
    expect(cn('text-title', 'text-display')).toBe('text-display');
    expect(cn('shadow-card', 'shadow-soft')).toBe('shadow-soft');
    expect(cn('shadow-soft', 'shadow-dot')).toBe('shadow-dot');
  });
});
