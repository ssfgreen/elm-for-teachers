import { describe, expect, it } from 'vitest';
import type { Highlight } from '@edw/shared';
import { cutRun } from './marks';

const h = (id: string, start: number, end: number, created_at = '2026-11-23T09:00:00.000Z'): Highlight => ({ id, block_id: 'b', start, end, category: null, created_at });

describe('cutRun', () => {
  it('cuts a run where highlights start and end, keeping marks and offsets', () => {
    const run = { from: 0, parts: [{ text: 'Rain ' }, { text: 'falls', bold: true as const }] };
    const pieces = cutRun(run, [h('a', 2, 7)]);
    expect(pieces.map((p) => [p.text, p.at, p.highlight?.id ?? null, p.bold ?? false])).toEqual([
      ['Ra', 0, null, false],
      ['in ', 2, 'a', false],
      ['fa', 5, 'a', true],
      ['lls', 7, null, true],
    ]);
  });

  it('starts at the run’s place in the block, and shows the newest of overlapping highlights', () => {
    const run = { from: 10, parts: [{ text: 'abcdef' }] };
    const pieces = cutRun(run, [h('old', 10, 14, '2026-11-23T09:00:00.000Z'), h('new', 12, 16, '2026-11-23T10:00:00.000Z')]);
    expect(pieces.map((p) => [p.text, p.at, p.highlight?.id])).toEqual([
      ['ab', 10, 'old'],
      ['cdef', 12, 'new'],
    ]);
  });
});
