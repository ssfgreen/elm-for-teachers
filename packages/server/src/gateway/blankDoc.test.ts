/**
 * A blank doc takes the turn straight in, in Suggesting mode (Sam, 13 Nov 2026). Whether the doc
 * is blank is decided at the commit, so typing during the turn makes the changes suggestions.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid, type Doc, type LoadedConfig, type ProviderAdapter, type Thread } from '@edw/shared';
import type { CanvasServiceImpl } from '../blocks/service.js';
import { rowToBlock } from '../db/rows.js';
import type { AppDeps } from '../deps.js';
import { envelopeFor, newWorkspace, tempDb, testDeps, testLoaded, type TempDb } from '../test-helpers.js';
import { BLANK_DOC_NOTE } from './editMode.js';
import { createChatService, type TurnInput } from './service.js';

const envelope = { client_ts: '2026-11-13T12:00:00.000Z', focus_pane: 'chat' } as const;

let t: TempDb;
let deps: AppDeps & { canvas: CanvasServiceImpl };
let loaded: LoadedConfig;
let sid: string;
let thread: Thread;
let doc: Doc;

beforeAll(async () => {
  t = await tempDb();
  loaded = { ...testLoaded(), config: { ...testLoaded().config, mode: 'single' } };
  deps = testDeps(t.db);
});
afterAll(() => t.cleanup());
beforeEach(async () => {
  ({ session: { session_id: sid }, thread, doc } = await newWorkspace(deps));
});

const INSERTS = [
  { op: 'insert', after: 'start', type: 'heading', content: '# Fractions' },
  { op: 'insert', after: 'start', type: 'paragraph', content: 'Halves and quarters.' },
];
const reply = (ops: unknown[]) => 'Here it is.\n\n```json\n' + JSON.stringify(ops) + '\n```';
const result = (text: string) => ({ text, input_tokens: null, output_tokens: null, provider_request_id: null });

/** What the model was last sent: the teacher's message with this turn's notes. */
let sent = '';
/** A model that answers with these operations; `first` runs while it "works". */
const model = (ops: unknown[], first: () => Promise<unknown> = async () => {}): ProviderAdapter => ({
  model: 'scripted',
  temperature: 1,
  complete: async (messages) => {
    sent = messages.at(-1)!.content as string;
    await first();
    return result(reply(ops));
  },
});
const run = (provider: ProviderAdapter, over: Partial<TurnInput> = {}) =>
  createChatService({ db: t.db, events: deps.events, canvas: deps.canvas, threads: deps.threads, provider, loaded }).runTurn(sid, { thread_id: thread.id, doc_id: doc.id, text: 'A worksheet on fractions', envelope, ...over });
const type = (content: string, into: Doc = doc) => deps.canvas.structural(sid, { command: 'insert', doc_id: into.id, after: 'start', type: 'paragraph', content }, envelopeFor(into, thread));
async function blocks(of: Doc = doc) {
  const r = await t.db.execute('SELECT * FROM blocks WHERE session_id = ? AND doc_id = ? ORDER BY "order"', [sid, of.id]);
  return r.rows.map(rowToBlock).filter((b) => b.status === 'live' || b.status === 'proposed');
}
const shown = async () => (await deps.events.list(sid, { kinds: ['proposal_shown'] })).at(-1)!.payload;

