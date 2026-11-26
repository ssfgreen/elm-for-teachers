import { newUlid, type Block, type Operation } from '@edw/shared';
import { describe, expect, it } from 'vitest';
import { align, asCopy } from '../src/sessions/as-copy.js';
import { EARLIER_TURN, parseSnapshot } from '../src/sessions/canvas.js';
import { sessionName } from '../src/sessions/bundle.js';

const D1 = newUlid();
const D2 = newUlid();
const [B1, B2, B3, B4] = [newUlid(), newUlid(), newUlid(), newUlid()];
const THREAD = newUlid();

const SNAPSHOT = [
  `## Document: Bannockburn (id: ${D1}; open)`,
  'Style: font=comic_sans',
  `1. [id=${B1}] [type=heading] # Bannockburn`,
  `2. [id=${B2}] [type=paragraph] About 20 minutes`,
  '   (suggested, not yet accepted: replace with: About 15 minutes (two tasks))',
  `3. [id=${B3}] [type=table] | No. | Source |`,
  '   | --- | --- |',
  '   (suggested, not yet accepted: replace with: | No. | Source |',
  '   | --- | --- |',
  '   | 1 | A penny |)',
  `4. [id=${B4}] [type=paragraph] [suggested] Extension: how useful is a source?`,
  '',
  `## Document: Answers (id: ${D2})`,
  '(suggested style, not yet accepted: background=cream)',
  '(empty)',
].join('\n');

describe('a turn’s docs back from the snapshot', () => {
  it('reads docs, styles, blocks over several lines, and waiting suggestions as an earlier turn’s', () => {
    const { blocks, docs, openDocId } = parseSnapshot(SNAPSHOT, 's', THREAD);
    expect(openDocId).toBe(D1);
    expect(docs.map((d) => [d.name, d.style, d.proposed_style])).toEqual([
      ['Bannockburn', { font: 'comic_sans' }, undefined],
      ['Answers', undefined, { style: { background: 'cream' }, turn_id: EARLIER_TURN }],
    ]);
    const [title, time, table, ext] = blocks as [Block, Block, Block, Block];
    expect(blocks).toHaveLength(4);
    expect(title).toMatchObject({ type: 'heading', content: '# Bannockburn', status: 'live', pending: null, order: 0 });
    // A one-line suggestion that ends in its own bracket keeps it.
    expect(time.pending).toEqual({ op: 'replace', turn_id: EARLIER_TURN, content: 'About 15 minutes (two tasks)' });
    expect(table.content).toBe('| No. | Source |\n| --- | --- |');
    expect(table.pending).toEqual({ op: 'replace', turn_id: EARLIER_TURN, content: '| No. | Source |\n| --- | --- |\n| 1 | A penny |' });
    expect(ext).toMatchObject({ status: 'proposed', origin: 'model', origin_turn: EARLIER_TURN, content: 'Extension: how useful is a source?' });
  });

  it('names a session as the plan does', () => {
    expect(sessionName('data/Telemetry/P02-SH-Telemetry')).toBe('2SH');
  });
});

describe('an old copy as a copy_of copy', () => {
  const block = (content: string, type: Block['type'] = 'paragraph'): Block => ({
    id: newUlid(), session_id: 's', doc_id: D1, type, content, origin: 'teacher', origin_turn: null, status: 'live', version: 1, derived_from: null, order: 0, pending: null, created_at: 'x', updated_at: 'x',
  });

  it('lines blocks up in order, by type and shared words', () => {
    const source = [block('# Similes', 'heading'), block('Learning intention: I can spot a simile.'), block('Underline the simile in each sentence.'), block('About 20 minutes')];
    const copy = [block('# Similes', 'heading'), block('Underline the simile in each sentence below.'), block('Extension: write your own.'), block('About 20 minutes')];
    expect(align(source, copy)).toEqual([[0, 0], [2, 1], [3, 3]]);
  });

  it('rewrites a create_doc and its inserts as copy_of, with deletes, replaces and inserts that end with the same blocks', () => {
    const live = (content: string, order: number): Block => ({ ...block(content), order });
    const blocks = [live('# Similes', 0), live('Learning intention: I can spot a simile.', 1), live('Underline the simile in each sentence.', 2), live('About 20 minutes', 3)];
    blocks[0]!.type = 'heading';
    const ops: Operation[] = [
      { op: 'create_doc', temp_id: 'short', name: 'Similes (short)' },
      { op: 'insert', doc: 'short', after: 'start', type: 'heading', content: '# Similes', temp_id: 'a' },
      { op: 'insert', doc: 'short', after: 'a', type: 'paragraph', content: 'Underline the simile in each sentence below.', temp_id: 'b' },
      { op: 'insert', doc: 'short', after: 'b', type: 'paragraph', content: 'Extension: write your own.', temp_id: 'c' },
      { op: 'insert', doc: 'short', after: 'c', type: 'paragraph', content: 'About 20 minutes' },
    ];
    const docs = [{ id: D1, session_id: 's', thread_id: THREAD, name: 'Similes', created_by: 'teacher' as const, created_at: 'x' }];
    const out = asCopy({ blocks, docs, thread_id: THREAD, open_doc_id: D1 }, ops)!;
    const [, li, task, time] = blocks;
    expect(out.copies).toEqual([{ temp_id: 'short', source: D1 }]);
    expect(out.copy_choices).toEqual({});
    expect(out.operations).toEqual([
      { op: 'create_doc', temp_id: 'short', name: 'Similes (short)', copy_of: D1 },
      { op: 'delete', id: `short/${li!.id}` },
      { op: 'replace', id: `short/${task!.id}`, content: 'Underline the simile in each sentence below.' },
      { op: 'insert', doc: 'short', after: `short/${task!.id}`, type: 'paragraph', content: 'Extension: write your own.', temp_id: 'short_new2' },
    ]);
    expect(time).toBeDefined();
  });

  it('leaves a turn that made no copy alone', () => {
    expect(asCopy({ blocks: [], docs: [], thread_id: THREAD, open_doc_id: D1 }, [{ op: 'replace', id: B1, content: 'x' }])).toBeNull();
  });
});
