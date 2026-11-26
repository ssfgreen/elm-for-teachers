import { describe, expect, it } from 'vitest';
import type { EvalRun } from '../src/harness.js';
import { ol, p } from '../src/harness.js';
import { listItems } from '../src/judges.js';
import { seedRows } from '../src/seed.js';

describe('seedRows', () => {
  it('seeds a list as a block per item, the key on the first and on each as key#n', () => {
    expect(seedRows(ol(['a', 'b'], 'q')).map((r) => [r.type, r.content, r.keys])).toEqual([
      ['numbered_item', '1. a', ['q', 'q#1']],
      ['numbered_item', '2. b', ['q#2']],
    ]);
    expect(seedRows(p('x', 'k'))).toEqual([{ type: 'paragraph', content: 'x', status: 'live', origin: 'teacher', pending: null, keys: ['k'] }]);
  });

  it('puts a waiting suggestion on the items it changes', () => {
    const rows = seedRows({ ...ol(['Starter', 'Practice', 'Exit ticket']), suggested: ol(['Starter', 'Practice in pairs', 'Plenary', 'Exit ticket']).content });
    expect(rows.map((r) => [r.content, r.status, r.pending && JSON.parse(r.pending).op])).toEqual([
      ['1. Starter', 'live', null],
      ['2. Practice', 'live', 'replace'],
      ['3. Plenary', 'proposed', null],
      // Only its number moves on, which is no change: a later item shows its place in the run.
      ['3. Exit ticket', 'live', null],
    ]);
  });
});

describe('listItems', () => {
  const run = (blocks: Array<{ type: string; content: string }>) => ({ afterBlocks: { Doc: blocks } }) as unknown as EvalRun;
  it('passes a block per item and fails a whole-list block', () => {
    expect(listItems('Doc', 'numbered_item', 2)(run([{ type: 'numbered_item', content: '1. a' }, { type: 'numbered_item', content: '2. b' }])).pass).toBe(true);
    expect(listItems('Doc', 'numbered_item', 1)(run([{ type: 'numbered_item', content: '1. a' }, { type: 'numbered_list', content: '1. b' }])).pass).toBe(false);
  });
});
