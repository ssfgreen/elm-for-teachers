import { describe, expect, it } from 'vitest';
import type { TextEvent } from './bundle';
import { snapshotAt } from './snapshot';
import { buildTimeline } from './timeline';
import { bundle, ev, T0, text } from './replayTestKit';

const shown = (at: number, turn: string, ops: object[], ids: string[]) => [
  ev(at, 'chat_response', { turn_id: turn, text: '', operations: ops }),
  ev(at, 'proposal_shown', { turn_id: turn, block_ids: ids }),
];
const open = ev(0, 'doc_create', { doc_id: 'd1', thread_id: 'th1', name: 'Doc' });
const blocks = (events: ReturnType<typeof ev>[], te: TextEvent[], at: number) => snapshotAt(buildTimeline(bundle([open, ...events], te)), T0 + at).blocks;

describe('suggestions over time', () => {
  const te = [text(1, 0, 'b1', [{ insert: 'Live' }]), text(2, 1000, 'b2', [{ insert: '# New' }])];

  it('shows a suggested block as proposed, with the type the reply gave it, until accepted', () => {
    const inserted = [...te, text(3, 1000, 'b3', [{ insert: '# Title' }])];
    const events = [...shown(1000, 't1', [{ op: 'insert', after: 'b2', type: 'heading', content: '# Title' }], ['b3']), ev(2000, 'proposal_accept', { block_id: 'b3', doc_id: 'd1', mode: 'click' })];
    expect(blocks(events, inserted, 1500)[2]).toMatchObject({ id: 'b3', type: 'heading', status: 'proposed' });
    expect(blocks(events, inserted, 2500)[2]).toMatchObject({ id: 'b3', status: 'live', pending: null });
  });

  it('drops a suggested block once rejected', () => {
    const events = [...shown(1000, 't1', [{ op: 'insert', after: 'b1', type: 'paragraph', content: '# New' }], ['b2']), ev(2000, 'proposal_reject', { block_id: 'b2', doc_id: 'd1', mode: 'click' })];
    expect(blocks(events, te, 2500).map((b) => b.id)).toEqual(['b1']);
  });

  it('keeps the rest of a suggested edit waiting when one part is accepted, and accept all ends it', () => {
    const events = [
      ...shown(1000, 't1', [{ op: 'replace', id: 'b1', content: 'Live two three' }], ['b1']),
      ev(2000, 'proposal_accept', { block_id: 'b1', doc_id: 'd1', mode: 'click', part: { index: 0, live_after: { content: 'Live two' }, suggested_after: { content: 'Live two three' } } }),
      ev(3000, 'proposal_accept', { block_id: null, doc_id: 'd1', mode: 'accept_all' }),
    ];
    expect(blocks(events, te, 2500)[0]?.pending).toEqual({ op: 'replace', turn_id: 't1', content: 'Live two three' });
    expect(blocks(events, te, 3500)[0]?.pending).toBeNull();
  });

  it('takes typing inside a suggestion into the suggested text', () => {
    const events = [
      ...shown(1000, 't1', [{ op: 'replace', id: 'b1', content: 'Lively' }], ['b1']),
      ev(2000, 'keystroke_batch', { target: { kind: 'block', block_id: 'b1' }, in_suggestion: true, content_after: { content: 'Lively!' } }),
    ];
    expect(blocks(events, te, 2500)[0]?.pending).toEqual({ op: 'replace', turn_id: 't1', content: 'Lively!' });
  });

  it('changes a block’s type when it is retyped, and not before', () => {
    const retyped = [...te, { eventNum: 3, eventName: 'block-retype', eventTimestamp: T0 + 5000, block_id: 'b1', doc_id: 'd1', detail: { action: 'retype', block_id: 'b1', type: 'bullet_item' } }];
    expect(blocks([], retyped, 4000)[0]?.type).toBe('paragraph');
    expect(blocks([], retyped, 5000)[0]?.type).toBe('bullet_item');
  });
});
