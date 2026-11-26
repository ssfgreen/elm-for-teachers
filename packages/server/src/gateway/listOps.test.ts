import { describe, expect, it } from 'vitest';
import type { Operation } from '@edw/shared';
import { expandListOps } from './listOps.js';
import { block, DOC, ulid } from './test-fixtures.js';

const H = ulid('h');
const I1 = ulid('i1');
const I2 = ulid('i2');
const I3 = ulid('i3');
const P = ulid('p');

/** A heading, a three-item numbered run, then a paragraph. */
const doc = () => [
  block({ id: H, order: 0, type: 'heading', content: '## Lesson' }),
  block({ id: I1, order: 1, type: 'numbered_item', content: '1. Starter' }),
  block({ id: I2, order: 2, type: 'numbered_item', content: '2. Guided practice' }),
  block({ id: I3, order: 3, type: 'numbered_item', content: '3. Exit ticket', pending: { op: 'delete', turn_id: 't0' } }),
  block({ id: P, order: 4, type: 'paragraph', content: 'Notes' }),
];

describe('expandListOps', () => {
  it('splits an inserted list into one insert per item, the temp_id on the last', () => {
    const ops: Operation[] = [
      { op: 'insert', after: 'start', type: 'bullet_list', content: '- one\n  more\n- two', temp_id: 'l' },
      { op: 'insert', after: 'l', type: 'paragraph', content: 'After' },
    ];
    expect(expandListOps(ops, doc())).toEqual([
      { op: 'insert', after: 'start', type: 'bullet_item', content: '- one\n  more' },
      { op: 'insert', after: 'start', type: 'bullet_item', content: '- two', temp_id: 'l' },
      { op: 'insert', after: 'l', type: 'paragraph', content: 'After' },
    ]);
  });

  it('leaves a one-item insert and other blocks alone', () => {
    const ops: Operation[] = [
      { op: 'insert', after: P, type: 'checklist_item', content: '- [ ] tick' },
      { op: 'insert', after: P, type: 'paragraph', content: '- not a list' },
      { op: 'replace', id: P, content: 'New notes' },
    ];
    expect(expandListOps(ops, doc())).toEqual(ops);
  });

  it('a replace of an item with new items only replaces it and inserts the rest after it', () => {
    const ops: Operation[] = [{ op: 'replace', id: I2, content: '2. Guided practice in pairs\n3. Independent practice' }];
    expect(expandListOps(ops, doc())).toEqual([
      { op: 'replace', id: I2, content: '2. Guided practice in pairs' },
      { op: 'insert', doc: DOC, after: I2, type: 'numbered_item', content: '3. Independent practice' },
    ]);
  });

  it('a rewrite of a run is matched item by item: an unchanged item, and a waiting suggestion on another, are left alone', () => {
    // Asked only about guided practice; the model rewrites the whole list but keeps the others word for word.
    const ops: Operation[] = [{ op: 'replace', id: I1, content: '1. Starter\n2. Guided practice with a worked example\n3. Exit ticket', revises_suggestion: false }];
    expect(expandListOps(ops, doc())).toEqual([{ op: 'replace', id: I2, content: '2. Guided practice with a worked example' }]);
  });

  it('in a rewrite, new items are inserted in place, missing ones suggested for deletion, and other ops on the run dropped', () => {
    const ops: Operation[] = [
      { op: 'replace', id: I1, content: '1. Starter\n2. Model it\n3. Guided practice' },
      { op: 'delete', id: I3 },
      { op: 'replace', id: P, content: 'Notes, revised' },
    ];
    expect(expandListOps(ops, doc())).toEqual([
      { op: 'insert', doc: DOC, after: I1, type: 'numbered_item', content: '2. Model it', temp_id: 'item_1' },
      // Guided practice keeps its text; its number moving on is no change.
      { op: 'delete', id: I3 },
      { op: 'replace', id: P, content: 'Notes, revised' },
    ]);
  });

  it('a replace of the first item plus deletes of the rest is a rewrite too, even with every item changed', () => {
    const ops: Operation[] = [
      { op: 'replace', id: I1, content: '1. Warm-up\n2. Practice' },
      { op: 'delete', id: I2 },
      { op: 'delete', id: I3 },
    ];
    expect(expandListOps(ops, doc())).toEqual([
      { op: 'replace', id: I1, content: '1. Warm-up' },
      { op: 'replace', id: I2, content: '2. Practice' },
      { op: 'delete', id: I3 },
    ]);
  });

  it('a rewrite carries revises_suggestion on to each change', () => {
    const ops: Operation[] = [{ op: 'replace', id: I1, content: '1. Starter\n2. Guided practice', revises_suggestion: true }];
    expect(expandListOps(ops, doc())).toEqual([{ op: 'delete', id: I3, revises_suggestion: true }]);
  });

  it('in a rewrite, an item whose number alone moved on is left alone', () => {
    const ops: Operation[] = [{ op: 'replace', id: I1, content: '1. Starter\n2. Model it\n3. Guided practice\n4. Exit ticket' }];
    expect(expandListOps(ops, doc())).toEqual([{ op: 'insert', doc: DOC, after: I1, type: 'numbered_item', content: '2. Model it', temp_id: 'item_1' }]);
  });

  it('splits a replace of a copied item (named <temp_id>/<source id>) with several items into the copy', () => {
    const ops: Operation[] = [
      { op: 'create_doc', temp_id: 'c', name: 'Copy', copy_of: DOC },
      { op: 'replace', id: `c/${I2}`, content: '2. Guided practice\n3. Share and improve' },
    ];
    expect(expandListOps(ops, doc())).toEqual([
      ops[0],
      { op: 'replace', id: `c/${I2}`, content: '2. Guided practice' },
      { op: 'insert', doc: 'c', after: `c/${I2}`, type: 'numbered_item', content: '3. Share and improve' },
    ]);
  });
});
