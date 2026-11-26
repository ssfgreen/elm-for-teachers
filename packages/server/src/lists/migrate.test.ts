import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid, type Doc, type Thread } from '@edw/shared';
import type { CanvasServiceImpl } from '../blocks/service.js';
import { createCommentStore } from '../comments/store.js';
import { rowToRevision } from '../db/rows.js';
import type { AppDeps, ServerEnvelope } from '../deps.js';
import { clientEvent, envelopeFor, newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { splitLists } from './migrate.js';

const now = '2026-11-07T12:00:00.000Z';
let t: TempDb;
let deps: AppDeps & { canvas: CanvasServiceImpl };
let sid: string;
let thread: Thread;
let doc: Doc;
let envelope: ServerEnvelope;

beforeAll(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
});
afterAll(() => t.cleanup());
beforeEach(async () => {
  const w = await newWorkspace(deps);
  sid = w.session.session_id;
  thread = w.thread;
  doc = w.doc;
  envelope = envelopeFor(doc, thread);
});

const ctx = () => ({ doc_id: doc.id, thread_id: thread.id });
const shown = async () =>
  [...(await deps.canvas.loadState(sid)).blocks.values()]
    .filter((b) => b.doc_id === doc.id && (b.status === 'live' || b.status === 'proposed'))
    .sort((a, b) => a.order - b.order);

/** A heading, a numbered list the teacher typed into and the assistant suggested a change to, a paragraph; a comment on the list. */
async function workspaceWithAList() {
  const canvas = deps.canvas;
  const h = (await canvas.structural(sid, { command: 'insert', doc_id: doc.id, after: 'start', type: 'heading', content: '## Lesson' }, envelope)).block!;
  const list = (await canvas.structural(sid, { command: 'insert', doc_id: doc.id, after: h.id, type: 'numbered_list', content: '1. Starter\n2. Practice' }, envelope)).block!;
  await canvas.structural(sid, { command: 'insert', doc_id: doc.id, after: list.id, type: 'paragraph', content: 'Notes' }, envelope);
  const typed = '1. Starter\n2. Guided practice\n3. Exit ticket';
  const batch = clientEvent('keystroke_batch', { target: { kind: 'block', block_id: list.id }, edits: [{ t: 1, ops: [{ retain: 14 }, { insert: 'Guided p' }, { delete: 1 }] }], char_count: 9, batch_start_ts: now, batch_end_ts: now, content_after: { content: typed } }, ctx());
  await deps.events.appendClient(sid, [batch]);
  await canvas.applyTurn(sid, { turn_id: 't1', cause_event_id: newUlid(), thread_id: thread.id, default_doc_id: doc.id, operations: [{ op: 'replace', id: list.id, content: '1. Starter\n2. Guided practice\n3. Plenary' }] }, { envelope });
  const comments = createCommentStore(t.db, deps.events);
  await comments.create(sid, { doc_id: doc.id, block_id: list.id, author: 'teacher', body: 'Shorter?', quote: 'Guided practice' }, envelope);
  return { list, batch };
}

