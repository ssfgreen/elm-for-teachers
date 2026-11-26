import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_PLUGINS, PluginEntry, type Doc, type Thread } from '@edw/shared';
import { buildApp } from '../app.js';
import type { AppDeps, SessionRow } from '../deps.js';
import type { LibraryClient } from '../plugins/library-client.js';
import { newWorkspace, tempDb, testDeps, testEnv, testLoaded, type TempDb } from '../test-helpers.js';
import { loadGatewayCalls } from './history.js';
import { scripted } from './test-fixtures.js';
import { DEFAULT_TOOLS } from './tools/index.js';

const CODE = 'Secret_Code-123456';
const ADDRESS = `https://studio.example/d/${CODE}`;
const HASH = `sha256:${'d'.repeat(64)}`;
const envelope = { client_ts: '2026-11-22T09:00:00.000Z', focus_pane: 'chat', doc_id: null, thread_id: null };
const pedagogy = PluginEntry.parse({ id: 'pedagogy', kind: 'pedagogy', name: 'Pedagogy', publisher: 'P', description: 'P.', licence: 'unknown', library: { url: 'https://lib.example', collection: 'pedagogy-scotland' } });
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
let logs: string[];
/** What the fake studio is asked, and how it behaves now. */
let studioCalls: { url: string; body: string | null }[];
let studioMode: 'up' | 'down' | 'slow';
/** The collections the draft's manifest names. */
let collections: { id: string; kind: string }[];
/** Whether the studio's answer carries its own content hash. */
let ownHash: boolean;
let w: { session: SessionRow; thread: Thread; doc: Doc };

const studio = (async (url: string, init: RequestInit = {}) => {
  studioCalls.push({ url, body: typeof init.body === 'string' ? init.body : null });
  if (studioMode === 'down') throw new TypeError(`fetch failed: ${url}`);
  if (studioMode === 'slow') return new Promise((_r, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)));
  if (url === ADDRESS) return json({ name: 'Simile notes', ...(ownHash ? { content_hash: HASH } : {}), description: 'Similes for P5.', collections });
  if (url === `${ADDRESS}/api/collections/notes/search`) return json({ version: 'v-draft', results: [{ path: 'similes.md', title: 'Similes', snippet: 'as brave as a lion' }] });
  return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
}) as unknown as typeof fetch;
const library: LibraryClient = { call: async () => ({ entries: [] }) };

async function start(steps: Parameters<typeof scripted>) {
  t = await tempDb();
  logs = [];
  studioCalls = [];
  studioMode = 'up';
  collections = [{ id: 'notes', kind: 'documents' }];
  ownHash = true;
  const run = scripted(...steps);
  const base = testLoaded();
  const loaded = { ...base, config: { ...base.config, mode: 'agent' as const, plugins: [...DEFAULT_PLUGINS, pedagogy], agent: { ...base.config.agent, tools: DEFAULT_TOOLS } } };
  deps = { ...testDeps(t.db, run.provider), loaded, env: testEnv({ PLUGIN_STUDIO_URL: 'https://studio.example' }), studioFetch: studio, libraryClient: () => library };
  app = await buildApp(deps, { logger: true, logStream: { write: (line) => void logs.push(line) } });
  await app.ready();
  w = await newWorkspace(deps);
  return run.requests;
}

afterEach(async () => {
  await app.close();
  t.cleanup();
});

const auth = (s: SessionRow = w.session) => ({ authorization: `Bearer ${s.participant_token}` });
const addDraft = async () => (await app.inject({ method: 'POST', url: `/api/sessions/${w.session.session_id}/plugin-drafts`, headers: auth(), payload: { address: ADDRESS, envelope } })).json().draft.id as string;
const turn = (text: string, x = w) => app.inject({ method: 'POST', url: `/api/sessions/${x.session.session_id}/threads/${x.thread.id}/chat`, headers: auth(x.session), payload: { text, doc_id: x.doc.id, envelope: { client_ts: envelope.client_ts, focus_pane: 'chat' } } });
const chatPlugins = async (sid = w.session.session_id) => (await deps.events.list(sid)).filter((e) => e.kind === 'chat_prompt').map((e) => (e.payload as { plugins: unknown }).plugins);
const listed = async () => (await app.inject({ url: `/api/sessions/${w.session.session_id}/plugins?thread_id=${w.thread.id}`, headers: auth() })).json().plugins as { id: string; requested?: boolean; allowed?: boolean }[];
const search = (id: string) => ({ calls: [{ name: 'library_search', args: { library: id, query: 'similes' } }] });

