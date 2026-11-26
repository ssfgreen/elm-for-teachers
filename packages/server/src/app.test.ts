import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { modelChoices, newUlid, type ClientEvent, type Doc, type Thread } from '@edw/shared';
import { buildApp } from './app.js';
import { saveAsset } from './assets/store.js';
import type { CanvasServiceImpl } from './blocks/service.js';
import type { AppDeps, SessionRow } from './deps.js';
import { ADMIN_PASSWORD, envelopeFor, focusEvent, tempDb, testDeps, testLoaded, typeLine, type TempDb } from './test-helpers.js';

const adminAuth = { authorization: `Bearer ${ADMIN_PASSWORD}` };
let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;

beforeEach(async () => {
  t = await tempDb();
  deps = testDeps(t.db);
  app = await buildApp(deps);
  await app.ready();
});
afterEach(async () => {
  await app.close();
  t.cleanup();
});

async function createSession(label = 'Year 7 English'): Promise<{ session: SessionRow; participant_url: string }> {
  const res = await app.inject({ method: 'POST', url: '/api/admin/sessions', headers: adminAuth, payload: { label } });
  expect(res.statusCode).toBe(201);
  return res.json();
}
const asParticipant = (s: SessionRow) => ({ authorization: `Bearer ${s.participant_token}` });
const batch = (s: SessionRow, events: ClientEvent[]) => ({ session_id: s.session_id, events });
const envelope = (doc: Doc | null = null, thread: Thread | null = null) => ({
  client_ts: new Date().toISOString(),
  focus_pane: 'canvas',
  doc_id: doc?.id ?? null,
  thread_id: thread?.id ?? null,
});
async function workspace(s: SessionRow): Promise<{ thread: Thread; doc: Doc }> {
  const threads = (await app.inject({ url: `/api/sessions/${s.session_id}/threads`, headers: asParticipant(s) })).json().threads as Thread[];
  const docs = (await app.inject({ url: `/api/sessions/${s.session_id}/canvas`, headers: asParticipant(s) })).json().docs as Doc[];
  return { thread: threads[0]!, doc: docs.find((d) => d.thread_id === threads[0]!.id)! };
}

