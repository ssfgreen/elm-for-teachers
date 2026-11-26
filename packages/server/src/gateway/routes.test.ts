import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Doc, SpyglassResult, Thread } from '@edw/shared';
import type { SessionRow } from '../deps.js';
import { newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { registerChatRoutes } from './routes.js';
import { TURN_FAILED_MESSAGE, type ChatService, type TurnInput, type TurnResult } from './service.js';

const calls: { sessionId: string; input: TurnInput }[] = [];
let next: TurnResult;
/** Spyglass's flags for the fake turn to report after its result (null: none). */
let flags: SpyglassResult | null = null;
const TURNS = [{ turn_id: 't_1', doc_id: 'D', prompt: 'hi', anchor: null, response_text: 'hello', attachments: [], at: '2026-10-29T12:00:00.000Z' }];
const USAGE = { input_tokens: 1200, output_tokens: 300, gbp: 0.005 };
const chat: ChatService = {
  async runTurn(sessionId, input, opts) {
    calls.push({ sessionId, input });
    opts?.onStart?.('t_1');
    opts?.onText?.('Hel');
    opts?.onText?.('lo');
    opts?.onState?.({ text: 'Hello', operations: [], status: null, steps: [] });
    if (flags && next.ok) {
      opts?.onResult?.(next);
      opts?.onSpyglass?.('t_1', flags);
    }
    return next;
  },
  async listTurns() {
    return TURNS;
  },
  async usage() {
    return USAGE;
  },
  async errorCount() {
    return 0;
  },
};

const envelope = { client_ts: '2026-10-29T12:00:00.000Z', focus_pane: 'chat' };
let t: TempDb;
let deps: ReturnType<typeof testDeps>;
let app: FastifyInstance;
let s1: { session: SessionRow; thread: Thread; doc: Doc };
let s2: { session: SessionRow; thread: Thread; doc: Doc };

beforeAll(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  s1 = await newWorkspace(deps, 'A');
  s2 = await newWorkspace(deps, 'B');
  app = Fastify();
  registerChatRoutes(app, deps, chat);
  await app.ready();
});
afterAll(async () => {
  await app.close();
  t.cleanup();
});
beforeEach(() => {
  calls.length = 0;
  flags = null;
  next = {
    ok: true,
    turn_id: 't_1',
    message: 'ok',
    operations: [],
    dropped: 0,
    changes: { blocks: [], docs: [], revisions: [] },
    proposed_block_ids: [],
    created_doc_ids: [],
  };
});

const url = (w = s1) => `/api/sessions/${w.session.session_id}/threads/${w.thread.id}/chat`;
const post = (body: Record<string, unknown>, token = s1.session.participant_token, w = s1) =>
  app.inject({ method: 'POST', url: url(w), headers: { authorization: `Bearer ${token}` }, payload: { doc_id: w.doc.id, envelope, ...body } });

