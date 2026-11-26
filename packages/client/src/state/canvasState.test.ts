import { describe, expect, it } from 'vitest';
import type { Doc } from '@edw/shared';
import type { CanvasSnapshot, PublicBlock } from '../editor/types.js';
import { DOC_ID, THREAD_ID, testBlock, testDoc } from '../test-utils';
import { applyDecision, applyLocalEdit, docsInThread, hasProposals, headingName, isBlankUntitled, mergeChanges } from './canvasState';

const OTHER = '01JOTHERD0C000000000000000';
const block = (p: Partial<PublicBlock> & { id: string }) => testBlock(p);
const byId = (s: CanvasSnapshot, bid: string) => s.blocks.find((b) => b.id === bid)!;
const orderOf = (s: CanvasSnapshot, doc = DOC_ID) =>
  s.blocks
    .filter((b) => b.doc_id === doc && (b.status === 'live' || b.status === 'proposed'))
    .sort((a, b) => a.order - b.order)
    .map((b) => b.id);
const snap = (blocks: PublicBlock[]): CanvasSnapshot => ({ blocks, docs: [testDoc({ id: DOC_ID }), testDoc({ id: OTHER })] });
const click = (decision: 'accept' | 'reject', block_id: string) => ({ decision, block_id, doc_id: DOC_ID, mode: 'click' as const });

describe('mergeChanges', () => {
  it('upserts blocks and docs by id, keeping untouched ones, and tolerates missing arrays', () => {
    const s = snap([block({ id: 'A', content: 'a' }), block({ id: 'B', content: 'b', order: 1 })]);
    const out = mergeChanges(s, { blocks: [{ ...byId(s, 'B'), content: 'b2' }, block({ id: 'C', order: 2 })], docs: [testDoc({ id: DOC_ID, name: 'Renamed' }), testDoc({ id: 'N' })] });
    expect(out.blocks.map((b) => [b.id, b.content])).toEqual([['A', 'a'], ['B', 'b2'], ['C', 'text']]);
    expect(out.docs.map((d) => [d.id, d.name])).toEqual([[DOC_ID, 'Renamed'], [OTHER, 'Untitled'], ['N', 'Untitled']]);
    expect(mergeChanges(s, {})).toEqual(s);
  });
});

describe('applyDecision', () => {
  it('accepting a proposed insert makes it live; rejecting one marks it rejected and renumbers', () => {
    const s = snap([block({ id: 'A' }), block({ id: 'P', status: 'proposed', order: 1 }), block({ id: 'Q', status: 'proposed', order: 2 })]);
    const out = applyDecision(applyDecision(s, click('accept', 'P')), click('reject', 'Q'));
    expect(byId(out, 'P').status).toBe('live');
    expect(byId(out, 'Q').status).toBe('rejected');
    expect(orderOf(out)).toEqual(['A', 'P']);
    expect(s.blocks[1]!.status).toBe('proposed');
  });

  it('accepting a pending replace copies the content and bumps the version; rejecting clears it', () => {
    const pending = { op: 'replace' as const, turn_id: 't', content: 'new' };
    const s = snap([block({ id: 'A', content: 'old', pending })]);
    expect(byId(applyDecision(s, click('accept', 'A')), 'A')).toMatchObject({ content: 'new', pending: null, version: 2 });
    expect(byId(applyDecision(s, click('reject', 'A')), 'A')).toMatchObject({ content: 'old', pending: null, version: 1 });
  });

  it('accepting a pending delete deletes and renumbers; a pending move places the block', () => {
    const s = snap([
      block({ id: 'A' }),
      block({ id: 'B', order: 1, pending: { op: 'delete', turn_id: 't' } }),
      block({ id: 'C', order: 2, pending: { op: 'move', turn_id: 't', after: 'start' } }),
    ]);
    const del = applyDecision(s, click('accept', 'B'));
    expect(byId(del, 'B').status).toBe('deleted');
    expect(orderOf(del)).toEqual(['A', 'C']);
    expect(orderOf(applyDecision(s, click('accept', 'C')))).toEqual(['C', 'A', 'B']);
  });

  it('accept_all and reject_all apply to every proposal in the named doc only', () => {
    const s = snap([
      block({ id: 'A', status: 'proposed' }),
      block({ id: 'B', order: 1, pending: { op: 'replace', turn_id: 't', content: 'B2' } }),
      block({ id: 'O', doc_id: OTHER, status: 'proposed' }),
    ]);
    const all = applyDecision(s, { decision: 'accept', block_id: null, doc_id: DOC_ID, mode: 'accept_all' });
    expect([byId(all, 'A').status, byId(all, 'B').content, byId(all, 'O').status]).toEqual(['live', 'B2', 'proposed']);
    const none = applyDecision(s, { decision: 'reject', block_id: null, doc_id: DOC_ID, mode: 'reject_all' });
    expect([byId(none, 'A').status, byId(none, 'B').pending, byId(none, 'O').status]).toEqual(['rejected', null, 'proposed']);
  });

  it('ignores decisions on unknown or settled blocks', () => {
    const s = snap([block({ id: 'A' })]);
    expect(applyDecision(s, click('accept', 'nope'))).toEqual(s);
    expect(applyDecision(s, click('reject', 'A'))).toEqual(s);
  });
});

