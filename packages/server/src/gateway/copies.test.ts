import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { proposeReplace, type Block, type Doc, type LoadedConfig, type Thread } from '@edw/shared';
import type { CanvasServiceImpl } from '../blocks/service.js';
import type { AppDeps, ServerEnvelope } from '../deps.js';
import { envelopeFor, newWorkspace, tempDb, testDeps, testLoaded, type TempDb } from '../test-helpers.js';
import { createChatService, type TurnInput } from './service.js';
import { scripted } from './test-fixtures.js';
import { DEFAULT_TOOLS } from './tools/index.js';

const envelope = { client_ts: '2026-11-11T12:00:00.000Z', focus_pane: 'chat' } as const;

let t: TempDb;
let deps: AppDeps & { canvas: CanvasServiceImpl };
let loaded: LoadedConfig;
let sid: string;
let thread: Thread;
let doc: Doc;
let env: ServerEnvelope;

const chat = (provider: Parameters<typeof createChatService>[0]['provider']) => createChatService({ db: t.db, events: deps.events, canvas: deps.canvas, threads: deps.threads, provider, loaded });
const input = (text: string, over: Partial<TurnInput> = {}): TurnInput => ({ thread_id: thread.id, doc_id: doc.id, text, envelope, ...over });
const insert = async (content: string, after = 'start') => (await deps.canvas.structural(sid, { command: 'insert', doc_id: doc.id, after, type: 'paragraph', content }, env)).block!;
const blocksOf = async (docId: string): Promise<Block[]> =>
  [...(await deps.canvas.loadState(sid)).blocks.values()].filter((b) => b.doc_id === docId && (b.status === 'live' || b.status === 'proposed')).sort((a, b) => a.order - b.order);
/** An earlier turn's suggestion waiting on a block. */
const suggest = (blockId: string, content: string) => deps.canvas.mutate(sid, (s, c) => proposeReplace(s, c, { block_id: blockId, turn_id: 't0', content }), { envelope: env });

beforeAll(async () => {
  t = await tempDb();
  const base = testLoaded();
  loaded = { ...base, config: { ...base.config, mode: 'agent', agent: { ...base.config.agent, tools: DEFAULT_TOOLS } } };
  deps = testDeps(t.db);
});
afterAll(() => t.cleanup());
beforeEach(async () => {
  const w = await newWorkspace(deps);
  sid = w.session.session_id;
  thread = w.thread;
  doc = w.doc;
  env = envelopeFor(doc, thread);
});

