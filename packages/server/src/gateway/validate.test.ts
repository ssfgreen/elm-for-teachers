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
    ...over,
  };
}
const reasons = (raw: unknown[], c = ctx()) => validateOperations(raw, c).dropped.map((d) => [d.index, d.reason]);

describe('validateOperations', () => {
  it('returns nothing for null input and keeps a well-formed mixed list in order', () => {
    expect(validateOperations(null, ctx())).toEqual({ operations: [], dropped: [] });
    const raw = [
      { op: 'insert', after: 'start', type: 'heading', content: '# T' },
      { op: 'insert', doc: OTHER, after: X, type: 'paragraph', content: 'x' },
      { op: 'replace', id: A, content: 'A2' },
      { op: 'delete', id: B },
      { op: 'move', id: A, after: B },
      { op: 'create_doc', temp_id: 'd1', name: 'New' },
      { op: 'insert', doc: 'd1', after: 'start', type: 'paragraph', content: 'into new' },
    ];
    expect(validateOperations(raw, ctx())).toEqual({ operations: raw, dropped: [] });
  });

  it('drops schema-invalid ops (including study-era ops) without aborting the rest', () => {
    expect(reasons([{ op: 'nope' }, { op: 'create_version', temp_id: 'v', name: 'x', copy_from: 'none' }, { op: 'insert', after: 'start', type: 'worksheet_item', content: 'x' }, { op: 'delete', id: A }])).toEqual([
      [0, 'schema_invalid'],
      [1, 'schema_invalid'],
      [2, 'schema_invalid'],
    ]);
  });

  it('drops replace, delete and move of blocks not live in this thread', () => {
    const gone = ulid('gone');
    expect(reasons([{ op: 'replace', id: gone, content: 'x' }, { op: 'delete', id: gone }, { op: 'move', id: gone, after: 'start' }, { op: 'move', id: A, after: gone }])).toEqual([
      [0, 'unknown_block_id'],
      [1, 'unknown_block_id'],
      [2, 'unknown_block_id'],
      [3, 'unknown_block_id'],
    ]);
  });

  it('drops inserts into unknown docs, anchors outside the insert doc, and non-start anchors into new docs', () => {
    expect(
      reasons([
        { op: 'insert', doc: ulid('nope'), after: 'start', type: 'paragraph', content: 'x' },
        { op: 'insert', after: X, type: 'paragraph', content: 'x' },
        { op: 'create_doc', temp_id: 'd1', name: 'New' },
        { op: 'insert', doc: 'd1', after: A, type: 'paragraph', content: 'x' },
        { op: 'insert', doc: 'd2', after: 'start', type: 'paragraph', content: 'x' },
      ]),
    ).toEqual([
      [0, 'unknown_doc'],
      [1, 'unknown_block_id'],
      [3, 'unknown_block_id'],
      [4, 'unknown_doc'],
    ]);
  });

  it('drops a drawing that cannot be kept, in an inserted image or a replace on one', () => {
    const svg = '<svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg>';
    const raw = [
      { op: 'insert', after: 'start', type: 'image', content: svg },
      { op: 'insert', after: 'start', type: 'image', content: '<svg><rect' },
      { op: 'replace', id: A, content: '<svg width="3">' },
      { op: 'replace', id: B, content: '<svg width="3">' },
    ];
    // B is not an image, so its new content is text.
    expect(reasons(raw, ctx({ imageBlockIds: new Set([A]) }))).toEqual([
      [1, 'invalid_image'],
      [2, 'invalid_image'],
    ]);
  });

  it('drops moves across docs and duplicate or colliding temp ids', () => {
    expect(reasons([{ op: 'move', id: A, after: X }])).toEqual([[0, 'moves_across_docs']]);
    expect(
      reasons([
        { op: 'create_doc', temp_id: 'd1', name: 'a' },
        { op: 'create_doc', temp_id: 'd1', name: 'b' },
        { op: 'create_doc', temp_id: 'start', name: 'c' },
        { op: 'create_doc', temp_id: DOC, name: 'd' },
      ]),
    ).toEqual([
      [1, 'duplicate_temp_id'],
      [2, 'duplicate_temp_id'],
      [3, 'duplicate_temp_id'],
    ]);
  });

  it('lets an insert go after an earlier insert in the same doc by temp_id, and checks temp_ids', () => {
    expect(
      reasons([
        { op: 'insert', after: A, type: 'heading', content: '## H', temp_id: 'h1' },
        { op: 'insert', after: 'h1', type: 'paragraph', content: 'p', temp_id: 'p1' },
        { op: 'insert', after: 'p1', type: 'paragraph', content: 'q' },
        { op: 'insert', doc: OTHER, after: 'h1', type: 'paragraph', content: 'wrong doc' },
        { op: 'insert', after: 'nope', type: 'paragraph', content: 'unknown temp' },
        { op: 'insert', after: 'start', type: 'paragraph', content: 'dup', temp_id: 'h1' },
        { op: 'insert', after: 'start', type: 'paragraph', content: 'clash', temp_id: A },
        { op: 'create_doc', temp_id: 'p1', name: 'clash with a block temp_id' },
        { op: 'create_doc', temp_id: 'd1', name: 'New' },
        { op: 'insert', doc: 'd1', after: 'start', type: 'heading', content: '# T', temp_id: 't' },
        { op: 'insert', doc: 'd1', after: 't', type: 'paragraph', content: 'x' },
      ]),
    ).toEqual([
      [3, 'unknown_block_id'],
      [4, 'unknown_block_id'],
      [5, 'duplicate_temp_id'],
      [6, 'duplicate_temp_id'],
      [7, 'duplicate_temp_id'],
    ]);
  });
  it('set_style: the open doc, another of this chat or one made earlier in the list; it must name a font or a colour', () => {
    const raw = [
      { op: 'set_style', background: 'green' },
      { op: 'set_style', doc: OTHER, font: 'comic_sans' },
      { op: 'create_doc', temp_id: 'd1', name: 'New' },
      { op: 'set_style', doc: 'd1', background: 'blue', font: 'lexend' },
      { op: 'set_style', doc: ulid('nowhere'), background: 'green' },
      { op: 'set_style' },
      { op: 'set_style', background: 'light_green' },
    ];
    const out = validateOperations(raw, ctx());
    expect(out.operations).toEqual(raw.slice(0, 4));
    expect(reasons(raw)).toEqual([
      [4, 'unknown_doc'],
      [5, 'no_style'],
      [6, 'schema_invalid'],
    ]);
  });
  it('drops a markdown table written into a block that is not a table: it would show as text with bars', () => {
    const grid = '| Success criteria | Yes | Not yet |\n| --- | --- | --- |\n| Capital letters | | |\n| Spelling and punctuation | | |';
    const c = ctx({ blockTypes: new Map([[A, 'numbered_list'], [B, 'table'], [X, 'code_block']]) });
    const raw = [
      { op: 'replace', id: A, content: grid },
      { op: 'insert', after: A, type: 'paragraph', content: grid },
      { op: 'replace', id: B, content: grid },
      { op: 'insert', after: A, type: 'table', content: grid },
      { op: 'insert', doc: OTHER, after: X, type: 'code_block', content: grid },
      { op: 'replace', id: A, content: 'Rate each one | yes or no' },
    ];
    expect(reasons(raw, c)).toEqual([
      [0, 'table_needs_table_block'],
      [1, 'table_needs_table_block'],
    ]);
  });
});
