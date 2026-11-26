import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid, type Doc, type LoadedConfig, type ProviderAdapter, type Thread } from '@edw/shared';
import type { CanvasServiceImpl } from '../blocks/service.js';
import { rowToBlock } from '../db/rows.js';
import type { AppDeps, ServerEnvelope } from '../deps.js';
import { envelopeFor, newWorkspace, tempDb, testDeps, testLoaded, typeLine, type TempDb } from '../test-helpers.js';
import { NEW_THREAD_TITLE } from '../threads/service.js';
import { ProviderError } from './errors.js';
import { loadGatewayCalls, loadTurns } from './history.js';
import { MockProvider, sampleWorksheet } from './mock.js';
import { expandListOps } from './listOps.js';
import { createChatService, TURN_FAILED_MESSAGE, type ChatService, type TurnInput } from './service.js';

/** The mock's sample worksheet: 12 inserts. */
// One block per list item: the worksheet's lists are split (listOps.ts).
const N = expandListOps(sampleWorksheet(), []).length;
const WORKSHEET_PROMPT = 'Please draft a worksheet on metaphors and similes for my P7 class.';
const envelope = { client_ts: '2026-10-29T12:00:00.000Z', focus_pane: 'chat' } as const;

let t: TempDb;
let deps: AppDeps & { canvas: CanvasServiceImpl };
let loaded: LoadedConfig;
let sid: string;
let thread: Thread;
let doc: Doc;
let setupEvents: number;

function chat(over: { provider?: ProviderAdapter; loaded?: LoadedConfig } = {}): ChatService {
  return createChatService({
    db: t.db,
    events: deps.events,
    canvas: deps.canvas,
    threads: deps.threads,
    provider: over.provider ?? new MockProvider('mock-model', 1),
    loaded: over.loaded ?? loaded,
  });
}

const input = (text: string, over: Partial<TurnInput> = {}): TurnInput => ({ thread_id: thread.id, doc_id: doc.id, text, envelope, ...over });
const since = async () => (await deps.events.list(sid)).slice(setupEvents);
/** The turns' own model calls, without Spyglass's judge after each commit. */
const turnCalls = async () => (await loadGatewayCalls(t.db, sid)).filter((c) => c.purpose !== 'judge');

async function blocksInDb() {
  const r = await t.db.execute('SELECT * FROM blocks WHERE session_id = ?', [sid]);
  return r.rows.map(rowToBlock);
}

function scripted(text: string): ProviderAdapter {
  return { model: 'scripted', temperature: 1, complete: async () => ({ text, input_tokens: null, output_tokens: null, provider_request_id: null }) };
}

beforeAll(async () => {
  t = await tempDb();
  // These tests are of single mode (one call, operations in a fenced block); agent.test.ts has agent mode.
  loaded = { ...testLoaded(), config: { ...testLoaded().config, mode: 'single' } };
  deps = testDeps(t.db);
});
afterAll(() => t.cleanup());
beforeEach(async () => {
  const w = await newWorkspace(deps);
  sid = w.session.session_id;
  thread = w.thread;
  doc = w.doc;
  setupEvents = (await deps.events.list(sid)).length;
});
/** A line of the teacher's in the open doc, so the turn's changes are suggestions (a blank doc takes them straight in: blankDoc.test.ts). */
async function seeded() {
  const line = await typeLine(deps, sid, doc, thread);
  setupEvents = (await deps.events.list(sid)).length;
  return line;
}

