import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ProviderAdapter } from '@edw/shared';
import { MAKE_DESIGNS_PER_HOUR } from '@edw/shared';
import { buildApp } from '../app.js';
import { MockProvider } from '../gateway/mock.js';
import type { CanvasServiceImpl } from '../blocks/service.js';
import type { AppDeps, SessionRow } from '../deps.js';
import { buildBundle } from '../export/bundle.js';
import { newWorkspace, tempDb, testDeps, type TempDb } from '../test-helpers.js';

let t: TempDb;
let deps: AppDeps & { canvas: CanvasServiceImpl };
let app: FastifyInstance;
let s: SessionRow;
let other: SessionRow;
let reply: string | Error;

const envelope = { client_ts: '2026-11-02T09:00:00.000Z', focus_pane: 'none', doc_id: null, thread_id: null };
const auth = (x: SessionRow = s) => ({ authorization: `Bearer ${x.participant_token}` });
const url = (path = '', x: SessionRow = s) => `/api/sessions/${x.session_id}/make${path}`;
const board = { placed: [{ uid: 'u1', id: 'ask', zone: 'chat' }], ideas: [], feedback: { 'Sidebar › New chat': { verdict: 'dislike', comment: 'Hard to find', at: '2026-11-02T09:00:00.000Z' } } };
const OPTIONS = JSON.stringify({
  understood: 'You want it read aloud.',
  question: null,
  options: [{ title: 'Read aloud', zone: 'toolbar', pill: '🔊 Read', parts: [{ type: 'heading', text: 'Read aloud' }], fit: { toolbar: { ok: true, why: 'an action' } } }],
});

beforeEach(async () => {
  t = await tempDb();
  reply = OPTIONS;
  const provider: ProviderAdapter = {
    model: 'scripted',
    temperature: 1,
    complete: async () => {
      if (reply instanceof Error) throw reply;
      return { text: reply, input_tokens: 10, output_tokens: 20, provider_request_id: 'r1' };
    },
  } as ProviderAdapter;
  deps = testDeps(t.db, provider);
  app = await buildApp(deps);
  await app.ready();
  s = (await newWorkspace(deps)).session;
  other = (await newWorkspace(deps, 'B')).session;
});
afterEach(async () => {
  await app.close();
  t.cleanup();
});

describe('make kit', () => {
  it('starts empty, saves the board and logs each action', async () => {
    expect((await app.inject({ url: url(), headers: auth() })).json()).toEqual({ board: { placed: [], ideas: [], feedback: {} }, updated_at: null });
    const actions = [
      { action: { action: 'place', card: 'ask', zone: 'chat' }, client_ts: '2026-11-02T09:00:01.000Z' },
      { action: { action: 'feedback', target: 'Sidebar › New chat', verdict: 'dislike', comment: 'Hard to find' }, client_ts: '2026-11-02T09:00:02.000Z' },
    ];
    const saved = await app.inject({ method: 'PUT', url: url(), headers: auth(), payload: { board, actions, envelope } });
    expect(saved.statusCode).toBe(200);
    expect((await app.inject({ url: url(), headers: auth() })).json()).toMatchObject({ board, updated_at: expect.any(String) });
    const logged = await deps.events.list(s.session_id, { kinds: ['make_action'] });
    expect(logged.map((e) => e.payload)).toEqual(actions);
    // Saving again replaces the board.
    await app.inject({ method: 'PUT', url: url(), headers: auth(), payload: { board: { ...board, placed: [] }, actions: [], envelope } });
    expect((await app.inject({ url: url(), headers: auth() })).json().board.placed).toEqual([]);
  });

  it('opens the kit without counting it as an open of the workspace', async () => {
    const r = await app.inject({ url: '/api/participant?open=0', headers: auth() });
    expect(r.json()).toEqual({ session_id: s.session_id });
    expect(await deps.events.list(s.session_id, { kinds: ['participant_open'] })).toEqual([]);
    expect((await deps.sessions.get(s.session_id))!.first_opened_at).toBeNull();
  });

  it('refuses a bad board and another workspace’s token', async () => {
    const bad = await app.inject({ method: 'PUT', url: url(), headers: auth(), payload: { board: { ...board, placed: [{ uid: 'u', id: 'ask', zone: 'roof' }] }, actions: [], envelope } });
    expect(bad.statusCode).toBe(400);
    expect((await app.inject({ url: url('', s), headers: auth(other) })).statusCode).toBe(403);
  });

  it('designs one option with the model, logging the call', async () => {
    const r = await app.inject({ method: 'POST', url: url('/design'), headers: auth(), payload: { text: 'Read the worksheet aloud', envelope } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ understood: 'You want it read aloud.', options: [{ title: 'Read aloud', zone: 'toolbar' }] });
    const [e] = await deps.events.list(s.session_id, { kinds: ['make_design'] });
    expect(e!.payload).toMatchObject({ text: 'Read the worksheet aloud', feedback: null, model: 'scripted', input_tokens: 10, error: null, result: { options: [{ title: 'Read aloud' }] } });
  });

  it('says so when the model fails or replies with nothing usable, and logs it', async () => {
    reply = 'Sorry, no.';
    expect((await app.inject({ method: 'POST', url: url('/design'), headers: auth(), payload: { text: 'x', envelope } })).statusCode).toBe(502);
    reply = new Error('provider down');
    const r = await app.inject({ method: 'POST', url: url('/design'), headers: auth(), payload: { text: 'x', envelope } });
    expect(r.statusCode).toBe(502);
    expect(r.json().error).toContain('did not work');
    const logged = await deps.events.list(s.session_id, { kinds: ['make_design'] });
    expect(logged.map((e) => (e.payload as { error: string }).error)).toEqual(['the reply held no usable design', 'provider down']);
  });

  it('limits designs per hour', async () => {
    for (let i = 0; i < MAKE_DESIGNS_PER_HOUR; i++) await deps.events.appendServer(s.session_id, 'make_design', { text: 'x', feedback: null, result: null, model: 'm', system_prompt_hash: 'h', latency_ms: 1, at: new Date().toISOString(), input_tokens: null, output_tokens: null, provider_request_id: null, error: null }, envelope as never);
    expect((await app.inject({ method: 'POST', url: url('/design'), headers: auth(), payload: { text: 'x', envelope } })).statusCode).toBe(429);
  });

  it('exports the board and deletes it with the workspace', async () => {
    await app.inject({ method: 'PUT', url: url(), headers: auth(), payload: { board, actions: [], envelope } });
    const { files } = await buildBundle(deps, s.session_id);
    expect(JSON.parse(files['make_board.json'] as string)).toMatchObject({ board });
    await deps.sessions.delete(s.session_id);
    expect((await deps.db.execute('SELECT COUNT(*) AS n FROM make_boards')).rows[0]!.n).toBe(0);
  });

  it('designs offline with the mock provider', async () => {
    const mock = testDeps(t.db, new MockProvider('mock-model', 1));
    const mockApp = await buildApp(mock);
    const r = await mockApp.inject({ method: 'POST', url: url('/design'), headers: auth(), payload: { text: 'Read the worksheet aloud', envelope } });
    expect(r.json().options.map((o: { zone: string }) => o.zone)).toEqual(['margin']);
    await mockApp.close();
  });
});