describe('splitLists', () => {
  it('a dry run reports and changes nothing', async () => {
    await workspaceWithAList();
    const before = await shown();
    const r = await splitLists(t.db, { dryRun: true, sessionId: sid, now });
    expect(r).toMatchObject({ dry_run: true, sessions: 1, lists: 1, items: 3, ended_items: 0, versions: 2, pending: { replace: 1, delete: 0, move: 0 }, comments_moved: 1, comments_on_first_item: 0 });
    expect(await shown()).toEqual(before);
    expect((await t.db.execute('SELECT COUNT(*) AS n FROM block_splits')).rows[0]!.n).toBe(0);
  });

  it('a dry run on a database from before migration 0019 makes the table only for the run', async () => {
    // Its own database, so the table it drops stays dropped for no other test.
    const shared = { t, deps };
    t = await tempDb();
    deps = testDeps(t.db);
    try {
      const w = await newWorkspace(deps);
      [sid, thread, doc, envelope] = [w.session.session_id, w.thread, w.doc, envelopeFor(w.doc, w.thread)];
      await workspaceWithAList();
      const before = await shown();
      await t.db.execute('DROP TABLE block_splits');
      const r = await splitLists(t.db, { dryRun: true, sessionId: sid, now, createTable: true });
      expect(r).toMatchObject({ dry_run: true, sessions: 1, lists: 1, items: 3 });
      expect(await shown()).toEqual(before);
      expect((await t.db.execute("SELECT name FROM sqlite_master WHERE name = 'block_splits'")).rows).toHaveLength(0);
      await expect(splitLists(t.db, { dryRun: false, sessionId: sid, now, createTable: true })).rejects.toThrow(/dry run/);
    } finally {
      t.cleanup();
      ({ t, deps } = shared);
    }
  });

  it('makes a block per item in the list\'s place, with the history, the waiting suggestion and the comment moved; a second run does nothing', async () => {
    const { list, batch } = await workspaceWithAList();
    await splitLists(t.db, { dryRun: false, sessionId: sid, now });
    const blocks = await shown();
    expect(blocks.map((b) => [b.type, b.content, b.pending?.op === 'replace' ? b.pending.content : null])).toEqual([
      ['heading', '## Lesson', null],
      ['numbered_item', '1. Starter', null],
      ['numbered_item', '2. Guided practice', null],
      ['numbered_item', '3. Exit ticket', '3. Plenary'],
      ['paragraph', 'Notes', null],
    ]);
    expect(blocks.map((b) => b.order)).toEqual([0, 2, 3, 4, 5]);
    expect((await deps.canvas.loadState(sid)).blocks.get(list.id)).toMatchObject({ status: 'deleted', pending: null });
    const [starter, guided, exit] = blocks.slice(1, 4);
    expect([starter, guided, exit].every((b) => b!.derived_from === list.id && b!.origin === 'teacher')).toBe(true);

    // The teacher's typing is a revision of the item it changed, caused by the same batch.
    const revs = (await t.db.execute('SELECT * FROM block_revisions WHERE block_id IN (?, ?, ?) ORDER BY block_id, version', [starter!.id, guided!.id, exit!.id])).rows.map(rowToRevision);
    expect(revs.filter((r) => r.cause_event_id === batch.event_id).map((r) => [r.block_id, r.before?.content ?? null, r.after.content])).toEqual(
      [
        [guided!.id, '2. Practice', '2. Guided practice'],
        [exit!.id, null, '3. Exit ticket'],
      ].sort((a, b) => a[0]!.localeCompare(b[0]!)),
    );
    expect(revs.filter((r) => r.block_id === starter!.id)).toHaveLength(1);

    const splits = (await t.db.execute('SELECT * FROM block_splits WHERE list_block_id = ? ORDER BY version, item_index', [list.id])).rows;
    expect(splits.map((s) => [Number(s.version), Number(s.item_index), String(s.item_block_id)])).toEqual([
      [1, 0, starter!.id],
      [1, 1, guided!.id],
      [2, 0, starter!.id],
      [2, 1, guided!.id],
      [2, 2, exit!.id],
    ]);
    const comment = (await t.db.execute('SELECT block_id FROM comments WHERE session_id = ?', [sid])).rows[0]!;
    expect(comment.block_id).toBe(guided!.id);

    expect(await splitLists(t.db, { dryRun: false, sessionId: sid, now })).toMatchObject({ sessions: 0, lists: 0 });
    // The workspace can still be deleted (block_splits goes first).
    await expect(deps.sessions.delete(sid)).resolves.not.toBeNull();
  });

  it('a comment whose quote was edited since goes to the item sharing most of its words, and with none in common to the first', async () => {
    const list = (await deps.canvas.structural(sid, { command: 'insert', doc_id: doc.id, after: 'start', type: 'bullet_list', content: '- The war ended in 1918.\n- The Treaty of Versailles limited Germany’s army to 100,000 men.' }, envelope)).block!;
    const comments = createCommentStore(t.db, deps.events);
    const edited = await comments.create(sid, { doc_id: doc.id, block_id: list.id, author: 'teacher', body: 'Too long?', quote: 'The Treaty of Versailles limited the size of Germany’s army' }, envelope);
    await comments.create(sid, { doc_id: doc.id, block_id: list.id, author: 'model', body: 'Shortened.', quote: null, root_id: edited.id }, envelope);
    await comments.create(sid, { doc_id: doc.id, block_id: list.id, author: 'teacher', body: 'Where?', quote: 'Partners swap books' }, envelope);
    const r = await splitLists(t.db, { dryRun: false, sessionId: sid, now });
    expect(r).toMatchObject({ comments_moved: 3, comments_by_shared_words: 2, comments_on_first_item: 1 });
    const items = (await shown()).map((b) => b.id);
    const at = (await t.db.execute('SELECT body, block_id FROM comments WHERE session_id = ? ORDER BY created_at, rowid', [sid])).rows.map((c) => [String(c.body), items.indexOf(String(c.block_id))]);
    expect(at).toEqual([['Too long?', 1], ['Shortened.', 1], ['Where?', 0]]);
  });
});