describe('runTurn: a worksheet into the open doc', () => {
  it('proposes one block per insert and logs prompt, response, revisions and proposal_shown in order', async () => {
    const mine = await seeded();
    const r = await chat().runTurn(sid, input(WORKSHEET_PROMPT));
    if (!r.ok) throw new Error('expected ok');
    expect(r.operations).toHaveLength(N);
    expect(r.proposed_block_ids).toHaveLength(N);
    expect(r).toMatchObject({ dropped: 0, created_doc_ids: [] });
    // The teacher's line comes back too: it moved down.
    expect(r.changes.blocks.filter((b) => b.id !== mine.id)).toHaveLength(N);
    expect(r.changes.blocks[0]).not.toHaveProperty('origin');

    const all = await since();
    // Spyglass's flags come last, after the commit.
    expect(all.map((e) => e.kind)).toEqual(['chat_prompt', 'chat_response', ...Array(N).fill('block_revision'), 'proposal_shown', 'spyglass_shown']);
    expect(all.every((e) => e.doc_id === doc.id && e.thread_id === thread.id && e.focus_pane === 'chat')).toBe(true);
    const response = all[1]!;
    if (response.kind !== 'chat_response') throw new Error('unreachable');
    expect(response.payload.turn_id).toBe(r.turn_id);
    const shown = all.at(-2)!;
    if (shown.kind !== 'proposal_shown') throw new Error('unreachable');
    expect(shown.payload).toEqual({ turn_id: r.turn_id, block_ids: r.proposed_block_ids, doc_ids: [] });

    const stored = (await blocksInDb()).filter((b) => b.id !== mine.id);
    expect(stored).toHaveLength(N);
    expect(stored.every((b) => b.status === 'proposed' && b.origin === 'model' && b.origin_turn === r.turn_id && b.doc_id === doc.id)).toBe(true);

    const turns = await loadTurns(t.db, sid, thread.id);
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ prompt: WORKSHEET_PROMPT, thread_id: thread.id, doc_id: doc.id });
    expect(turns[0]!.rewritten_assistant_content).toContain(JSON.stringify(r.operations, null, 2));

    const [call] = await loadGatewayCalls(t.db, sid);
    expect(call).toMatchObject({ turn_id: r.turn_id, thread_id: thread.id, doc_id: doc.id, model: 'mock-model', temperature: 1, system_prompt_hash: loaded.system_prompt_hash, error: null, trimmed_history: [] });
    expect(call!.gateway_call_id).toBe(response.payload.gateway_call_id);
    expect(call!.serialized_canvas).toContain(`(id: ${doc.id}; open)`);
    // The request exactly as the provider was sent it: the system prompt, then the teacher's message wrapped with the docs.
    const sent = call!.request as { messages: { role: string; content: string }[] };
    expect(sent.messages[0]).toEqual({ role: 'system', content: loaded.system_prompt });
    expect(sent.messages.at(-1)!.content).toMatch(new RegExp(`^## Documents\\n[\\s\\S]*\\nTeacher: ${WORKSHEET_PROMPT.replace(/[.]/g, '\\.')}$`));

    expect(await chat().listTurns(sid, thread.id)).toEqual([{ turn_id: r.turn_id, doc_id: doc.id, prompt: WORKSHEET_PROMPT, anchor: null, response_text: r.message, attachments: [], at: turns[0]!.at }]);
    expect(await chat().errorCount(sid)).toBe(0);
  });

  it('leaves the thread Untitled: only the teacher names a chat', async () => {
    expect(thread.title).toBe(NEW_THREAD_TITLE);
    expect(NEW_THREAD_TITLE).toBe('Untitled');
    const r = await chat().runTurn(sid, input('Similes for P7\nwith pictures'));
    expect(r).toMatchObject({ ok: true });
    expect(r).not.toHaveProperty('thread_title');
    expect((await deps.threads.get(sid, thread.id))?.title).toBe('Untitled');
  });

  it('sends the first turn as history on the second', async () => {
    const svc = chat();
    const first = await svc.runTurn(sid, input(WORKSHEET_PROMPT));
    const second = await svc.runTurn(sid, input('What is the difference between them?'));
    if (!first.ok || !second.ok) throw new Error('expected ok');
    expect(second.operations).toEqual([]);
    const h = (await turnCalls())[1]!.trimmed_history;
    expect(h).toHaveLength(2);
    expect(h[0]).toEqual({ role: 'user', content: WORKSHEET_PROMPT });
    expect(h[1]!.content).toContain(first.message);
    expect(h[1]!.content).toContain('```json');
  });

  it('past max_turns, folds the oldest turns into a model-written summary in one go, keeping keep_turns verbatim', async () => {
    const svc = chat({ loaded: { ...loaded, config: { ...loaded.config, history: { max_turns: 3, keep_turns: 1, running_summary: true, summary: 'model' } } } });
    for (const q of ['q1?', 'q2?', 'q3?']) await svc.runTurn(sid, input(q));
    expect(await deps.threads.summaryState(thread.id)).toEqual({ summary: null, turns: null });
    // Four turns before this one: q1–q3 are folded, q4's turn goes verbatim.
    await svc.runTurn(sid, input('q4?'));
    await svc.runTurn(sid, input('q5?'));
    let state = await deps.threads.summaryState(thread.id);
    expect(state.turns).toBe(3);
    expect(state.summary).toMatch(/^## Teacher's goal/);
    expect(state.summary).toContain('- q1?\n- q2?\n- q3?');
    let calls = await loadGatewayCalls(t.db, sid);
    const summaryCall = calls.find((c) => c.purpose === 'summary')!;
    expect(summaryCall).toMatchObject({ running_summary: null, parsed_message: state.summary, error: null, serialized_canvas: '' });
    expect(summaryCall.turn_id).toBe(calls.at(-1)!.turn_id);
    const last = calls.at(-1)!;
    expect(last.running_summary).toBe(state.summary);
    expect(last.trimmed_history.filter((m) => m.role === 'user').map((m) => m.content)).toEqual(['q4?']);

    // The history now grows untouched until it is past max_turns again: no summary call for q6, q7.
    await svc.runTurn(sid, input('q6?'));
    await svc.runTurn(sid, input('q7?'));
    calls = await loadGatewayCalls(t.db, sid);
    expect(calls.filter((c) => c.purpose === 'summary')).toHaveLength(1);
    expect(calls.at(-1)!.trimmed_history.filter((m) => m.role === 'user').map((m) => m.content)).toEqual(['q4?', 'q5?', 'q6?']);
    // q8: q4–q6 are folded into the summary, updated from the last one.
    await svc.runTurn(sid, input('q8?'));
    state = await deps.threads.summaryState(thread.id);
    expect(state.turns).toBe(6);
    expect(state.summary).toContain('- q1?\n- q2?\n- q3?\n- q4?\n- q5?\n- q6?');
    const second = (await loadGatewayCalls(t.db, sid)).filter((c) => c.purpose === 'summary')[1]!;
    expect(second.trimmed_history[0]!.content).toContain('<summary>\n## Teacher');
  });

  it('`lines` folds one line a turn with no model call; a failed summary call falls back to lines and the turn goes ahead', async () => {
    const lines = chat({ loaded: { ...loaded, config: { ...loaded.config, history: { max_turns: 1, keep_turns: 0, running_summary: true, summary: 'lines' } } } });
    for (const q of ['first question?', 'second question?', 'third question?']) await lines.runTurn(sid, input(q));
    expect(await deps.threads.summaryState(thread.id)).toEqual({ summary: expect.stringMatching(/^Teacher asked: first question\?.*\nTeacher asked: second question\?/), turns: 2 });
    expect((await loadGatewayCalls(t.db, sid)).some((c) => c.purpose === 'summary')).toBe(false);

    const failing: ProviderAdapter = {
      ...new MockProvider('mock-model', 1),
      model: 'mock-model',
      temperature: 1,
      complete: async (messages, system) => {
        if (system.startsWith('You summarise')) throw new ProviderError('http', 'provider returned HTTP 500', 500);
        return new MockProvider('mock-model', 1).complete(messages, system);
      },
    };
    const model = chat({ provider: failing, loaded: { ...loaded, config: { ...loaded.config, history: { max_turns: 1, keep_turns: 0, running_summary: true, summary: 'model' } } } });
    await model.runTurn(sid, input('fourth question?'));
    const r = await model.runTurn(sid, input('fifth question?'));
    expect(r.ok).toBe(true);
    const state = await deps.threads.summaryState(thread.id);
    expect(state).toEqual({ summary: expect.stringContaining('Teacher asked: fourth question?'), turns: 4 });
    expect((await loadGatewayCalls(t.db, sid)).find((c) => c.purpose === 'summary')!.error).toBe('provider returned HTTP 500');
  });

  it('a thread summarised before summary_turns was kept carries on from where the old rule left it', async () => {
    const svc = chat({ loaded: { ...loaded, config: { ...loaded.config, history: { max_turns: 2, keep_turns: 1, running_summary: true, summary: 'lines' } } } });
    for (const q of ['a?', 'b?', 'c?', 'd?']) await svc.runTurn(sid, input(q));
    // As the old code left it after d?: a? folded (one turn a call), no count.
    await t.db.execute('UPDATE threads SET running_summary = ?, summary_turns = NULL WHERE id = ?', ['OLD', thread.id]);
    await svc.runTurn(sid, input('e?'));
    expect(await deps.threads.summaryState(thread.id)).toEqual({ summary: expect.stringMatching(/^OLD\nTeacher asked: b\?.*\nTeacher asked: c\?/), turns: 3 });
  });
});

