import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PLUGINS, PluginEntry, type Doc, type LoadedConfig, type Thread } from '@edw/shared';
import type { CanvasServiceImpl } from '../blocks/service.js';
import type { AppDeps } from '../deps.js';
import type { LibraryClient } from '../plugins/library-client.js';
import { createPluginService } from '../plugins/service.js';
import { envelopeFor, newWorkspace, tempDb, testDeps, testLoaded, type TempDb } from '../test-helpers.js';
import { loadGatewayCalls } from './history.js';
import { createChatService, type TurnInput } from './service.js';
import { scripted } from './test-fixtures.js';
import { DEFAULT_TOOLS } from './tools/index.js';

const envelope = { client_ts: '2026-11-08T12:00:00.000Z', focus_pane: 'chat' } as const;
const eo = PluginEntry.parse({ id: 'education-scotland-eo', kind: 'library', name: 'Experiences and outcomes', publisher: 'Education Scotland', description: 'The CfE experiences and outcomes.', licence: 'OGL-UK-3.0', library: { collection: 'education-scotland-eo' } });

let t: TempDb;
let deps: AppDeps & { canvas: CanvasServiceImpl };
let loaded: LoadedConfig;
let sid: string;
let thread: Thread;
let doc: Doc;
const calls: { collection: string; op: string; body: unknown }[] = [];
const client: LibraryClient = {
  async call(collection, op, body) {
    calls.push({ collection, op, body });
    return { version: 'abc123', results: [{ path: 'numeracy-maths-eo.md', title: 'Numeracy and mathematics', snippet: 'MNU 2-07a: I can show my understanding of fractions…' }] };
  },
};

const chat = (provider: Parameters<typeof createChatService>[0]['provider']) =>
  createChatService({ db: t.db, events: deps.events, canvas: deps.canvas, threads: deps.threads, provider, loaded, libraryUrl: 'https://lib.example', libraryClient: () => client });
const input = (text: string): TurnInput => ({ thread_id: thread.id, doc_id: doc.id, text, envelope });
const plugins = () => createPluginService(t.db, deps.events, loaded.config.plugins, 'https://lib.example');
const setTrust = (id: string, trust: 'use' | 'ask' | 'off') => plugins().setTrust(sid, id, trust, envelopeFor(null, null));
const kinds = async (k: string) => (await deps.events.list(sid)).filter((e) => e.kind === k);

beforeAll(async () => {
  t = await tempDb();
  const base = testLoaded();
  loaded = { ...base, config: { ...base.config, mode: 'agent', plugins: [...DEFAULT_PLUGINS, eo], agent: { ...base.config.agent, tools: DEFAULT_TOOLS } } };
  deps = testDeps(t.db);
});
afterAll(() => t.cleanup());
beforeEach(async () => {
  const w = await newWorkspace(deps);
  sid = w.session.session_id;
  thread = w.thread;
  doc = w.doc;
  calls.length = 0;
});

describe('plugins in a turn', () => {
  it('offers a library used freely: its catalogue, the library tools, its answer; chat_prompt records the plugins', async () => {
    const { provider, requests } = scripted(
      () => ({ calls: [{ name: 'library_search', args: { library: 'education-scotland-eo', query: 'fractions', filters: { level: 'Second' } } }] }),
      () => ({ text: 'MNU 2-07a covers fractions.' }),
    );
    const r = await chat(provider).runTurn(sid, input('Which outcome covers fractions at second level?'));
    expect(r.ok).toBe(true);
    expect(requests[0]!.tools.map((x) => x.name)).toEqual(expect.arrayContaining(['search_pictures', 'library_search', 'library_grep', 'library_list', 'library_read']));
    expect(JSON.stringify(requests[0]!.input)).toContain('## Libraries');
    expect(calls).toEqual([{ collection: 'education-scotland-eo', op: 'search', body: { query: 'fractions', filters: { level: 'Second' } } }]);
    // The version is in what the model was told, which the gateway call keeps.
    const steps = await loadGatewayCalls(t.db, sid);
    expect(JSON.stringify(steps[0]!.tool_calls)).toContain('abc123');
    expect((await kinds('chat_prompt'))[0]!.payload).toMatchObject({ plugins: [{ id: 'arasaac', trust: 'use' }, { id: 'education-scotland-eo', trust: 'use' }] });
  });

  it('turns pictures and the library off: no search_pictures, no library tools, nothing recorded as on offer', async () => {
    await setTrust('arasaac', 'off');
    await setTrust('education-scotland-eo', 'off');
    const { provider, requests } = scripted(() => ({ text: 'Hello.' }));
    await chat(provider).runTurn(sid, input('Hi'));
    expect(requests[0]!.tools.map((x) => x.name).filter((n) => n.startsWith('library_') || n === 'search_pictures')).toEqual([]);
    expect((await kinds('chat_prompt'))[0]!.payload).toMatchObject({ plugins: [] });
  });

  it('Ask first: the tool searches nothing and the turn records the request, until the teacher allows it in the chat', async () => {
    await setTrust('education-scotland-eo', 'ask');
    const ask = () => ({ calls: [{ name: 'library_grep', args: { library: 'education-scotland-eo', pattern: '^MNU 2' } }] });
    const first = scripted(ask, () => ({ text: 'May I look in the experiences and outcomes?' }));
    await chat(first.provider).runTurn(sid, input('Find the numeracy outcomes'));
    expect(calls).toEqual([]);
    expect(JSON.stringify(first.requests[1]!.input)).toContain('needs_permission');
    expect((await kinds('plugin_request')).map((e) => [e.payload, e.thread_id])).toEqual([[{ plugin_id: 'education-scotland-eo', turn_id: expect.any(String) }, thread.id]]);
    expect((await plugins().states(sid, thread.id)).find((s) => s.entry.id === 'education-scotland-eo')).toMatchObject({ requested: true, allowed: false });

    await plugins().grant(sid, thread.id, 'education-scotland-eo', envelopeFor(null, thread));
    const second = scripted(ask, () => ({ text: 'Here they are.' }));
    await chat(second.provider).runTurn(sid, input('Yes, go ahead'));
    expect(calls.map((c) => c.op)).toEqual(['grep']);
    expect(await kinds('plugin_request')).toHaveLength(1);
  });
});
