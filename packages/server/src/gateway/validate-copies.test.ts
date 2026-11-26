import { describe, expect, it } from 'vitest';
import { validateOperations, type ValidationContext } from './validate.js';
import { DOC, ulid } from './test-fixtures.js';

const A = ulid('a');
const B = ulid('b');
const X = ulid('x');
const OTHER = ulid('other');

function ctx(over: Partial<ValidationContext> = {}): ValidationContext {
  return {
    liveBlockIds: new Set([A, B, X]),
    blockDoc: new Map([
      [A, DOC],
      [B, DOC],
      [X, OTHER],
    ]),
    docIds: new Set([DOC, OTHER]),
    openDocId: DOC,
    // OTHER has suggestions waiting and no choice from the teacher.
    copies: new Map([
      [DOC, [A, B]],
      [OTHER, null],
    ]),
    ...over,
  };
}
const reasons = (raw: unknown[], c = ctx()) => validateOperations(raw, c).dropped.map((d) => [d.index, d.reason]);

describe('copy_of and from', () => {
  it('keeps a copy of a doc in the view, and lets later operations name its blocks', () => {
    const raw = [
      { op: 'create_doc', temp_id: 'c', name: 'Copy', copy_of: DOC },
      { op: 'replace', id: `c/${B}`, content: 'B2' },
      { op: 'move', id: `c/${B}`, after: 'start' },
      { op: 'insert', doc: 'c', after: `c/${A}`, type: 'paragraph', content: 'new', from: `c/${A}` },
      { op: 'delete', id: `c/${A}` },
    ];
    expect(validateOperations(raw, ctx())).toEqual({ operations: raw, dropped: [] });
  });

  it('drops a copy of a doc outside the view, and one that needs the teacher to choose first', () => {
    expect(reasons([{ op: 'create_doc', temp_id: 'c', name: 'Copy', copy_of: ulid('nope') }])).toEqual([[0, 'unknown_doc']]);
    expect(reasons([{ op: 'create_doc', temp_id: 'c', name: 'Copy', copy_of: OTHER }])).toEqual([[0, 'needs_copy_choice']]);
    // Without copies in the context (a caller that offers none), copy_of names nothing.
    expect(reasons([{ op: 'create_doc', temp_id: 'c', name: 'Copy', copy_of: DOC }], ctx({ copies: undefined }))).toEqual([[0, 'unknown_doc']]);
  });

  it('drops operations on copy blocks that do not exist, or moves across docs', () => {
    const raw = [
      { op: 'create_doc', temp_id: 'c', name: 'Copy', copy_of: DOC },
      { op: 'replace', id: `c/${X}`, content: 'not copied' },
      { op: 'move', id: `c/${A}`, after: B },
    ];
    expect(reasons(raw)).toEqual([
      [1, 'unknown_block_id'],
      [2, 'moves_across_docs'],
    ]);
  });

  it('checks from like an id', () => {
    expect(reasons([{ op: 'insert', after: A, type: 'paragraph', content: 'x', from: ulid('gone') }])).toEqual([[0, 'unknown_block_id']]);
    expect(reasons([{ op: 'insert', after: A, type: 'paragraph', content: 'x', from: X }])).toEqual([]);
  });
});