describe('runTurn: Editing mode', () => {
  it('puts the changes straight into the doc as the assistant\'s, shows no suggestions and logs the mode', async () => {
    const r = await chat().runTurn(sid, input(WORKSHEET_PROMPT, { edit_mode: 'edit' }));
    if (!r.ok) throw new Error('expected ok');
    expect(r.proposed_block_ids).toEqual([]);
    const stored = await blocksInDb();
    expect(stored).toHaveLength(N);
    expect(stored.every((b) => b.status === 'live' && b.pending === null && b.origin === 'model')).toBe(true);
    const kinds = (await since()).map((e) => e.kind);
    expect(kinds).not.toContain('proposal_shown');
    expect(kinds).not.toContain('proposal_accept');
    expect((await deps.events.list(sid, { kinds: ['chat_prompt'] })).at(-1)!.payload).toMatchObject({ edit_mode: 'edit' });
    // The model is told, so it does not ask the teacher to accept.
    const sent = (await turnCalls()).at(-1)!.request as { messages: { content: string }[] };
    expect(sent.messages.at(-1)!.content).toContain('Editing mode');
    expect(sent.messages.at(-1)!.content).toContain('"revises_suggestion": true');
  });

  it('a suggested change to an existing block goes in as the assistant\'s revision', async () => {
    const env: ServerEnvelope = envelopeFor(doc, thread);
    const item = (await deps.canvas.structural(sid, { command: 'insert', doc_id: doc.id, after: 'start', type: 'paragraph', content: 'Her voice was like silk.' }, env)).block!;
    const r = await chat().runTurn(sid, input('Make this one easier', { anchor: { block_id: item.id, from: 0, to: 9, quote: 'Her voice' }, edit_mode: 'edit' }));
    if (!r.ok) throw new Error('expected ok');
    expect((await blocksInDb()).find((b) => b.id === item.id)).toMatchObject({ content: 'Her voice was like silk. (clearer version)', pending: null });
  });

  it('a change to a block with an earlier suggestion waiting stays a suggestion, shown as one', async () => {
    const env: ServerEnvelope = envelopeFor(doc, thread);
    const item = (await deps.canvas.structural(sid, { command: 'insert', doc_id: doc.id, after: 'start', type: 'paragraph', content: 'Her voice was like silk.' }, env)).block!;
    // An earlier turn, in Suggesting mode, left a change waiting on the block.
    await chat().runTurn(sid, input('Make this one easier', { anchor: { block_id: item.id, from: 0, to: 9, quote: 'Her voice' } }));
    const r = await chat().runTurn(sid, input('Make this one easier', { anchor: { block_id: item.id, from: 0, to: 9, quote: 'Her voice' }, edit_mode: 'edit' }));
    if (!r.ok) throw new Error('expected ok');
    expect((await blocksInDb()).find((b) => b.id === item.id)).toMatchObject({ content: 'Her voice was like silk.', pending: { op: 'replace' } });
    expect(r.proposed_block_ids).toEqual([item.id]);
    expect((await deps.events.list(sid, { kinds: ['proposal_shown'] })).at(-1)!.payload).toMatchObject({ turn_id: r.turn_id, block_ids: [item.id] });
  });

  it('Suggesting mode is the default, logged as such, and the model is told nothing new', async () => {
    await chat().runTurn(sid, input(WORKSHEET_PROMPT));
    expect((await deps.events.list(sid, { kinds: ['chat_prompt'] })).at(-1)!.payload).toMatchObject({ edit_mode: 'suggest' });
    const sent = (await turnCalls()).at(-1)!.request as { messages: { content: string }[] };
    expect(sent.messages.at(-1)!.content).not.toContain('Editing mode');
  });
});

