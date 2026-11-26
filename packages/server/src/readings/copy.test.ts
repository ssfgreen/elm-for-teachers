import { describe, expect, it } from 'vitest';
import { createState, type Block, type Doc } from '@edw/shared';
import { frozenCopy } from './copy.js';

const T = '2026-11-23T09:00:00.000Z';
const doc: Doc = { id: 'D', session_id: 'S', thread_id: 'T', name: 'The water cycle', created_by: 'teacher', created_at: T };
const block = (id: string, order: number, fields: Partial<Block> = {}): Block => ({
  id,
  session_id: 'S',
  doc_id: 'D',
  type: 'paragraph',
  content: `text ${id}`,
  origin: 'teacher',
  origin_turn: null,
  status: 'live',
  version: 1,
  derived_from: null,
  order,
  pending: null,
  created_at: T,
  updated_at: T,
  ...fields,
});

describe('frozenCopy', () => {
  it('keeps live blocks in order, leaves suggestions out and keeps a picture as its asset id', () => {
    const state = createState('S', [
      block('B', 2, { pending: { op: 'replace', turn_id: 't', content: 'a suggested rewrite' } }),
      block('A', 1, { type: 'heading', content: '# Rain' }),
      block('P', 3, { status: 'proposed', origin: 'model' }),
      block('R', 4, { status: 'rejected' }),
      block('I', 5, { type: 'image', content: '![a cloud](asset:ast_1)' }),
      block('X', 0, { doc_id: 'OTHER' }),
    ], [doc]);
    const copy = frozenCopy(state, 'D');
    expect(copy.blocks).toEqual([
      { id: 'A', type: 'heading', content: '# Rain' },
      { id: 'B', type: 'paragraph', content: 'text B' },
      { id: 'I', type: 'image', content: '![a cloud](asset:ast_1)' },
    ]);
    expect(copy.content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('gives the same hash for the same blocks and another for a change', () => {
    const a = frozenCopy(createState('S', [block('A', 1)], [doc]), 'D');
    expect(frozenCopy(createState('S', [block('A', 1, { version: 7 })], [doc]), 'D').content_hash).toBe(a.content_hash);
    expect(frozenCopy(createState('S', [block('A', 1, { content: 'other' })], [doc]), 'D').content_hash).not.toBe(a.content_hash);
  });
});