describe('a studio draft in a turn (#159)', () => {
  it('lists the draft, Ask first; once allowed, the model searches it; chat_prompt marks it; the address goes nowhere', async () => {
    let id = '';
    const requests = await start([() => search(id), () => ({ text: 'May I look in Simile notes?' }), () => search(id), () => ({ text: 'Found one.' })]);
    id = await addDraft();
    const responses: string[] = [];

    const first = await turn('Find a simile');
    responses.push(first.body);
    expect(first.statusCode).toBe(200);
    expect(JSON.stringify(requests[0]!.input)).toContain(`Simile notes (id: ${id}; a draft from the teacher's plugin studio; Ask first: not allowed in this chat yet): Similes for P5.`);
    expect(JSON.stringify(requests[1]!.input)).toContain('needs_permission');
    expect(studioCalls.filter((c) => c.url.includes('/api/'))).toEqual([]);
    expect((await listed()).find((p) => p.id === id)).toMatchObject({ requested: true, allowed: false });

    const allow = await app.inject({ method: 'POST', url: `/api/sessions/${w.session.session_id}/plugins/${id}/allow`, headers: auth(), payload: { thread_id: w.thread.id, envelope } });
    responses.push(allow.body);
    expect(allow.json().plugin).toMatchObject({ id, name: 'Simile notes', trust: 'ask', allowed: true });

    const second = await turn('Yes, go ahead');
    responses.push(second.body);
    expect(second.json().ok).toBe(true);
    expect(studioCalls.filter((c) => c.url.includes('/api/'))).toEqual([{ url: `${ADDRESS}/api/collections/notes/search`, body: JSON.stringify({ query: 'similes' }) }]);
    expect(JSON.stringify(requests[3]!.input)).toContain('as brave as a lion');
    expect(await chatPlugins()).toEqual([
      [{ id: 'arasaac', trust: 'use' }, { id: 'pedagogy', trust: 'use' }, { id, trust: 'ask', draft: true, content_hash: HASH }],
      [{ id: 'arasaac', trust: 'use' }, { id: 'pedagogy', trust: 'use' }, { id, trust: 'ask', draft: true, content_hash: HASH }],
    ]);

    // The address, and its code, in no prompt, response, event, gateway call or log line.
    const everything = [JSON.stringify(requests), ...responses, JSON.stringify(await deps.events.list(w.session.session_id)), JSON.stringify(await loadGatewayCalls(t.db, w.session.session_id)), ...logs, (await listed()).map((p) => JSON.stringify(p)).join()];
    for (const text of everything) expect(text).not.toContain(CODE);
  });

  it('a pedagogy draft stands in for the built-in pedagogy library once allowed, in its own workspace only', async () => {
    await start([() => ({ text: 'A.' }), () => ({ text: 'B.' }), () => ({ text: 'C.' })]);
    const otherWorkspace = await newWorkspace(deps, 'B');
    collections = [{ id: 'mine', kind: 'pedagogy' }];
    const id = await addDraft();
    const mine = { id, trust: 'ask', draft: true, content_hash: HASH };
    await turn('Hello');
    await app.inject({ method: 'POST', url: `/api/sessions/${w.session.session_id}/plugins/${id}/allow`, headers: auth(), payload: { thread_id: w.thread.id, envelope } });
    await turn('Hello again');
    await turn('Hello', otherWorkspace);
    // Before Allow the built-in stays; after it, the draft takes its place.
    expect(await chatPlugins()).toEqual([
      [{ id: 'arasaac', trust: 'use' }, { id: 'pedagogy', trust: 'use' }, mine],
      [{ id: 'arasaac', trust: 'use' }, mine],
    ]);
    expect(await chatPlugins(otherWorkspace.session.session_id)).toEqual([[{ id: 'arasaac', trust: 'use' }, { id: 'pedagogy', trust: 'use' }]]);
  });

  it('a studio that is down or slow leaves the turn working, with the draft shown as unavailable', { timeout: 15_000 }, async () => {
    const requests = await start([() => ({ text: 'Down.' }), () => ({ text: 'Slow.' })]);
    const id = await addDraft();
    for (const mode of ['down', 'slow'] as const) {
      studioMode = mode;
      const r = await turn('Find a simile');
      expect(r.statusCode).toBe(200);
      expect(r.json().ok).toBe(true);
    }
    for (const req of requests) expect(JSON.stringify(req.input)).toContain(`Simile notes (id: ${id}; a draft from the teacher's plugin studio; unavailable just now; Ask first`);
    expect((await chatPlugins()).map((p) => (p as { id: string }[]).at(-1))).toEqual([
      { id, trust: 'ask', draft: true, content_hash: null },
      { id, trust: 'ask', draft: true, content_hash: null },
    ]);
    for (const line of logs) expect(line).not.toContain(CODE);
  });

  it("lists drafts only with a chat (the Plugins screen has its own list), and allows only this workspace's draft", async () => {
    await start([]);
    const id = await addDraft();
    const sid = w.session.session_id;
    expect((await app.inject({ url: `/api/sessions/${sid}/plugins`, headers: auth() })).json().plugins.map((p: { id: string }) => p.id)).toEqual(['arasaac', 'pedagogy']);
    expect((await listed()).find((p) => p.id === id)).toMatchObject({ name: 'Simile notes', trust: 'ask', allowed: false, requested: false });
    const other = await newWorkspace(deps, 'B');
    const theirs = await app.inject({ method: 'POST', url: `/api/sessions/${other.session.session_id}/plugins/${id}/allow`, headers: auth(other.session), payload: { thread_id: other.thread.id, envelope } });
    expect(theirs.statusCode).toBe(404);
    expect((await deps.events.list(other.session.session_id)).filter((e) => e.kind === 'plugin_grant')).toEqual([]);
  });

  it('plugin_draft_add and chat_prompt give the same content hash, whether the studio sends its own or not', async () => {
    await start([() => ({ text: 'A.' }), () => ({ text: 'B.' })]);
    const sid = w.session.session_id;
    const hashes = async () => {
      const events = await deps.events.list(sid);
      const added = (events.filter((e) => e.kind === 'plugin_draft_add').at(-1)!.payload as { content_hash: string }).content_hash;
      const used = ((events.filter((e) => e.kind === 'chat_prompt').at(-1)!.payload as { plugins: { content_hash?: string }[] }).plugins.at(-1)!).content_hash;
      return [added, used];
    };
    await addDraft();
    await turn('Hello');
    expect(await hashes()).toEqual([HASH, HASH]);
    // A studio that sends no hash of its own: both hash the same answer.
    ownHash = false;
    const id = await addDraft();
    await app.inject({ method: 'DELETE', url: `/api/sessions/${sid}/plugin-drafts/${id}`, headers: auth(), payload: { envelope } });
    await addDraft();
    await turn('Hello again');
    const [added, used] = await hashes();
    expect(added).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(used).toBe(added);
  });
});