describe('runTurn: thread scoping', () => {
  it('keeps each thread to its own docs and history', async () => {
    const other = await deps.threads.create(sid, envelopeFor(null, null));
    await chat().runTurn(sid, input(WORKSHEET_PROMPT));
    const r = await chat().runTurn(sid, input('Metaphors and similes for P7', { thread_id: other.thread.id, doc_id: other.doc.id }));
    if (!r.ok) throw new Error('expected ok');
    // The other thread's doc was empty to the model, so it got the worksheet too (straight in: the doc is blank).
    expect(r.operations).toHaveLength(N);
    const call = (await turnCalls()).at(-1)!;
    expect(call.serialized_canvas).not.toContain(doc.id);
    expect(call.trimmed_history).toEqual([]);
    expect(await chat().listTurns(sid, other.thread.id)).toHaveLength(1);
    expect(await chat().listTurns(sid, thread.id)).toHaveLength(1);
  });

  it('refuses a doc from another thread, an unknown thread and an anchor outside the thread, logging nothing', async () => {
    const other = await deps.threads.create(sid, envelopeFor(null, null));
    const otherBlock = (await deps.canvas.structural(sid, { command: 'insert', doc_id: other.doc.id, after: 'start', type: 'paragraph', content: 'x' }, envelopeFor(other.doc, other.thread))).block!;
    const before = (await deps.events.list(sid)).length;
    await expect(chat().runTurn(sid, input('hi', { doc_id: other.doc.id }))).rejects.toMatchObject({ statusCode: 409 });
    await expect(chat().runTurn(sid, input('hi', { thread_id: newUlid() }))).rejects.toMatchObject({ statusCode: 404 });
    await expect(chat().runTurn(sid, input('hi', { anchor: { block_id: otherBlock.id, from: null, to: null, quote: null } }))).rejects.toMatchObject({ statusCode: 409 });
    expect(await deps.events.list(sid)).toHaveLength(before);
  });

  it('a model-created doc belongs to the thread and is logged with doc_create', async () => {
    await chat().runTurn(sid, input(WORKSHEET_PROMPT));
    const r = await chat().runTurn(sid, input('Can you put a simpler version in a new document?'));
    if (!r.ok) throw new Error('expected ok');
    expect(r.created_doc_ids).toHaveLength(1);
    const created = r.changes.docs.find((d) => d.id === r.created_doc_ids[0])!;
    expect(created).toMatchObject({ thread_id: thread.id, name: 'Simpler version', created_by: 'model' });
    const kinds = (await since()).map((e) => e.kind);
    expect(kinds.filter((k) => k !== 'spyglass_shown').at(-2)).toBe('doc_create');
    const shown = (await deps.events.list(sid, { kinds: ['proposal_shown'] })).at(-1)!;
    expect(shown.payload).toMatchObject({ doc_ids: r.created_doc_ids });
    // In the order the reply lists them: title first, then the list a block per item.
    expect((await blocksInDb()).filter((b) => b.doc_id === created.id).sort((x, y) => x.order - y.order).map((b) => b.type)).toEqual(['heading', 'bullet_item', 'bullet_item']);
  });
});

