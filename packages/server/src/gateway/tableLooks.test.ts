import { describe, expect, it } from 'vitest';
import type { Operation } from '@edw/shared';
import { keepHeaderColours } from './tableLooks.js';
import { block, ulid } from './test-fixtures.js';

const T = ulid('t');
const P = ulid('p');
const GRID = '| Word | Meaning |\n| --- | --- |\n| gale | a strong wind |';
const blocks = () => [block({ id: T, type: 'table', content: `${GRID}\n<!-- header: teal -->` }), block({ id: P, type: 'paragraph', content: 'Notes' })];

describe('keepHeaderColours', () => {
  it("keeps a table's header colour when the model rewrites the table without it", () => {
    const ops: Operation[] = [{ op: 'replace', id: T, content: `${GRID}\n<!-- colwidths: 120 0 -->` }];
    expect(keepHeaderColours(ops, blocks())).toEqual([{ op: 'replace', id: T, content: `${GRID}\n<!-- colwidths: 120 0 -->\n<!-- header: teal -->` }]);
  });

  it('keeps it for a new table made from the old one (from), as when a table is remade', () => {
    const ops: Operation[] = [{ op: 'delete', id: T }, { op: 'insert', after: P, type: 'table', content: GRID, from: T }];
    expect(keepHeaderColours(ops, blocks())[1]).toMatchObject({ content: `${GRID}\n<!-- header: teal -->` });
  });

  it('leaves a colour the model wrote, a table with no header row, and other blocks alone', () => {
    const ops: Operation[] = [
      { op: 'replace', id: T, content: `${GRID}\n<!-- header: purple -->` },
      { op: 'replace', id: T, content: '| gale | a strong wind |' },
      { op: 'replace', id: P, content: 'More notes' },
    ];
    expect(keepHeaderColours(ops, blocks())).toEqual(ops);
  });

  it('leaves a table that had no colour as it is', () => {
    const plain = [block({ id: T, type: 'table', content: GRID })];
    const ops: Operation[] = [{ op: 'replace', id: T, content: `${GRID}\n<!-- colwidths: 120 0 -->` }];
    expect(keepHeaderColours(ops, plain)).toEqual(ops);
  });
});