describe('health and CORS', () => {
  it('serves health and answers preflight', async () => {
    const health = await app.inject('/api/health');
    expect(health.json()).toMatchObject({ ok: true, provider: 'mock' });
    expect(health.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(health.headers['referrer-policy']).toBe('no-referrer');
    const pre = await app.inject({ method: 'OPTIONS', url: '/api/sessions/x/events' });
    expect(pre.statusCode).toBe(204);
    expect(pre.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(String(pre.headers['access-control-allow-headers'])).toMatch(/Authorization/);
    const nf = await app.inject('/api/nope');
    expect(nf.statusCode).toBe(404);
    expect(nf.json()).toHaveProperty('error');
  });
});

describe('participant links', () => {
  it('uses PUBLIC_BASE_URL when it is set', async () => {
    const { session, participant_url } = await createSession();
    expect(participant_url).toBe(`http://localhost:5173/s/${session.participant_token}`);
  });

  it('follows the request origin when PUBLIC_BASE_URL is unset, and forwarded headers behind a proxy', async () => {
    const bare = await buildApp({ ...deps, env: { ...deps.env, PUBLIC_BASE_URL: undefined } });
    await bare.ready();
    try {
      const created = await bare.inject({ method: 'POST', url: '/api/admin/sessions', headers: { ...adminAuth, host: 'study.lan:3000' }, payload: { label: 'A' } });
      const { session, participant_url } = created.json();
      expect(participant_url).toBe(`http://study.lan:3000/s/${session.participant_token}`);
      const list = await bare.inject({
        url: '/api/admin/sessions',
        headers: { ...adminAuth, host: 'internal:3000', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'tool.example.org' },
      });
      expect(list.json().sessions[0].participant_url).toBe(`https://tool.example.org/s/${session.participant_token}`);
      // Same-origin client: no CORS header is sent.
      const pre = await bare.inject({ method: 'OPTIONS', url: '/api/sessions/x/events' });
      expect(pre.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await bare.close();
    }
  });
});

describe('admin routes', () => {
  it('require the admin password', async () => {
    expect((await app.inject({ url: '/api/admin/sessions' })).statusCode).toBe(401);
    const bad = await app.inject({ url: '/api/admin/sessions', headers: { authorization: 'Bearer nope' } });
    expect(bad.statusCode).toBe(401);
    expect(bad.json()).toHaveProperty('error');
    expect((await app.inject({ method: 'POST', url: '/api/admin/sessions', payload: { label: 'x' } })).statusCode).toBe(401);
  });

  it('create and list sessions, and validate the label', async () => {
    const { session } = await createSession();
    expect(session).toMatchObject({ label: 'Year 7 English', first_opened_at: null });
    const list = (await app.inject({ url: '/api/admin/sessions', headers: adminAuth })).json().sessions;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ session_id: session.session_id, participant_url: expect.stringContaining(session.participant_token) });
    expect((await app.inject({ method: 'POST', url: '/api/admin/sessions', headers: adminAuth, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/admin/sessions', headers: adminAuth, payload: { label: '  ' } })).statusCode).toBe(400);
  });

  it('rename a session, validating the label', async () => {
    const { session } = await createSession('test');
    const url = `/api/admin/sessions/${session.session_id}`;
    expect((await app.inject({ method: 'PATCH', url, payload: { label: 'P01' } })).statusCode).toBe(401);
    const res = await app.inject({ method: 'PATCH', url, headers: adminAuth, payload: { label: '  P01 ' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ session: { session_id: session.session_id, label: 'P01', participant_token: session.participant_token }, participant_url: expect.stringContaining(session.participant_token) });
    expect((await deps.sessions.get(session.session_id))?.label).toBe('P01');
    expect((await app.inject({ method: 'PATCH', url, headers: adminAuth, payload: { label: ' ' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: '/api/admin/sessions/nope', headers: adminAuth, payload: { label: 'x' } })).statusCode).toBe(404);
  });

  it('delete a session with all its data and bucket images, leaving other sessions alone', async () => {
    const deleted: string[] = [];
    await app.close();
    deps = {
      ...deps,
      bucket: { presignPut: () => '', presignGet: () => '', head: async () => null, delete: async (key) => void deleted.push(key) },
    };
    app = await buildApp(deps);
    await app.ready();

    const { session: s } = await createSession();
    const { session: other } = await createSession('B');
    const { thread, doc } = await workspace(s);
    const blocks = (command: string, body: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/blocks/${command}`, headers: asParticipant(s), payload: { envelope: envelope(doc, thread), ...body } });
    expect((await blocks('insert', { doc_id: doc.id, after: 'start', type: 'paragraph', content: 'Hello' })).statusCode).toBe(200);
    const chat = await app.inject({
      method: 'POST',
      url: `/api/sessions/${s.session_id}/threads/${thread.id}/chat`,
      headers: asParticipant(s),
      payload: { text: 'Make a worksheet on similes', doc_id: doc.id, envelope: { client_ts: new Date().toISOString(), focus_pane: 'chat' } },
    });
    expect(chat.statusCode).toBe(200);
    const now = new Date().toISOString();
    await saveAsset(t.db.client, { asset_id: 'ast_bucket', session_id: s.session_id, mime: 'image/png', bytes: 1, filename: null, data: null, storage: 'bucket', created_at: now });
    await saveAsset(t.db.client, { asset_id: 'ast_db', session_id: s.session_id, mime: 'image/png', bytes: 1, filename: null, data: Buffer.from([1]), created_at: now });

    const tables = ['threads', 'docs', 'blocks', 'events', 'chat_turns', 'gateway_calls', 'assets'];
    const count = async (sessionId: string) => {
      const n: Record<string, number> = {};
      for (const table of tables) n[table] = Number((await t.db.execute(`SELECT COUNT(*) AS n FROM ${table} WHERE session_id = ?`, [sessionId])).rows[0]!.n);
      return n;
    };
    expect(Object.values(await count(s.session_id)).every((n) => n > 0)).toBe(true);
    const otherBefore = await count(other.session_id);

    const url = `/api/admin/sessions/${s.session_id}`;
    expect((await app.inject({ method: 'DELETE', url })).statusCode).toBe(401);
    expect((await app.inject({ method: 'DELETE', url, headers: adminAuth })).statusCode).toBe(204);

    expect(Object.values(await count(s.session_id)).every((n) => n === 0)).toBe(true);
    expect(Number((await t.db.execute('SELECT COUNT(*) AS n FROM block_revisions WHERE block_id NOT IN (SELECT id FROM blocks)')).rows[0]!.n)).toBe(0);
    expect(deleted).toEqual([`sessions/${s.session_id}/ast_bucket`]);
    expect(await count(other.session_id)).toEqual(otherBefore);
    const list = (await app.inject({ url: '/api/admin/sessions', headers: adminAuth })).json().sessions;
    expect(list.map((x: SessionRow) => x.session_id)).toEqual([other.session_id]);
    expect((await app.inject({ url: `/api/participant?token=${s.participant_token}` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'DELETE', url, headers: adminAuth })).statusCode).toBe(404);
  });
});

describe('participant routes', () => {
  it('resolve the link token, record the open, and fetch the session', async () => {
    const { session: s } = await createSession();
    expect((await app.inject({ url: `/api/participant?token=${s.participant_token}` })).json()).toEqual({ session_id: s.session_id });
    expect((await app.inject({ url: '/api/participant?token=wrong' })).statusCode).toBe(401);
    expect((await deps.sessions.get(s.session_id))?.first_opened_at).not.toBeNull();
    const ok = await app.inject({ url: `/api/sessions/${s.session_id}`, headers: asParticipant(s) });
    expect(ok.json()).toEqual({ session_id: s.session_id, label: 'Year 7 English', config: {
        thresholds: testLoaded().config.thresholds,
        uploads: 'inline',
        interactions: false,
        spyglass: 'shown_and_model',
        features: { classes: true, curriculum: true, pedagogy: true, preferences: true, spyglass: true, plugins: true, pupils: false },
        models: modelChoices(testLoaded().config.provider),
        default_model: testLoaded().config.provider.model,
        default_effort: testLoaded().config.agent.reasoning_effort,
      },
    });
    expect((await app.inject({ url: `/api/sessions/${s.session_id}?token=${s.participant_token}` })).statusCode).toBe(200);
  });

  it('refuse missing, wrong, admin and cross-session tokens', async () => {
    const { session: s } = await createSession();
    const { session: other } = await createSession('B');
    const url = `/api/sessions/${s.session_id}`;
    expect((await app.inject({ url })).statusCode).toBe(401);
    expect((await app.inject({ url, headers: { authorization: 'Bearer wrong' } })).statusCode).toBe(401);
    expect((await app.inject({ url, headers: adminAuth })).statusCode).toBe(401);
    expect((await app.inject({ url, headers: asParticipant(other) })).statusCode).toBe(403);
  });

  it('never expose the system prompt, provenance or the token', async () => {
    const { session: s } = await createSession();
    const body = JSON.stringify((await app.inject({ url: `/api/sessions/${s.session_id}`, headers: asParticipant(s) })).json());
    expect(body).not.toContain(testLoaded().system_prompt.slice(0, 60));
    expect(body).not.toMatch(/system_prompt|participant_token/);
  });

  it('rename a thread, validating the title and the owner', async () => {
    const { session: s } = await createSession();
    const { session: other } = await createSession('B');
    const { thread } = await workspace(s);
    const theirs = await workspace(other);
    const post = (threadId: string, body: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/threads/${threadId}/rename`, headers: asParticipant(s), payload: { envelope: envelope(), ...body } });
    const ok = await post(thread.id, { title: '  Similes 7B ' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().thread).toMatchObject({ id: thread.id, title: 'Similes 7B' });
    expect((await post(thread.id, { title: '  ' })).statusCode).toBe(400);
    expect((await post(theirs.thread.id, { title: 'x' })).statusCode).toBe(404);
  });

  it('list threads, and a new thread comes with a blank doc', async () => {
    const { session: s } = await createSession();
    const first = await workspace(s);
    expect(first.thread.title).toBe('Untitled');
    expect(first.doc.name).toBe('Untitled');
    const res = await app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/threads`, headers: asParticipant(s), payload: { envelope: envelope(first.doc, first.thread) } });
    expect(res.statusCode).toBe(201);
    const { thread, doc } = res.json();
    expect(doc.thread_id).toBe(thread.id);
    const listed = (await app.inject({ url: `/api/sessions/${s.session_id}/threads`, headers: asParticipant(s) })).json().threads;
    expect(listed.map((x: Thread) => x.id)).toEqual([first.thread.id, thread.id]);
    expect((await app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/threads`, headers: asParticipant(s), payload: {} })).statusCode).toBe(400);
  });
});

describe('doc and block routes', () => {
  it('insert a block, create and rename a doc, and serve the canvas without provenance', async () => {
    const { session: s } = await createSession();
    const { thread, doc } = await workspace(s);
    const post = (command: string, body: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/blocks/${command}`, headers: asParticipant(s), payload: { envelope: envelope(doc, thread), ...body } });

    const ins = await post('insert', { doc_id: doc.id, after: 'start', type: 'paragraph', content: 'Hello' });
    expect(ins.statusCode).toBe(200);
    expect(ins.json().block).toMatchObject({ content: 'Hello', doc_id: doc.id });
    expect(ins.json().block).not.toHaveProperty('origin');

    const id = newUlid();
    const created = await post('doc_create', { thread_id: thread.id, name: 'Short version', id });
    expect(created.json().doc).toMatchObject({ id, thread_id: thread.id, name: 'Short version' });
    expect((await post('doc_rename', { doc_id: id, name: 'Shorter' })).json().doc.name).toBe('Shorter');
    expect((await post('doc_rename', { doc_id: id, name: ' ' })).statusCode).toBe(400);
    // Its font and page colour: stored, and an unknown font refused.
    expect((await post('doc_style', { doc_id: id, style: { font: 'lexend', background: 'cream' } })).json().doc.style).toEqual({ font: 'lexend', background: 'cream' });
    expect((await post('doc_style', { doc_id: id, style: { font: 'papyrus' } })).statusCode).toBe(400);

    const canvas = (await app.inject({ url: `/api/sessions/${s.session_id}/canvas`, headers: asParticipant(s) })).json();
    expect(canvas.docs.map((d: Doc) => d.name)).toEqual(['Untitled', 'Shorter']);
    expect(canvas.docs[1].style).toEqual({ font: 'lexend', background: 'cream' });
    expect(canvas.blocks).toHaveLength(1);
    expect(canvas.blocks[0]).not.toHaveProperty('origin_turn');
  });

  it('delete a doc: gone from the canvas and logged, kept (marked) in the export', async () => {
    const { session: s } = await createSession();
    const { session: other } = await createSession('B');
    const { thread, doc } = await workspace(s);
    const theirs = await workspace(other);
    const post = (command: string, body: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/blocks/${command}`, headers: asParticipant(s), payload: { envelope: envelope(doc, thread), ...body } });
    await post('insert', { doc_id: doc.id, after: 'start', type: 'paragraph', content: 'Gone soon' });
    expect((await post('doc_delete', { doc_id: theirs.doc.id })).statusCode).toBe(404);
    const del = await post('doc_delete', { doc_id: doc.id });
    expect(del.statusCode).toBe(200);
    expect(del.json().doc.deleted_at).toBeTruthy();
    // A second delete finds nothing.
    expect((await post('doc_delete', { doc_id: doc.id })).statusCode).toBe(404);
    const canvas = (await app.inject({ url: `/api/sessions/${s.session_id}/canvas`, headers: asParticipant(s) })).json();
    expect(canvas.docs).toEqual([]);
    expect(canvas.blocks).toEqual([]);
    expect((await post('insert', { doc_id: doc.id, after: 'start', type: 'paragraph', content: 'x' })).statusCode).toBe(404);
    const events = await deps.events.list(s.session_id, { kinds: ['doc_delete'] });
    expect(events.map((e) => e.payload)).toEqual([{ doc_id: doc.id, thread_id: thread.id, name: doc.name }]);
    const snap = await deps.canvas.snapshot(s.session_id, undefined, { withDeleted: true });
    expect(snap.docs.map((d) => [d.id, !!d.deleted_at])).toEqual([[doc.id, true]]);
    expect(snap.blocks.map((b) => b.content)).toEqual(['Gone soon']);
  });

  it("the model's suggested font or page colour: kept until the teacher decides, then applied or dropped and logged", async () => {
    const { session: s } = await createSession();
    const { thread, doc } = await workspace(s);
    const post = (command: string, body: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/blocks/${command}`, headers: asParticipant(s), payload: { envelope: envelope(doc, thread), ...body } });
    const suggest = (turn_id: string, background: 'green' | 'blue') =>
      (deps.canvas as CanvasServiceImpl).applyTurn(s.session_id, { operations: [{ op: 'set_style', background }], turn_id, cause_event_id: newUlid(), thread_id: thread.id, default_doc_id: doc.id }, { envelope: envelopeFor(doc, thread) });
    await post('doc_style', { doc_id: doc.id, style: { font: 'arial' } });
    // With a line of the teacher's in it: a blank doc would take the page colour straight in.
    await typeLine(deps, s.session_id, doc, thread);

    await suggest('t1', 'green');
    const canvas = (await app.inject({ url: `/api/sessions/${s.session_id}/canvas`, headers: asParticipant(s) })).json();
    expect(canvas.docs[0]).toMatchObject({ style: { font: 'arial' }, proposed_style: { style: { background: 'green' }, turn_id: 't1' } });
    const accepted = (await post('doc_style_decision', { doc_id: doc.id, accept: true })).json().doc;
    expect(accepted.style).toEqual({ font: 'arial', background: 'green' });
    expect(accepted).not.toHaveProperty('proposed_style');
    // Nothing left to decide.
    expect((await post('doc_style_decision', { doc_id: doc.id, accept: true })).statusCode).toBe(409);

    await suggest('t2', 'blue');
    expect((await post('doc_style_decision', { doc_id: doc.id, accept: false })).json().doc.style).toEqual({ font: 'arial', background: 'green' });

    const logged = await deps.events.list(s.session_id, { kinds: ['style_accept', 'style_reject', 'doc_style'] });
    expect(logged.map((e) => [e.kind, e.payload])).toEqual([
      ['doc_style', { doc_id: doc.id, style: { font: 'arial' } }],
      ['style_accept', { doc_id: doc.id, turn_id: 't1', style: { background: 'green' } }],
      ['doc_style', { doc_id: doc.id, style: { font: 'arial', background: 'green' } }],
      ['style_reject', { doc_id: doc.id, turn_id: 't2', style: { background: 'blue' } }],
    ]);
  });

  it('import a document into one of the session\'s own threads, validating the blocks', async () => {
    const { session: s } = await createSession();
    const { session: other } = await createSession('B');
    const { thread, doc } = await workspace(s);
    const theirs = await workspace(other);
    const post = (body: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: `/api/sessions/${s.session_id}/blocks/doc_import`,
        headers: asParticipant(s),
        payload: { envelope: envelope(doc, thread), name: 'Imported', source: { kind: 'docx', filename: 'a.docx', bytes: 10 }, ...body },
      });
    const ok = await post({ thread_id: thread.id, blocks: [{ type: 'paragraph', content: 'Hello' }] });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().doc).toMatchObject({ name: 'Imported', thread_id: thread.id });
    expect(ok.json().changes.blocks).toHaveLength(1);
    expect((await post({ thread_id: theirs.thread.id, blocks: [] })).statusCode).toBe(404);
    expect((await post({ thread_id: thread.id, blocks: [{ type: 'worksheet_item', content: 'x' }] })).statusCode).toBe(400);
  });

  it("refuse another session's thread and doc", async () => {
    const { session: s } = await createSession();
    const { session: other } = await createSession('B');
    const mine = await workspace(s);
    const theirs = await workspace(other);
    const post = (command: string, body: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: `/api/sessions/${s.session_id}/blocks/${command}`, headers: asParticipant(s), payload: { envelope: envelope(mine.doc, mine.thread), ...body } });
    expect((await post('doc_create', { thread_id: theirs.thread.id, name: 'x' })).statusCode).toBe(404);
    expect((await post('insert', { doc_id: theirs.doc.id, after: 'start', type: 'paragraph', content: 'x' })).statusCode).toBe(404);
    expect((await post('doc_rename', { doc_id: theirs.doc.id, name: 'x' })).statusCode).toBe(404);
  });

  it('run a chat turn through the mock into the open doc', async () => {
    const { session: s } = await createSession();
    const { thread, doc } = await workspace(s);
    // With a line of the teacher's in it: a blank doc would take the turn straight in.
    await typeLine(deps, s.session_id, doc, thread);
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${s.session_id}/threads/${thread.id}/chat`,
      headers: asParticipant(s),
      payload: { text: 'Draft a worksheet on similes', doc_id: doc.id, envelope: { client_ts: new Date().toISOString(), focus_pane: 'chat' } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
    expect(res.json().proposed_block_ids.length).toBeGreaterThan(0);
  });
});

describe('event ingestion', () => {
  it('assigns seq after the setup events and de-duplicates a resent batch', async () => {
    const { session: s } = await createSession();
    const base = await deps.events.lastSeq(s.session_id);
    const evs = [focusEvent(), focusEvent(), focusEvent()];
    const url = `/api/sessions/${s.session_id}/events`;
    const first = await app.inject({ method: 'POST', url, headers: asParticipant(s), payload: batch(s, evs) });
    expect(first.json()).toEqual({ accepted: 3, last_seq: base + 3, interactions: false });
    const again = await app.inject({ method: 'POST', url, headers: asParticipant(s), payload: batch(s, evs) });
    expect(again.json()).toEqual({ accepted: 0, last_seq: base + 3, interactions: false });
  });

  it('accepts a sendBeacon-style post: token in the query, text/plain body', async () => {
    const { session: s } = await createSession();
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${s.session_id}/events?token=${encodeURIComponent(s.participant_token)}`,
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      payload: JSON.stringify(batch(s, [focusEvent()])),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(1);
  });

  it('rejects bad batches, mismatched session ids and bad tokens', async () => {
    const { session: s } = await createSession();
    const before = await deps.events.lastSeq(s.session_id);
    const url = `/api/sessions/${s.session_id}/events`;
    const bad = await app.inject({ method: 'POST', url, headers: asParticipant(s), payload: { session_id: s.session_id, events: [{ kind: 'focus' }] } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().issues.length).toBeGreaterThan(0);
    expect((await app.inject({ method: 'POST', url, headers: asParticipant(s), payload: { session_id: s.session_id, events: [] } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url, headers: { ...asParticipant(s), 'content-type': 'text/plain' }, payload: 'nope' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url, headers: asParticipant(s), payload: { session_id: 'OTHER', events: [focusEvent()] } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url, payload: batch(s, [focusEvent()]) })).statusCode).toBe(401);
    expect(await deps.events.lastSeq(s.session_id)).toBe(before);
  });
});