describe('runTurn: drawings', () => {
  it('saves a drawing as a cleaned SVG picture, and the block points at it; a broken one is dropped', async () => {
    const sun = '<svg viewBox="0 0 100 100"><title>A sun</title><circle cx="50" cy="50" r="30" fill="#fc0" onclick="x()"/></svg>';
    const ops = [
      { op: 'insert', after: 'start', type: 'image', content: sun },
      { op: 'insert', after: 'start', type: 'image', content: '<svg viewBox="0 0 10 10"><circle' },
    ];
    const r = await chat({ provider: scripted(`Here is a sun.\n\n\`\`\`json\n${JSON.stringify(ops)}\n\`\`\``) }).runTurn(sid, input('Add a picture of a sun'));
    if (!r.ok) throw new Error('expected ok');
    expect(r.dropped).toBe(1);
    const img = (await blocksInDb()).find((b) => b.type === 'image')!;
    const m = /^!\[A sun\]\(asset:(ast_\w+)\)$/.exec(img.content);
    expect(m).not.toBeNull();
    const stored = await t.db.execute('SELECT mime, data FROM assets WHERE asset_id = ?', [m![1]!]);
    expect(stored.rows[0]!.mime).toBe('image/svg+xml');
    const svg = Buffer.from(stored.rows[0]!.data as ArrayBuffer).toString('utf8');
    expect(svg).toMatch(/^<svg width="100" height="100" xmlns=/);
    expect(svg).not.toContain('onclick');
    const up = (await deps.events.list(sid, { kinds: ['asset_upload'] })).at(-1)!;
    expect(up.payload).toMatchObject({ asset_id: m![1], mime: 'image/svg+xml', filename: 'A sun.svg', turn_id: r.turn_id });
    // What was logged and replayed names the picture, not the drawing.
    const resp = (await deps.events.list(sid, { kinds: ['chat_response'] })).at(-1)!;
    expect(JSON.stringify(resp.payload)).not.toContain('<svg');
  });
});