describe('POST /api/sessions/:id/threads/:threadId/chat', () => {
  it('runs a turn in the thread on the open doc and returns its result', async () => {
    const res = await post({ text: 'Make a worksheet' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(next);
    expect(calls).toEqual([{ sessionId: s1.session.session_id, input: { thread_id: s1.thread.id, doc_id: s1.doc.id, text: 'Make a worksheet', envelope, anchor: undefined } }]);
  });

  it('returns a provider failure as 200 with ok:false', async () => {
    next = { ok: false, turn_id: 't_2', message: TURN_FAILED_MESSAGE, reply: null };
    const res = await post({ text: 'hi' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(next);
  });

  it('rejects empty, blank and over-long text, and a missing doc or envelope, with 400', async () => {
    expect((await post({ text: '' })).statusCode).toBe(400);
    expect((await post({ text: '   ' })).statusCode).toBe(400);
    expect((await post({ text: 'x'.repeat(4001) })).statusCode).toBe(400);
    expect((await post({ text: 'x'.repeat(4000) })).statusCode).toBe(200);
    expect((await post({ text: 'hi', envelope: undefined })).statusCode).toBe(400);
    expect((await post({ text: 'hi', doc_id: 'nope' })).statusCode).toBe(400);
    expect(calls).toHaveLength(1);
  });

  it("rejects another session's token with 403 and a missing or unknown token with 401", async () => {
    expect((await post({ text: 'hi' }, s2.session.participant_token)).statusCode).toBe(403);
    expect((await post({ text: 'hi' }, 'nope')).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: url(), payload: { text: 'hi', doc_id: s1.doc.id, envelope } })).statusCode).toBe(401);
    expect(calls).toHaveLength(0);
  });
});

describe('POST /api/sessions/:id/threads/:threadId/chat/stream', () => {
  it('streams the text deltas (single mode) or reply states (agent mode), then the result, as NDJSON', async () => {
    const res = await app.inject({ method: 'POST', url: `${url()}/stream`, headers: { authorization: `Bearer ${s1.session.participant_token}` }, payload: { text: 'hi', doc_id: s1.doc.id, envelope } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/x-ndjson/);
    expect(res.body.trim().split('\n').map((l) => JSON.parse(l))).toEqual([
      { type: 'start', turn_id: 't_1' },
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
      { type: 'state', text: 'Hello', operations: [], status: null, steps: [] },
      { type: 'result', result: next },
    ]);
  });

  it("sends Spyglass's flags after the result, and passes the teacher's toggle to the turn", async () => {
    flags = { flags: [{ check: 'scope', label: 'changed', block_ids: ['b1'], title: 'Answer 6 changed', why: 'Now Simile.' }], others: 0, by: 'judge' };
    const res = await app.inject({ method: 'POST', url: `${url()}/stream`, headers: { authorization: `Bearer ${s1.session.participant_token}` }, payload: { text: 'hi', doc_id: s1.doc.id, envelope, spyglass: false } });
    const lines = res.body.trim().split('\n').map((l) => JSON.parse(l) as { type: string });
    expect(lines.slice(-2)).toEqual([{ type: 'result', result: next }, { type: 'spyglass', turn_id: 't_1', spyglass: flags }]);
    expect(calls[0]!.input.spyglass).toBe(false);
  });

  it('refuses a bad body or token with an ordinary error before streaming', async () => {
    const bad = await app.inject({ method: 'POST', url: `${url()}/stream`, headers: { authorization: `Bearer ${s1.session.participant_token}` }, payload: { text: '', doc_id: s1.doc.id, envelope } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toHaveProperty('error');
    expect((await app.inject({ method: 'POST', url: `${url()}/stream`, payload: { text: 'hi', doc_id: s1.doc.id, envelope } })).statusCode).toBe(401);
  });
});

describe('POST /api/sessions/:id/threads/:threadId/chat/stop', () => {
  it('logs chat_stop with what the teacher saw, in the thread', async () => {
    const stop = (payload: Record<string, unknown>, w = s1) =>
      app.inject({ method: 'POST', url: `${url(w)}/stop`, headers: { authorization: `Bearer ${w.session.participant_token}` }, payload });
    const res = await stop({ turn_id: 't_9', shown_text: 'Here is', envelope: { ...envelope, doc_id: s1.doc.id, thread_id: null } });
    expect(res.statusCode).toBe(204);
    const ev = (await deps.events.list(s1.session.session_id, { kinds: ['chat_stop'] })).at(-1)!;
    expect(ev).toMatchObject({ payload: { turn_id: 't_9', shown_text: 'Here is' }, thread_id: s1.thread.id, doc_id: s1.doc.id });
    expect((await stop({ turn_id: 't_9', envelope: { ...envelope, doc_id: null, thread_id: null } })).statusCode).toBe(400);
  });
});

describe('GET /api/sessions/:id/threads/:threadId/chat', () => {
  it("lists the thread's turns, with the token in the query", async () => {
    const res = await app.inject({ method: 'GET', url: `${url()}?token=${s1.session.participant_token}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ turns: TURNS });
  });

  it('404s for a thread of another session', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/sessions/${s1.session.session_id}/threads/${s2.thread.id}/chat?token=${s1.session.participant_token}` });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/sessions/:id/threads/:threadId/chat/usage', () => {
  it("gives the thread's tokens and cost", async () => {
    const res = await app.inject({ method: 'GET', url: `${url()}/usage?token=${s1.session.participant_token}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(USAGE);
  });

  it('404s for a thread of another session', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/sessions/${s1.session.session_id}/threads/${s2.thread.id}/chat/usage?token=${s1.session.participant_token}` });
    expect(res.statusCode).toBe(404);
  });
});