describe('runTurn: a blank doc', () => {
  it('takes the changes straight in as the assistant\'s, shows no suggestions, and tells the model', async () => {
    const r = await run(model(INSERTS));
    if (!r.ok) throw new Error('expected ok');
    expect(r.proposed_block_ids).toEqual([]);
    expect((await blocks()).map((b) => [b.content, b.status, b.pending, b.origin])).toEqual([
      ['# Fractions', 'live', null, 'model'],
      ['Halves and quarters.', 'live', null, 'model'],
    ]);
    // The log says why nothing waits: the doc was blank.
    expect(await shown()).toEqual({ turn_id: r.turn_id, block_ids: [], doc_ids: [], blank_doc_ids: [doc.id] });
    expect((await deps.events.list(sid, { kinds: ['proposal_accept'] }))).toEqual([]);
    expect(sent).toContain(BLANK_DOC_NOTE.trim());
  });

  it('a doc typed in and then emptied counts, and so does a suggested page colour', async () => {
    const typed = (await type('Task 1')).block!;
    await deps.events.appendClient(sid, [keystrokes(typed.id, '')]);
    const r = await run(model([{ op: 'replace', id: typed.id, content: 'Fractions' }, { op: 'set_style', background: 'cream' }]));
    if (!r.ok) throw new Error('expected ok');
    expect((await blocks()).map((b) => [b.content, b.status, b.pending])).toEqual([['Fractions', 'live', null]]);
    const stored = (await deps.canvas.snapshot(sid)).docs.find((d) => d.id === doc.id)!;
    expect(stored.style).toMatchObject({ background: 'cream' });
    expect(stored.proposed_style).toBeUndefined();
    expect(r.proposed_block_ids).toEqual([]);
    // Nothing waits, so the page colour is not listed as a suggested style.
    expect(await shown()).toEqual({ turn_id: r.turn_id, block_ids: [], doc_ids: [], blank_doc_ids: [doc.id] });
  });

  it('a later blank doc in the same chat counts too, while a doc with text gets suggestions', async () => {
    const first = (await type('Task 1')).block!;
    const second = (await deps.canvas.structural(sid, { command: 'doc_create', thread_id: thread.id, name: 'Second' }, envelopeFor(doc, thread))).doc!;
    const r = await run(model([{ op: 'replace', id: first.id, content: 'Task 1, changed' }, { op: 'insert', doc: second.id, after: 'start', type: 'paragraph', content: 'Into the blank doc' }]));
    if (!r.ok) throw new Error('expected ok');
    expect(r.proposed_block_ids).toEqual([first.id]);
    expect((await blocks()).map((b) => [b.content, b.pending?.op])).toEqual([['Task 1', 'replace']]);
    expect((await blocks(second)).map((b) => [b.content, b.status])).toEqual([['Into the blank doc', 'live']]);
    expect(await shown()).toEqual({ turn_id: r.turn_id, block_ids: [first.id], doc_ids: [], blank_doc_ids: [second.id] });
    // The open doc has text in it: the model is told nothing new.
    expect(sent).not.toContain(BLANK_DOC_NOTE.trim());
  });

  it('when the teacher types while the assistant works, the changes come as suggestions', async () => {
    const r = await run(model(INSERTS, () => type('I typed this meanwhile')));
    if (!r.ok) throw new Error('expected ok');
    expect(r.proposed_block_ids).toHaveLength(2);
    expect((await blocks()).map((b) => b.status).sort()).toEqual(['live', 'proposed', 'proposed']);
    // No doc was blank at the commit: the field is left out.
    expect(await shown()).toEqual({ turn_id: r.turn_id, block_ids: r.proposed_block_ids, doc_ids: [] });
  });

  it('with a suggestion waiting in the doc, the changes come as suggestions', async () => {
    // The teacher typed during the first turn, so its inserts wait; then emptied their own line.
    const mine = { id: '' };
    await run(model(INSERTS, async () => (mine.id = (await type('Mine')).block!.id)));
    await deps.events.appendClient(sid, [keystrokes(mine.id, '')]);
    const r = await run(model([{ op: 'insert', after: 'start', type: 'paragraph', content: 'One more' }]));
    if (!r.ok) throw new Error('expected ok');
    expect(r.proposed_block_ids).toHaveLength(1);
    expect((await blocks()).filter((b) => b.status === 'proposed')).toHaveLength(3);
    expect(sent).not.toContain(BLANK_DOC_NOTE.trim());
  });

  it('Editing mode is as before: straight in, with its own note only', async () => {
    const r = await run(model(INSERTS), { edit_mode: 'edit' });
    if (!r.ok) throw new Error('expected ok');
    expect((await blocks()).every((b) => b.status === 'live')).toBe(true);
    expect(sent).toContain('Editing mode');
    expect(sent).not.toContain(BLANK_DOC_NOTE.trim());
  });
});

function keystrokes(blockId: string, content: string) {
  const now = new Date().toISOString();
  return {
    event_id: newUlid(),
    client_ts: now,
    focus_pane: 'canvas' as const,
    doc_id: doc.id,
    thread_id: thread.id,
    kind: 'keystroke_batch' as const,
    payload: { target: { kind: 'block' as const, block_id: blockId }, char_count: 1, batch_start_ts: now, batch_end_ts: now, content_after: { content } },
  };
}

describe('the mock, told the open doc is blank', () => {
  it('reads the teacher\'s words without the note, and does not ask them to accept a page colour', async () => {
    const { mockReply } = await import('./mock.js');
    const ask = (text: string) => mockReply([{ role: 'user', content: `## Document: Untitled (id: d1; open)\n\n---\n\nTeacher: ${text}${BLANK_DOC_NOTE}` }]);
    expect(ask('What is a simile?')).toMatch(/^A simile compares/);
    expect(ask('Make the background green')).toMatch(/^I have made the page pale green\./);
  });

  it('in a doc with text, drafts the worksheet when asked to write one, but adapts when asked for an easier version', async () => {
    const { mockReply } = await import('./mock.js');
    const ask = (text: string) => mockReply([{ role: 'user', content: `## Document: Untitled (id: d1; open)\n1. [id=b1] [type=paragraph] My notes\n\n---\n\nTeacher: ${text}` }]);
    expect(ask('Please write the worksheet on metaphors')).toMatch(/^Here is a draft worksheet/);
    expect(ask('Write an easier version of the worksheet')).toMatch(/^I have added a short support section/);
  });
});