describe('runTurn: @model comments', () => {
  it('logs the anchor, and the mock answers with a replace on that block', async () => {
    const env: ServerEnvelope = envelopeFor(doc, thread);
    const item = (await deps.canvas.structural(sid, { command: 'insert', doc_id: doc.id, after: 'start', type: 'paragraph', content: 'Her voice was like silk.' }, env)).block!;
    const anchor = { block_id: item.id, from: 0, to: 9, quote: 'Her voice' };
    const r = await chat().runTurn(sid, input('Make this one easier', { anchor }));
    if (!r.ok) throw new Error('expected ok');
    expect(r.proposed_block_ids).toEqual([item.id]);
    expect((await blocksInDb()).find((b) => b.id === item.id)!.pending).toMatchObject({ op: 'replace', content: 'Her voice was like silk. (clearer version)' });
    expect((await deps.events.list(sid, { kinds: ['chat_prompt'] })).at(-1)!.payload).toMatchObject({ text: 'Make this one easier', anchor });
    expect((await chat().listTurns(sid, thread.id)).at(-1)?.anchor).toEqual(anchor);
  });

  it('changes a suggestion not yet accepted: the anchor is allowed, the model sees it marked, and it stays a suggestion', async () => {
    await seeded();
    const first = await chat().runTurn(sid, input(WORKSHEET_PROMPT));
    if (!first.ok) throw new Error('expected ok');
    const target = (await blocksInDb()).find((b) => b.id === first.proposed_block_ids[1])!;
    expect(target.status).toBe('proposed');
    const anchor = { block_id: target.id, from: 0, to: 5, quote: target.content.slice(0, 5) };
    const r = await chat().runTurn(sid, input('remove icons', { anchor }));
    if (!r.ok) throw new Error(`expected ok, got ${r.message}`);
    // The model was shown its suggestions, marked as such.
    const call = (await turnCalls()).at(-1)!;
    expect(call.serialized_canvas).toContain(`[id=${target.id}] [type=${target.type}] [suggested] `);
    // Its replace rewrote the suggestion in place: still proposed, no pending change stacked on it.
    const after = (await blocksInDb()).find((b) => b.id === target.id)!;
    expect(after).toMatchObject({ status: 'proposed', pending: null, content: `${target.content} (clearer version)` });
    expect(r.proposed_block_ids).toEqual([target.id]);
  });

  it('a turn without an anchor stores and logs anchor null', async () => {
    await chat().runTurn(sid, input('What is a simile?'));
    expect((await loadTurns(t.db, sid)).at(-1)?.anchor).toBeNull();
    expect(((await deps.events.list(sid, { kinds: ['chat_prompt'] })).at(-1)!.payload as { anchor?: unknown }).anchor).toBeNull();
  });
});

describe('runTurn: streaming', () => {
  it('hands on the raw reply as it streams and stores the same turn as a plain call', async () => {
    const deltas: string[] = [];
    await seeded();
    const r = await chat().runTurn(sid, input(WORKSHEET_PROMPT), { onText: (d) => deltas.push(d) });
    if (!r.ok) throw new Error('expected ok');
    expect(deltas.length).toBeGreaterThan(10);
    const raw = deltas.join('');
    expect(raw).toContain(r.message);
    expect(raw).toContain('```json');
    expect((await loadGatewayCalls(t.db, sid))[0]!.raw_response).toBe(raw);
    expect(r.proposed_block_ids).toHaveLength(N);
  });

  it('falls back to a plain call when the provider refuses to stream', async () => {
    const refusing: ProviderAdapter = {
      ...scripted('Hello.'),
      stream: async () => {
        throw new ProviderError('http', 'provider returned HTTP 400: stream not supported', 400);
      },
    };
    const deltas: string[] = [];
    const r = await chat({ provider: refusing }).runTurn(sid, input('hi'), { onText: (d) => deltas.push(d) });
    expect(r).toMatchObject({ ok: true, message: 'Hello.' });
    expect(deltas).toEqual(['Hello.']);
  });
});

