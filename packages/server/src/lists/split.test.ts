import { describe, expect, it } from 'vitest';
import type { Block, BlockRevision } from '@edw/shared';
import { splitListBlock } from './split.js';

const L = '01JR0L1ST00000000000000000';
const at = (n: number) => `2026-11-0${n}T10:00:00.000Z`;
const list = (over: Partial<Block> = {}): Block => ({
  id: L, session_id: 's', doc_id: 'd', type: 'numbered_list', content: '', origin: 'teacher', origin_turn: null, status: 'live',
  version: 0, derived_from: null, order: 3, pending: null, created_at: at(1), updated_at: at(1), ...over,
});
const rev = (version: number, content: string, actor: 'teacher' | 'model' = 'teacher', prev: string | null = null): BlockRevision => ({
  block_id: L, version, actor, before: prev === null ? null : { content: prev }, after: { content }, cause_event_id: `01JR0CAUSE0000000000000${String(version).padStart(3, '0')}`, at: at(version),
});
let n = 0;
const opts = { newId: () => `item${++n}`, now: '2026-11-07T12:00:00.000Z', causeOfTurn: (t: string) => (t === 't9' ? 'resp9' : undefined) };

describe('splitListBlock', () => {
  it('replays the history as item revisions: an item edited, one added, one removed', () => {
    n = 0;
    const v1 = '1. Starter\n2. Practice\n   ____';
    const v2 = '1. Starter\n2. Guided practice\n   ____\n3. Exit ticket';
    const v3 = '1. Guided practice\n   ____\n2. Exit ticket';
    const s = splitListBlock(list({ content: v3, version: 3 }), [rev(1, v1), rev(2, v2, 'model', v1), rev(3, v3, 'teacher', v2)], opts);
    expect(s.list).toMatchObject({ status: 'deleted', pending: null });
    expect(s.items.map((b) => [b.id, b.type, b.status, b.content, b.version, b.derived_from])).toEqual([
      ['item2', 'numbered_item', 'live', '1. Guided practice\n   ____', 3, L],
      ['item3', 'numbered_item', 'live', '2. Exit ticket', 2, L],
      ['item1', 'numbered_item', 'deleted', '1. Starter', 1, L],
    ]);
    expect(s.revisions.map((r) => [r.block_id, r.version, r.actor, r.before?.content ?? null, r.after.content, r.cause_event_id.slice(-3), r.at])).toEqual([
      ['item1', 1, 'teacher', null, '1. Starter', '001', at(1)],
      ['item2', 1, 'teacher', null, '2. Practice\n   ____', '001', at(1)],
      ['item2', 2, 'model', '2. Practice\n   ____', '2. Guided practice\n   ____', '002', at(2)],
      ['item3', 1, 'model', null, '3. Exit ticket', '002', at(2)],
      // Version 3 renumbers: the texts match, the contents differ.
      ['item2', 3, 'teacher', '2. Guided practice\n   ____', '1. Guided practice\n   ____', '003', at(3)],
      ['item3', 2, 'teacher', '3. Exit ticket', '2. Exit ticket', '003', at(3)],
    ]);
  });

  it('records which lines of each version each item held', () => {
    n = 0;
    const s = splitListBlock(list({ type: 'bullet_list', content: '- a\n  more\n- b', version: 1 }), [rev(1, '- a\n  more\n- b')], opts);
    expect(s.splits).toEqual([
      { list_block_id: L, version: 1, item_index: 0, item_block_id: 'item1', first_line: 0, line_count: 2 },
      { list_block_id: L, version: 1, item_index: 1, item_block_id: 'item2', first_line: 2, line_count: 1 },
    ]);
  });

  it('puts a waiting replace on the items it changes, a new item as a suggested block, a missing one as a suggested deletion', () => {
    n = 0;
    const v1 = '- [ ] read\n- [ ] write\n- [ ] draw';
    const s = splitListBlock(list({ type: 'checklist', content: v1, version: 1, pending: { op: 'replace', turn_id: 't9', content: '- [ ] read\n- [ ] write a poem\n- [ ] share' } }), [rev(1, v1)], opts);
    expect(s.stats.pending).toBe('replace');
    expect(s.items.map((b) => [b.content, b.status, b.origin, b.pending])).toEqual([
      ['- [ ] read', 'live', 'teacher', null],
      ['- [ ] write', 'live', 'teacher', { op: 'replace', turn_id: 't9', content: '- [ ] write a poem' }],
      ['- [ ] draw', 'live', 'teacher', { op: 'replace', turn_id: 't9', content: '- [ ] share' }],
    ]);
  });

  it('a waiting replace that removes one item and adds another', () => {
    n = 0;
    const v1 = '- a\n- b\n- c';
    const s = splitListBlock(list({ type: 'bullet_list', content: v1, version: 1, pending: { op: 'replace', turn_id: 't9', content: '- a\n- c\n- new' } }), [rev(1, v1)], opts);
    expect(s.items.map((b) => [b.content, b.status, b.pending?.op ?? null])).toEqual([
      ['- a', 'live', null],
      ['- b', 'live', 'delete'],
      ['- c', 'live', null],
      ['- new', 'proposed', null],
    ]);
    expect(s.revisions.at(-1)).toMatchObject({ actor: 'model', after: { content: '- new' }, cause_event_id: 'resp9' });
  });

  it('a waiting delete applies to every item; a suggested list becomes suggested items; a rejected list keeps its status', () => {
    n = 0;
    expect(splitListBlock(list({ type: 'bullet_list', content: '- a\n- b', pending: { op: 'delete', turn_id: 't' } }), [rev(1, '- a\n- b')], opts).items.map((b) => b.pending)).toEqual([
      { op: 'delete', turn_id: 't' },
      { op: 'delete', turn_id: 't' },
    ]);
    const proposed = splitListBlock(list({ type: 'bullet_list', content: '- a\n- b', origin: 'model', origin_turn: 't1', status: 'proposed' }), [rev(1, '- a\n- b', 'model')], opts);
    expect(proposed.items.map((b) => [b.status, b.origin, b.origin_turn])).toEqual([['proposed', 'model', 't1'], ['proposed', 'model', 't1']]);
    expect(proposed.list.status).toBe('deleted');
    const rejected = splitListBlock(list({ type: 'bullet_list', content: '- a', status: 'rejected' }), [rev(1, '- a', 'model')], opts);
    expect([rejected.list.status, rejected.items[0]!.status]).toEqual(['rejected', 'rejected']);
  });
});
