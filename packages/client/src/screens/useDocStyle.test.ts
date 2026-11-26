import { describe, expect, it } from 'vitest';
import type { Doc } from '@edw/shared';
import { decidedStyle } from './useDocStyle';

const doc: Doc = {
  id: '01JD0C00000000000000000001',
  session_id: 'S1',
  thread_id: '01JT0000000000000000000001',
  name: 'Fractions',
  created_by: 'teacher',
  created_at: '2026-11-05T10:00:00.000Z',
  style: { font: 'arial' },
  proposed_style: { style: { background: 'green' }, turn_id: 't1' },
};

describe('decidedStyle', () => {
  it('an accept sets what the suggestion names over the style as it is', () => {
    expect(decidedStyle(doc, true)).toEqual({ ...doc, style: { font: 'arial', background: 'green' }, proposed_style: undefined });
    expect(decidedStyle(doc, true)).not.toHaveProperty('proposed_style');
  });

  it('a reject drops the suggestion and keeps the style', () => {
    const out = decidedStyle(doc, false);
    expect(out.style).toEqual({ font: 'arial' });
    expect(out).not.toHaveProperty('proposed_style');
  });
});
