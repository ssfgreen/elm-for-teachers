import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid, nowIso, type Doc, type Event, type Thread } from '@edw/shared';
import type { CanvasServiceImpl } from '../blocks/service.js';
import { createCommentStore } from '../comments/store.js';
import type { AppDeps, ServerEnvelope } from '../deps.js';
import { splitLists } from '../lists/migrate.js';
import { clientEvent, envelopeFor, newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { buildBundle } from './bundle.js';
import { replayRevisions } from './rebuild.js';
import { replayTextEvents, type TextEventLine } from './textEvents.js';

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
const batch = (blockId: string, ops: unknown[], after: string) =>
  clientEvent('keystroke_batch', { target: { kind: 'block', block_id: blockId }, edits: [{ t: Date.now(), ops }], char_count: 1, batch_start_ts: nowIso(), batch_end_ts: nowIso(), content_after: { content: after } }, ctx());

describe('the export after lists were split', () => {
  it('writes earlier events against the items, and replaying the text events gives each item its stored text', async () => {
    const canvas = deps.canvas;
    const list = (await canvas.structural(sid, { command: 'insert', doc_id: doc.id, after: 'start', type: 'bullet_list', content: '- one\n- two' }, envelope)).block!;
    // The teacher types into the second item, then adds a third.
    const b1 = batch(list.id, [{ retain: 11 }, { insert: '!' }], '- one\n- two!');
    const b2 = batch(list.id, [{ retain: 12 }, { insert: '\n- three' }], '- one\n- two!\n- three');
    await deps.events.appendClient(sid, [b1, b2]);
    // The assistant suggests a change to the first item; the teacher accepts it.
    await canvas.applyTurn(sid, { turn_id: 't1', cause_event_id: newUlid(), thread_id: thread.id, default_doc_id: doc.id, operations: [{ op: 'replace', id: list.id, content: '- One\n- two!\n- three' }] }, { envelope });
    const accept = clientEvent('proposal_accept', { block_id: list.id, doc_id: doc.id, mode: 'click' }, ctx());
    await deps.events.appendClient(sid, [accept, clientEvent('selection', { block_id: list.id, from: 1, to: 2 }, ctx())]);
    await createCommentStore(t.db, deps.events).create(sid, { doc_id: doc.id, block_id: list.id, author: 'teacher', body: 'Good', quote: 'three' }, envelope);

    await splitLists(t.db, { dryRun: false, sessionId: sid });
    // Typing after the split goes to an item as usual.
    const items = [...(await canvas.loadState(sid)).blocks.values()].filter((b) => b.derived_from === list.id && b.status === 'live').sort((a, b) => a.order - b.order);
    expect(items.map((b) => b.content)).toEqual(['- One', '- two!', '- three']);
    await deps.events.appendClient(sid, [batch(items[2]!.id, [{ retain: 7 }, { insert: '?' }], '- three?')]);

    const { files } = await buildBundle(deps, sid);
    const manifest = JSON.parse(files['MANIFEST.json'] as string).notes;
    expect(manifest.text_events_stats).toMatchObject({ resyncs: 0, final_mismatches: 0 });
    expect(manifest.list_items_stats).toMatchObject({ lists: 1, left_out: 0, translated: { keystroke_batch: 2, proposal_accept: 1, selection: 1, comment_create: 1 } });

    const lines = (files['text_events.jsonl'] as string).trim().split('\n').map((l) => JSON.parse(l) as TextEventLine);
    expect(lines.some((l) => l.block_id === list.id)).toBe(false);
    const replayed = replayTextEvents(lines);
    const stored = (JSON.parse(files['blocks.json'] as string) as Array<{ id: string; content: string }>).filter((b) => b.id !== list.id);
    for (const b of stored) expect(replayed.get(b.id) ?? '').toBe(b.content);
    expect(() => replayRevisions(files)).not.toThrow();

    const events = (files['events.jsonl'] as string).trim().split('\n').map((l) => JSON.parse(l) as Event);
    const translated = events.filter((e) => (e.payload as { split_from?: string }).split_from === list.id);
    const [one, two, three] = items.map((b) => b.id);
    const batches = translated.filter((e) => e.kind === 'keystroke_batch').map((e) => [e.event_id, (e.payload as { target: { block_id: string } }).target.block_id]);
    expect(batches).toEqual([
      [b1.event_id, two],
      [b2.event_id, three],
    ]);
    expect(translated.filter((e) => e.kind === 'proposal_accept').map((e) => (e.payload as { block_id: string }).block_id)).toEqual([one]);
    expect(translated.find((e) => e.kind === 'comment_create')!.payload).toMatchObject({ block_id: three });
    expect(translated.find((e) => e.kind === 'selection')!.payload).toMatchObject({ block_id: one });
    expect(events.some((e) => JSON.stringify(e.payload).includes(list.id) && !(e.payload as { split_from?: string }).split_from && e.kind !== 'chat_response')).toBe(false);
  });

  it('a batch that accepted a waiting suggestion by typing is written from the suggestion to what was typed', async () => {
    const canvas = deps.canvas;
    const list = (await canvas.structural(sid, { command: 'insert', doc_id: doc.id, after: 'start', type: 'bullet_list', content: '- one\n- two' }, envelope)).block!;
    await canvas.applyTurn(sid, { turn_id: 't1', cause_event_id: newUlid(), thread_id: thread.id, default_doc_id: doc.id, operations: [{ op: 'replace', id: list.id, content: '- one\n- two\n- three' }] }, { envelope });
    // Typing into the suggestion accepts it (a model revision), then the typing is the teacher's: both cite the batch.
    const typed = batch(list.id, [{ retain: 19 }, { insert: '\n- four' }], '- one\n- two\n- three\n- four');
    await deps.events.appendClient(sid, [typed]);
    const revs = (await t.db.execute('SELECT actor FROM block_revisions WHERE block_id = ? AND cause_event_id = ? ORDER BY version', [list.id, typed.event_id])).rows.map((r) => r.actor);
    expect(revs).toEqual(['model', 'teacher']);

    await splitLists(t.db, { dryRun: false, sessionId: sid });
    const { files } = await buildBundle(deps, sid);
    expect(JSON.parse(files['MANIFEST.json'] as string).notes.text_events_stats).toMatchObject({ resyncs: 0, final_mismatches: 0 });
    const lines = (files['text_events.jsonl'] as string).trim().split('\n').map((l) => JSON.parse(l) as TextEventLine);
    const replayed = replayTextEvents(lines);
    const items = (JSON.parse(files['blocks.json'] as string) as Array<{ id: string; content: string; derived_from: string | null }>).filter((b) => b.derived_from === list.id);
    expect(items.map((b) => b.content).sort()).toEqual(['- four', '- one', '- three', '- two']);
    for (const b of items) expect(replayed.get(b.id) ?? '').toBe(b.content);

    const events = (files['events.jsonl'] as string).trim().split('\n').map((l) => JSON.parse(l) as Event);
    const four = items.find((b) => b.content === '- four')!.id;
    const batches = events.filter((e) => e.event_id === typed.event_id && e.kind === 'keystroke_batch').map((e) => (e.payload as { target: { block_id: string } }).target.block_id);
    expect(batches).toEqual([four]);
    // Each item revision is named by one block_revision event.
    const named = events.filter((e) => e.kind === 'block_revision' && (e.payload as { split_from?: string }).split_from).map((e) => `${(e.payload as { block_id: string }).block_id}:${(e.payload as { version: number }).version}`);
    expect(new Set(named).size).toBe(named.length);
  });
});
