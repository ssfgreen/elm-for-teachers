import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import type { AppDeps, SessionRow } from '../../deps.js';
import { newWorkspace, tempDb, testDeps, testEnv, type TempDb } from '../../test-helpers.js';
import { createDraftService, DRAFTS_MAX } from './service.js';

const CODE = 'Secret_Code-123456';
const ADDRESS = `https://studio.example/d/${CODE}`;
const envelope = { client_ts: '2026-11-22T09:00:00.000Z', focus_pane: 'none', doc_id: null, thread_id: null };

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
let s: SessionRow;
let other: SessionRow;
let logs: string[];
let studioCalls: string[];

const studio = (async (url: string) => {
  studioCalls.push(url);
  return new Response(JSON.stringify({ name: 'Phonics helper' }), { headers: { 'content-type': 'application/json' } });
}) as unknown as typeof fetch;

async function start(studioUrl: string | null = 'https://studio.example', studioFetch: typeof fetch = studio) {
  t = await tempDb();
  logs = [];
  studioCalls = [];
  deps = { ...testDeps(t.db), env: testEnv(studioUrl ? { PLUGIN_STUDIO_URL: studioUrl } : {}), studioFetch };
  app = await buildApp(deps, { logger: true, logStream: { write: (line) => void logs.push(line) } });
  await app.ready();
  s = (await newWorkspace(deps)).session;
  other = (await newWorkspace(deps, 'B')).session;
}

afterEach(async () => {
  await app.close();
  t.cleanup();
});

const auth = (x: SessionRow) => ({ authorization: `Bearer ${x.participant_token}` });
const base = (x: SessionRow) => `/api/sessions/${x.session_id}/plugin-drafts`;
const list = (x: SessionRow = s) => app.inject({ url: base(x), headers: auth(x) });
const add = (address: string, x: SessionRow = s) => app.inject({ method: 'POST', url: base(x), headers: auth(x), payload: { address, envelope } });
const remove = (id: string, x: SessionRow = s) => app.inject({ method: 'DELETE', url: `${base(x)}/${id}`, headers: auth(x), payload: { envelope } });
const draftEvents = async (x: SessionRow = s) => (await deps.events.list(x.session_id)).filter((e) => e.kind.startsWith('plugin_draft_'));

describe('plugin drafts', () => {
  it('adds a draft with the name read from the studio, lists it, and logs it without the address', async () => {
    await start();
    const res = await add(ADDRESS);
    expect(res.statusCode).toBe(201);
    const draft = res.json().draft;
    expect(draft).toEqual({ id: expect.stringMatching(/^d-/), name: 'Phonics helper', added_at: expect.any(String) });
    expect(studioCalls).toEqual([ADDRESS]);
    expect((await list()).json()).toEqual({ drafts: [draft] });
    const logged = await draftEvents();
    expect(logged.map((e) => [e.kind, e.payload])).toEqual([['plugin_draft_add', { draft_id: draft.id, name: 'Phonics helper', content_hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) }]]);
    // The same address again: the same draft, nothing new logged.
    const again = await add(`${ADDRESS}/`);
    expect([again.statusCode, again.json().draft.id]).toEqual([200, draft.id]);
    expect(await draftEvents()).toHaveLength(1);
  });

  it('uses a placeholder name when the studio cannot be read', async () => {
    await start('https://studio.example', (async () => {
      throw new Error(`fetch failed for ${ADDRESS}`);
    }) as unknown as typeof fetch);
    const res = await add(ADDRESS);
    expect(res.json().draft.name).toBe('Studio draft');
    expect((await draftEvents())[0]!.payload).toMatchObject({ content_hash: null });
  });

  it('refuses an address off the allow-list, without reading it', async () => {
    await start();
    for (const [address, code] of [
      [`https://evil.example/d/${CODE}`, 'not_the_studio'],
      [`https://studio.example/p/${CODE}`, 'not_a_draft'],
      ['not an address', 'not_an_address'],
    ]) {
      const res = await add(address!);
      expect([res.statusCode, res.json().code]).toEqual([400, code]);
      expect(res.body).not.toContain(CODE);
    }
    expect(studioCalls).toEqual([]);
    expect(await draftEvents()).toEqual([]);
  });

  it('is off with PLUGIN_STUDIO_URL unset', async () => {
    await start(null);
    for (const res of [await list(), await add(ADDRESS), await remove('d-whatever')]) expect([res.statusCode, res.json().code]).toEqual([404, 'drafts_off']);
    expect(studioCalls).toEqual([]);
  });

  it("keeps a workspace's drafts from another", async () => {
    await start();
    const id = (await add(ADDRESS)).json().draft.id;
    expect((await list(other)).json().drafts).toEqual([]);
    expect((await remove(id, other)).statusCode).toBe(404);
    // Another workspace's token on this workspace's path is refused by the guard.
    expect((await app.inject({ url: base(s), headers: auth(other) })).statusCode).toBe(403);
    expect((await list()).json().drafts).toHaveLength(1);
    // The same address in another workspace is its own draft.
    expect((await add(ADDRESS, other)).json().draft.id).not.toBe(id);
  });

  it('removes a draft and logs it by id and name', async () => {
    await start();
    const id = (await add(ADDRESS)).json().draft.id;
    expect((await remove(id)).statusCode).toBe(204);
    expect((await list()).json().drafts).toEqual([]);
    expect((await remove(id)).statusCode).toBe(404);
    expect((await draftEvents()).map((e) => [e.kind, e.payload])).toEqual([
      ['plugin_draft_add', expect.anything()],
      ['plugin_draft_remove', { draft_id: id, name: 'Phonics helper' }],
    ]);
  });

  it(`holds at most ${DRAFTS_MAX} drafts`, async () => {
    await start();
    for (let i = 0; i < DRAFTS_MAX; i++) expect((await add(`https://studio.example/d/code-${i}-abcdef`)).statusCode).toBe(201);
    const res = await add(ADDRESS);
    expect([res.statusCode, res.json().code]).toEqual([409, 'too_many_drafts']);
  });

  it('keeps the address for the server, and out of every response, event and log line', async () => {
    await start();
    const added = await add(ADDRESS);
    const id = added.json().draft.id;
    const listed = await list();
    await add(`https://evil.example/d/${CODE}`);
    await add(`https://studio.example/d/${CODE}?x=1`);
    const removed = await remove(id);
    for (const body of [added.body, listed.body, removed.body]) expect(body).not.toContain(CODE);
    expect(JSON.stringify(await draftEvents())).not.toContain(CODE);
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) expect(line).not.toContain(CODE);
    // The server can still find it, for a turn that uses it.
    const drafts = createDraftService(deps.db, deps.events);
    const id2 = (await add(ADDRESS)).json().draft.id;
    expect(await drafts.addressOf(s.session_id, id2)).toBe(ADDRESS);
    expect(await drafts.addressOf(other.session_id, id2)).toBeNull();
  });
});