describe('runTurn: Stop', () => {
  it('a closed stream stops the streamed reply: the message so far is returned, nothing applied', async () => {
    const closed = new AbortController();
    const deltas: string[] = [];
    const r = await chat({ provider: new MockProvider('mock-model', 1, 1) }).runTurn(sid, input(WORKSHEET_PROMPT), {
      signal: closed.signal,
      onText: (d) => {
        deltas.push(d);
        if (deltas.length === 3) closed.abort();
      },
    });
    expect(r).toMatchObject({ ok: false, stopped: true, message: 'Stopped' });
    if (r.ok) throw new Error('unreachable');
    expect(deltas.join('')).toContain(r.reply!);
    expect(await blocksInDb()).toEqual([]);
    expect(await loadTurns(t.db, sid)).toEqual([]);
    expect((await loadGatewayCalls(t.db, sid))[0]!.error).toBe('the request was stopped');
  });
});

describe('runTurn: failures', () => {
  it('a provider error yields ok:false, an error event and a failed gateway call, and no doc or history change', async () => {
    const broken: ProviderAdapter = {
      model: 'broken',
      temperature: 1,
      complete: async () => {
        throw new ProviderError('timeout', 'provider timed out after 60000 ms');
      },
    };
    const r = await chat({ provider: broken }).runTurn(sid, input(WORKSHEET_PROMPT));
    expect(r).toEqual({ ok: false, turn_id: expect.any(String), message: TURN_FAILED_MESSAGE, reply: null });
    const all = await since();
    expect(all.map((e) => e.kind)).toEqual(['chat_prompt', 'error']);
    expect(all[1]!.payload).toEqual({ source: 'provider', message: 'provider timed out after 60000 ms' });
    expect((await loadGatewayCalls(t.db, sid))[0]).toMatchObject({ error: 'provider timed out after 60000 ms', raw_response: null, model: 'broken' });
    expect(await blocksInDb()).toEqual([]);
    expect(await loadTurns(t.db, sid)).toEqual([]);
    expect((await deps.threads.get(sid, thread.id))?.title).toBe(NEW_THREAD_TITLE);
    expect(await chat().errorCount(sid)).toBe(1);
  });

  it('unparseable output is a server error; the reply text is still returned and logged', async () => {
    const r = await chat({ provider: scripted('Here is your worksheet.\n\n```json\n[{"op": "insert", \n```') }).runTurn(sid, input(WORKSHEET_PROMPT));
    expect(r).toMatchObject({ ok: false, message: TURN_FAILED_MESSAGE, reply: 'Here is your worksheet.' });
    const all = await since();
    expect(all.map((e) => e.kind)).toEqual(['chat_prompt', 'chat_response', 'error']);
    expect(all[2]!.payload).toMatchObject({ source: 'server' });
    expect((await loadGatewayCalls(t.db, sid))[0]!.error).toMatch(/unparseable/);
    expect(await blocksInDb()).toEqual([]);
  });

  it('drops operations that do not validate and still applies the rest', async () => {
    await seeded();
    const r = await chat({
      provider: scripted(
        'Done.\n\n```json\n[{"op":"delete","id":"01HXXXXXXXXXXXXXXXXXXXXXXX"},{"op":"insert","after":"start","type":"paragraph","content":"Hi"},{"op":"insert","doc":"01HYYYYYYYYYYYYYYYYYYYYYYY","after":"start","type":"paragraph","content":"x"}]\n```',
      ),
    }).runTurn(sid, input('go'));
    if (!r.ok) throw new Error('expected ok');
    expect(r.dropped).toBe(2);
    expect(r.proposed_block_ids).toHaveLength(1);
    expect((await loadGatewayCalls(t.db, sid))[0]!.dropped.map((d) => d.reason)).toEqual(['unknown_block_id', 'unknown_doc']);
  });
});