describe('applyLocalEdit', () => {
  it('sets content, makes a proposed block live and clears pending; accepts a bare string', () => {
    const s = snap([block({ id: 'A', status: 'proposed' }), block({ id: 'B', order: 1, pending: { op: 'delete', turn_id: 't' } })]);
    let out = applyLocalEdit(s, 'A', { content: 'mine' });
    out = applyLocalEdit(out, 'B', 'b');
    expect(byId(out, 'A')).toMatchObject({ content: 'mine', status: 'live' });
    expect(byId(out, 'B')).toMatchObject({ content: 'b', pending: null });
    expect(applyLocalEdit(s, 'nope', 'x')).toBe(s);
  });
});

describe('inside a suggestion (7 Nov 2026)', () => {
  const A = '01JB10CK00000000000000000A';
  const pending = { op: 'replace' as const, turn_id: 't', content: 'a small dog' };

  it('a local edit inside a suggested edit keeps it, with the live text the editor worked out', () => {
    const s = applyLocalEdit(snap([block({ id: A, content: 'a big dog', pending })]), A, { content: 'a small dog!' }, { live: { content: 'a big dog!' } });
    expect(byId(s, A)).toMatchObject({ status: 'live', content: 'a big dog!', pending: { op: 'replace', content: 'a small dog!' } });
    const same = applyLocalEdit(snap([block({ id: A, content: 'a big dog', pending })]), A, { content: 'a big dog' }, { live: { content: 'a big dog' } });
    expect(byId(same, A).pending).toBeNull();
  });

  it('a local edit inside a new block keeps it a suggestion', () => {
    const s = applyLocalEdit(snap([block({ id: A, content: 'New', status: 'proposed' })]), A, { content: 'New!' }, {});
    expect(byId(s, A)).toMatchObject({ status: 'proposed', content: 'New!' });
  });

  it('one change decided sets both texts, and nothing is left once they agree', () => {
    const part = { index: 0, ins: 'small', del: 'big', live_after: { content: 'a small dog' }, suggested_after: { content: 'a small dog' } };
    const s = applyDecision(snap([block({ id: A, content: 'a big dog', pending })]), { ...click('accept', A), part });
    expect(byId(s, A)).toMatchObject({ content: 'a small dog', pending: null });
    const kept = applyDecision(snap([block({ id: A, content: 'a big dog', pending: { ...pending, content: 'a small dog and cat' } })]), { ...click('accept', A), part: { ...part, suggested_after: { content: 'a small dog and cat' } } });
    expect(byId(kept, A)).toMatchObject({ content: 'a small dog', pending: { content: 'a small dog and cat' } });
  });
});