describe('copy_of through edit_document', () => {
  it('copies the doc straight in (a new doc, even in Suggesting mode), derived from its blocks, and tells the model the copies', async () => {
    const a = await insert('Learning intention');
    const b = await insert('About 20 minutes', a.id);
    const { provider, requests } = scripted(
      () => ({ calls: [{ name: 'edit_document', args: { operations: [{ op: 'create_doc', temp_id: 'c', name: 'Shorter', copy_of: doc.id }, { op: 'replace', id: `c/${b.id}`, content: 'About 15 minutes' }] } }] }),
      () => ({ text: 'Made a shorter copy.' }),
    );
    const r = await chat(provider).runTurn(sid, input('Create a duplicate, shorter'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const output = JSON.parse(String((requests[1]!.input.at(-1) as { output: string }).output)) as { copies: unknown };
    expect(output.copies).toEqual([
      { from: a.id, id: `c/${a.id}` },
      { from: b.id, id: `c/${b.id}` },
    ]);
    const copied = await blocksOf(r.created_doc_ids[0]!);
    expect(copied.map((x) => [x.content, x.derived_from, x.status, x.pending])).toEqual([
      ['Learning intention', a.id, 'live', null],
      ['About 15 minutes', b.id, 'live', null],
    ]);
    // Nothing in it waits for the teacher (Sam, 12 Nov 2026): no cards, and none logged as shown.
    expect(r.proposed_block_ids).toEqual([]);
    expect((await deps.events.list(sid, { kinds: ['proposal_shown'] })).at(-1)!.payload).toMatchObject({ block_ids: [], doc_ids: r.created_doc_ids });
    // The source is untouched.
    expect((await blocksOf(doc.id)).map((x) => [x.content, x.pending])).toEqual([
      ['Learning intention', null],
      ['About 20 minutes', null],
    ]);
  });

  it('does not copy a doc with suggestions waiting until the teacher chooses, and says so; the rest goes ahead', async () => {
    const a = await insert('Edward I');
    await suggest(a.id, 'Edward II');
    const { provider, requests } = scripted(
      () => ({
        calls: [
          {
            name: 'edit_document',
            // A choice in the operation is the model's, not the teacher's: it is ignored.
            args: { operations: [{ op: 'create_doc', temp_id: 'c', name: 'Copy', copy_of: doc.id, choice: 'all_and_leave' }, { op: 'insert', doc: 'c', after: 'start', type: 'paragraph', content: 'x' }, { op: 'insert', after: a.id, type: 'paragraph', content: 'Kept' }] },
          },
        ],
      }),
      () => ({ text: 'Choose what the copy is made from.' }),
    );
    const r = await chat(provider).runTurn(sid, input('Make a copy'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const output = JSON.parse(String((requests[1]!.input.at(-1) as { output: string }).output)) as Record<string, unknown>;
    expect(output).toMatchObject({ needs_copy_choice: [{ doc: doc.id, waiting: 1 }] });
    expect(output.copies).toBeUndefined();
    expect(r.created_doc_ids).toEqual([]);
    expect((await blocksOf(doc.id)).map((x) => x.content)).toEqual(['Edward I', 'Kept']);
    // The turn records the request, so the chat shows the choice under the reply, also after a reload.
    expect(r.copy_requests).toEqual([{ doc_id: doc.id, waiting: 1 }]);
    expect((await chat(provider).listTurns(sid, thread.id)).at(-1)?.copy_requests).toEqual([{ doc_id: doc.id, waiting: 1 }]);
  });

  it('shows a copy read back in the same turn with the names its blocks go by, under the choice', async () => {
    const a = await insert('Edward I');
    await suggest(a.id, 'Edward II');
    const { provider, requests } = scripted(
      () => ({ calls: [{ name: 'edit_document', args: { operations: [{ op: 'create_doc', temp_id: 'c', name: 'Copy', copy_of: doc.id }] } }] }),
      () => ({ calls: [{ name: 'read_document', args: { doc_id: 'c' } }] }),
      () => ({ text: 'Copied.' }),
    );
    await chat(provider).runTurn(sid, input('Use all and leave', { copy_choice: { doc_id: doc.id, choice: 'all_and_leave' } }));
    const read = String((requests[2]!.input.at(-1) as { output: string }).output);
    expect(read).toContain(`[new, temp_id=c/${a.id}]`);
    expect(read).toContain('Edward II');
  });

  it("builds the copy from the teacher's choice in the chat body", async () => {
    const a = await insert('Edward I');
    await suggest(a.id, 'Edward II');
    const { provider } = scripted(
      () => ({ calls: [{ name: 'edit_document', args: { operations: [{ op: 'create_doc', temp_id: 'c', name: 'Copy', copy_of: doc.id }] } }] }),
      () => ({ text: 'Copied.' }),
    );
    const r = await chat(provider).runTurn(sid, input('Use all and leave', { copy_choice: { doc_id: doc.id, choice: 'all_and_leave' } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await blocksOf(r.created_doc_ids[0]!)).map((x) => [x.content, x.derived_from])).toEqual([['Edward II', a.id]]);
    // The source keeps its suggestion waiting.
    expect((await blocksOf(doc.id))[0]!.pending).toMatchObject({ op: 'replace', content: 'Edward II' });
  });
});

describe('ChatBody.copy_choice', () => {
  it('takes one of the three choices for a doc, and nothing else', async () => {
    const { ChatBody } = await import('./routes.js');
    const body = { text: 'Use only approved', doc_id: doc.id, envelope };
    expect(ChatBody.parse({ ...body, copy_choice: { doc_id: doc.id, choice: 'approved_only' } }).copy_choice).toEqual({ doc_id: doc.id, choice: 'approved_only' });
    expect(ChatBody.safeParse({ ...body, copy_choice: { doc_id: doc.id, choice: 'everything' } }).success).toBe(false);
  });
});

describe('what the model is told', () => {
  it('offers copy_of on create_doc and from on insert in edit_document, and the prompt says when to copy', async () => {
    const { editDocument } = await import('./tools/edit-document.js');
    const props = (editDocument.parameters as { properties: { operations: { items: { properties: Record<string, unknown> } } } }).properties.operations.items.properties;
    expect(Object.keys(props)).toEqual(expect.arrayContaining(['copy_of', 'from']));
    expect(loaded.system_prompt).toContain('copy_of');
  });
});
