import { describe, expect, it } from 'vitest';
import { DOC_ID, testBlock, testDoc } from '../test-utils';
import { docJson, exportFile } from './exportDoc';

const doc = testDoc({ id: DOC_ID, name: 'Similes' });
const snap = {
  docs: [doc, testDoc({ id: '01JOTHERD0C000000000000000' })],
  blocks: [
    testBlock({ id: '01JB10CK000000000000000002', order: 1, content: 'Write your own:\nThe thunder was ...' }),
    testBlock({ id: '01JB10CK000000000000000001', order: 0, type: 'heading', content: '# Similes' }),
    testBlock({ id: '01JB10CK000000000000000003', order: 2, content: 'Suggested', status: 'proposed' }),
    testBlock({ id: '01JB10CK000000000000000004', order: 3, content: 'Kept', pending: { op: 'replace', turn_id: 't', content: 'Not accepted' } }),
    testBlock({ id: '01JB10CK000000000000000005', order: 0, content: 'Other doc', doc_id: '01JOTHERD0C000000000000000' }),
  ],
};

describe('exportFile', () => {
  it('writes the accepted text of one doc as markdown, in order', () => {
    const f = exportFile(snap, doc, 'markdown');
    expect(f).toMatchObject({ ext: 'md', mime: 'text/markdown;charset=utf-8' });
    expect(f.text).toBe('# Similes\n\nWrite your own:  \nThe thunder was ...\n\nKept\n');
  });

  it('writes the same blocks as JSON with their types', () => {
    const j = docJson(snap, doc, new Date('2026-10-29T12:00:00.000Z'));
    expect(j).toEqual({
      format: 'edw-doc',
      version: 1,
      id: DOC_ID,
      name: 'Similes',
      exported_at: '2026-10-29T12:00:00.000Z',
      blocks: [
        { id: '01JB10CK000000000000000001', type: 'heading', content: '# Similes' },
        { id: '01JB10CK000000000000000002', type: 'paragraph', content: 'Write your own:\nThe thunder was ...' },
        { id: '01JB10CK000000000000000004', type: 'paragraph', content: 'Kept' },
      ],
    });
    expect(JSON.parse(exportFile(snap, doc, 'json').text).blocks).toHaveLength(3);
  });
});
