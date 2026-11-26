import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_PLUGINS, PluginEntry } from '@edw/shared';
import { buildApp } from '../app.js';
import type { AppDeps, SessionRow } from '../deps.js';
import { newWorkspace, tempDb, testDeps, testEnv, type TempDb } from '../test-helpers.js';
import type { Thread } from '@edw/shared';

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
let s: SessionRow;
let chat: Thread;
let other: SessionRow;

const trails = PluginEntry.parse({ id: 'trails', kind: 'library', name: 'TRAILS', publisher: 'TRAILS', description: 'AI literacy resources for schools.', licence: 'unknown', default_trust: 'ask', library: { collection: 'trails' } });
const envelope = { client_ts: '2026-11-08T09:00:00.000Z', focus_pane: 'none', doc_id: null, thread_id: null };
const auth = (x: SessionRow = s) => ({ authorization: `Bearer ${x.participant_token}` });
const get = async (query = '', x: SessionRow = s) => app.inject({ url: `/api/sessions/${x.session_id}/plugins${query}`, headers: auth(x) });
const post = (path: string, body: Record<string, unknown>, x: SessionRow = s) => app.inject({ method: 'POST', url: `/api/sessions/${x.session_id}/plugins/${path}`, headers: auth(x), payload: { envelope, ...body } });
const kinds = async (x: SessionRow = s) => (await deps.events.list(x.session_id)).filter((e) => e.kind.startsWith('plugin_'));

async function start(libraryUrl?: string) {
  t = await tempDb();
  const base = testDeps(t.db);
  deps = { ...base, env: testEnv(libraryUrl ? { LIBRARY_URL: libraryUrl } : {}), loaded: { ...base.loaded, config: { ...base.loaded.config, plugins: [...DEFAULT_PLUGINS, trails] } } };
  app = await buildApp(deps);
  await app.ready();
  const w = await newWorkspace(deps);
  s = w.session;
  chat = w.thread;
  other = (await newWorkspace(deps, 'B')).session;
}

afterEach(async () => {
  await app.close();
  t.cleanup();
});

describe('plugins', () => {
  beforeEach(() => start('https://library.example/'));

  it('lists the catalogue at its default levels, with no server address', async () => {
    const res = await get();
    expect(res.statusCode).toBe(200);
    const plugins = res.json().plugins;
    expect(plugins.map((p: { id: string; trust: string; available: boolean }) => [p.id, p.trust, p.available])).toEqual([['arasaac', 'use', true], ['trails', 'ask', true]]);
    expect(JSON.stringify(plugins)).not.toContain('library.example');
  });

  it("sets a workspace's trust level, logs it with the level before, and logs nothing when it is unchanged", async () => {
    const res = await post('arasaac/trust', { trust: 'off' });
    expect(res.json().plugin).toMatchObject({ id: 'arasaac', trust: 'off' });
    await post('arasaac/trust', { trust: 'off' });
    expect((await kinds()).map((e) => [e.kind, e.payload])).toEqual([['plugin_trust_set', { plugin_id: 'arasaac', trust: 'off', before: 'use' }]]);
    expect((await get('', other)).json().plugins[0].trust).toBe('use');
  });

  it('refuses an unknown plugin or level', async () => {
    expect((await post('nope/trust', { trust: 'use' })).statusCode).toBe(404);
    expect((await post('arasaac/trust', { trust: 'always' })).statusCode).toBe(400);
  });

  it('allows an Ask first plugin in one chat only, once', async () => {
    expect((await get(`?thread_id=${chat.id}`)).json().plugins[1]).toMatchObject({ id: 'trails', allowed: false, requested: false });
    const res = await post('trails/allow', { thread_id: chat.id });
    expect(res.json().plugin).toMatchObject({ allowed: true });
    await post('trails/allow', { thread_id: chat.id });
    const logged = await kinds();
    expect(logged.map((e) => [e.kind, e.thread_id])).toEqual([['plugin_grant', chat.id]]);
    expect((await get()).json().plugins[1].allowed).toBeUndefined();
  });

  it("refuses another workspace's chat", async () => {
    const otherChat = (await deps.threads.list(other.session_id))[0]!;
    expect((await post('trails/allow', { thread_id: otherChat.id })).statusCode).toBe(404);
    expect((await get(`?thread_id=${otherChat.id}`)).statusCode).toBe(404);
  });
});

describe('a library with no server set up', () => {
  beforeEach(() => start());

  it('shows as not available', async () => {
    expect((await get()).json().plugins[1]).toMatchObject({ id: 'trails', available: false });
  });
});