describe('hasProposals and docsInThread', () => {
  it('detect proposals per doc and list a thread’s docs oldest first', () => {
    const s = snap([block({ id: 'O', doc_id: OTHER, status: 'proposed' })]);
    expect(hasProposals(s, OTHER)).toBe(true);
    expect(hasProposals(s, DOC_ID)).toBe(false);
    const docs = [testDoc({ id: 'Z2', created_at: '2026-10-29T12:00:00.000Z' }), testDoc({ id: 'Z1', created_at: '2026-10-29T11:00:00.000Z' }), testDoc({ id: 'Y', thread_id: 'T2' })];
    expect(docsInThread({ blocks: [], docs }, THREAD_ID).map((d) => d.id)).toEqual(['Z1', 'Z2']);
  });
});

describe('headingName', () => {
  const snap = (blocks: PublicBlock[]): CanvasSnapshot => ({ blocks, docs: [testDoc({ id: DOC_ID, name: 'Untitled' })] });
  it("takes the first heading's text, without # and marks, live or suggested", () => {
    expect(headingName(snap([testBlock({ id: '01JB10CK000000000000000001', type: 'paragraph', content: 'Intro', order: 0 }), testBlock({ id: '01JB10CK000000000000000002', type: 'heading', content: '## Similes and *metaphors*', order: 1, status: 'proposed' })]), DOC_ID)).toBe('Similes and metaphors');
  });
  it('is null with no heading, an empty one, or only a rejected one', () => {
    expect(headingName(snap([testBlock({ id: '01JB10CK000000000000000001', type: 'paragraph', content: 'Intro' })]), DOC_ID)).toBeNull();
    expect(headingName(snap([testBlock({ id: '01JB10CK000000000000000001', type: 'heading', content: '# ' })]), DOC_ID)).toBeNull();
    expect(headingName(snap([testBlock({ id: '01JB10CK000000000000000001', type: 'heading', content: '# Gone', status: 'rejected' })]), DOC_ID)).toBeNull();
  });
});

describe('isBlankUntitled', () => {
  const blank = (blocks: PublicBlock[], doc: Partial<Doc> = {}): CanvasSnapshot => ({ blocks, docs: [testDoc({ id: DOC_ID, ...doc })] });

  it('is true for an Untitled doc with no blocks, or only empty paragraphs', () => {
    expect(isBlankUntitled(blank([]), DOC_ID)).toBe(true);
    expect(isBlankUntitled(blank([block({ id: 'A', content: '' }), block({ id: 'B', content: '  \n', order: 1 })]), DOC_ID)).toBe(true);
  });

  it('is false once the doc is named, styled, has text or anything but an empty paragraph', () => {
    expect(isBlankUntitled(blank([], { name: 'Similes' }), DOC_ID)).toBe(false);
    expect(isBlankUntitled(blank([], { style: { font: 'lexend' } }), DOC_ID)).toBe(false);
    expect(isBlankUntitled(blank([block({ id: 'A', content: 'Hello' })]), DOC_ID)).toBe(false);
    expect(isBlankUntitled(blank([block({ id: 'A', content: '', type: 'page_break' })]), DOC_ID)).toBe(false);
    expect(isBlankUntitled(blank([block({ id: 'A', content: '', status: 'proposed' })]), DOC_ID)).toBe(false);
    expect(isBlankUntitled(blank([block({ id: 'A', content: '', status: 'deleted' })]), DOC_ID)).toBe(false);
    expect(isBlankUntitled(blank([block({ id: 'A', content: '', pending: { op: 'replace', turn_id: 't', content: 'x' } })]), DOC_ID)).toBe(false);
  });

  it('is false for a doc it does not know', () => {
    expect(isBlankUntitled(blank([]), OTHER)).toBe(false);
  });
});
