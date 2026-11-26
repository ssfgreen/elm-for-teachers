/**
 * Editing mode, when the teacher types in a block while the assistant changes it: both go in
 * (merged word by word), or, when they touch the same words, the teacher's text stays and the
 * assistant's change waits beside it as a suggestion.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid, type Block, type Doc, type LoadedConfig, type ProviderAdapter, type Thread } from '@edw/shared';
import type { CanvasServiceImpl } from '../blocks/service.js';
import { rowToBlock } from '../db/rows.js';
import type { AppDeps } from '../deps.js';
import { envelopeFor, newWorkspace, tempDb, testDeps, testLoaded, type TempDb } from '../test-helpers.js';
import { createChatService, type TurnInput } from './service.js';

const envelope = { client_ts: '2026-11-09T12:00:00.000Z', focus_pane: 'chat' } as const;
const BASE = 'Similes compare two things using like or as.';
const SHORTER = 'Similes compare things using like or as.';

let t: TempDb;
let deps: AppDeps & { canvas: CanvasServiceImpl };
let loaded: LoadedConfig;
let sid: string;
let thread: Thread;
let doc: Doc;
let block: Block;

beforeAll(async () => {
  t = await tempDb();
  loaded = { ...testLoaded(), config: { ...testLoaded().config, mode: 'single' } };
  deps = testDeps(t.db);
});
afterAll(() => t.cleanup());
beforeEach(async () => {
  ({ session: { session_id: sid }, thread, doc } = await newWorkspace(deps));
  block = (await deps.canvas.structural(sid, { command: 'insert', doc_id: doc.id, after: 'start', type: 'paragraph', content: BASE }, envelopeFor(doc, thread))).block! as Block;
});

/** The teacher's typing reaching the server while the model works, then the model's reply. */
function typingWhileItWorks(typed: string, reply: string): ProviderAdapter {
  return {
    model: 'scripted',
    temperature: 1,
    complete: async () => {
      const now = new Date().toISOString();
      await deps.events.appendClient(sid, [
        {
          event_id: newUlid(),
          client_ts: now,
          focus_pane: 'canvas',
          doc_id: doc.id,
          thread_id: thread.id,
          kind: 'keystroke_batch',
          payload: { target: { kind: 'block', block_id: block.id }, char_count: 1, batch_start_ts: now, batch_end_ts: now, content_after: { content: typed } },
        },
      ]);
      return { text: reply, input_tokens: null, output_tokens: null, provider_request_id: null };
    },
  };
}

const replaceWith = (content: string) => 'Shorter now.\n\n```json\n' + JSON.stringify([{ op: 'replace', id: block.id, content }]) + '\n```';
const run = (provider: ProviderAdapter, over: Partial<TurnInput> = {}) =>
  createChatService({ db: t.db, events: deps.events, canvas: deps.canvas, threads: deps.threads, provider, loaded }).runTurn(sid, {
    thread_id: thread.id,
    doc_id: doc.id,
    text: 'Make it shorter',
    envelope,
    edit_mode: 'edit',
    ...over,
  });
async function stored() {
  const r = await t.db.execute('SELECT * FROM blocks WHERE id = ?', [block.id]);
  return rowToBlock(r.rows[0]!);
}

describe('Editing mode: the teacher typed in the block during the turn', () => {
  it("puts in the assistant's change and keeps what the teacher typed, and says so", async () => {
    const r = await run(typingWhileItWorks(BASE + ' Try one now.', replaceWith(SHORTER)));
    if (!r.ok) throw new Error('expected ok');
    expect(await stored()).toMatchObject({ content: SHORTER + ' Try one now.', pending: null, status: 'live' });
    expect(r.typed_during).toEqual([block.id]);
    expect(r.proposed_block_ids).toEqual([]);
    // The model's own operation is logged as it wrote it.
    expect((await deps.events.list(sid, { kinds: ['chat_response'] })).at(-1)!.payload).toMatchObject({ operations: [{ op: 'replace', content: SHORTER }] });
  });

  it("keeps the teacher's text and leaves the change as a suggestion when they touched the same words", async () => {
    const r = await run(typingWhileItWorks(BASE.replace('two', '2'), replaceWith(SHORTER)));
    if (!r.ok) throw new Error('expected ok');
    expect(await stored()).toMatchObject({ content: BASE.replace('two', '2'), status: 'live', pending: { op: 'replace', content: SHORTER } });
    expect(r.typed_during).toEqual([block.id]);
    expect(r.proposed_block_ids).toEqual([block.id]);
  });

  it('changes nothing when the teacher did not type in it', async () => {
    const quiet: ProviderAdapter = { model: 'scripted', temperature: 1, complete: async () => ({ text: replaceWith(SHORTER), input_tokens: null, output_tokens: null, provider_request_id: null }) };
    const r = await run(quiet);
    if (!r.ok) throw new Error('expected ok');
    expect(await stored()).toMatchObject({ content: SHORTER, pending: null });
    expect(r.typed_during).toBeUndefined();
  });
});
