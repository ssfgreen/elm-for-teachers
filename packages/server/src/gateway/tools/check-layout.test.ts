import { describe, expect, it } from 'vitest';
import type { Operation } from '@edw/shared';
import { block, doc, DOC, ulid } from '../test-fixtures.js';
import { checkLayoutTool } from './check-layout.js';
import type { ToolContext } from './types.js';

const A = ulid('a');
const B = ulid('b');
const GONE = ulid('gone');

function ctx(accepted: Operation[] = []): ToolContext {
  const blocks = [
    block({ id: A, type: 'heading', content: '# Similes' }),
    block({ id: GONE, content: 'deleted', status: 'deleted' }),
    block({ id: B, content: '_'.repeat(40) }),
  ];
  return {
    view: { docs: [doc({ id: DOC, name: 'Homework', style: { font: 'calibri' } })], blocks, ctx: { liveBlockIds: new Set([A, B]), blockDoc: new Map([[A, DOC], [B, DOC]]), docIds: new Set([DOC]), openDocId: DOC }, comments: [] },
    openDocId: DOC,
    accepted,
    comments: [],
    commentThread: null,
    maxReadChars: 40_000,
    skills: [],
    references: null,
  };
}

describe('check_layout', () => {
  it("reports on the doc's live blocks, numbered as read_document numbers them, in the doc's font", async () => {
    const out = await checkLayoutTool.execute({ doc_id: DOC }, ctx());
    expect(out.isError).toBeUndefined();
    expect(out.output).toMatch(/Calibri 12 pt/);
    expect(out.output).toContain(`- Block 2 [id=${B}]: A writing line ends at 53% of the width. Write its blank as <line/>, which reaches the right margin.`);
    expect(out.summary).toEqual(['1 page; 1 layout problem found']);
  });

  it("checks the doc with the turn's edits so far, naming new blocks as read_document does", async () => {
    const out = await checkLayoutTool.execute({ doc_id: DOC }, ctx([
      { op: 'replace', id: B, content: '_'.repeat(73) },
      { op: 'insert', after: B, type: 'paragraph', content: '_'.repeat(30), temp_id: 'lines' },
    ]));
    expect(out.output).not.toContain(`[id=${B}]`);
    expect(out.output).toContain('- Block 3 [new, temp_id=lines]: A writing line ends at');
  });

  it('says which docs there are when the id is wrong', async () => {
    const out = await checkLayoutTool.execute({ doc_id: 'nope' }, ctx());
    expect(out.isError).toBe(true);
    expect(out.output).toContain('Homework');
  });
});
