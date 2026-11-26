import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadCollection } from '../core/fs.js';
import { createLibraryServer } from '../server/http.js';
import { COLLECTIONS_ROOT } from './bundled.js';
import { buildPlugin } from './load.js';
import { pluginBlock, toolIsOn } from './routes.js';
import { createPluginStore, loadPluginStore } from './store.js';
import { fixturePluginFiles } from './test-fixture.js';

const plugins = loadPluginStore();
const pedagogy = plugins.get('elm/pedagogy')!;
const fixture = buildPlugin(fixturePluginFiles());
const store = createPluginStore([pedagogy, fixture]);
const scotland = loadCollection(join(COLLECTIONS_ROOT, 'pedagogy-scotland'));
const server = createLibraryServer(new Map([['pedagogy-scotland', scotland]]), store);
let base = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const post = async (path: string, body: unknown = {}) => {
  const res = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

const block = { id: 'elm/pedagogy', version: '0.1.0', hash: pedagogy.hash };
const query = { types: ['activity_type'], limit: 3 };

describe('a plugin over the JSON API', () => {
  it('answers as /api does, plus a plugin block, with or without @ver', async () => {
    const old = await post('/api/collections/pedagogy-scotland/entries', query);
    expect(old.status).toBe(200);
    const pinned = await post('/p/elm/pedagogy@0.1.0/api/collections/pedagogy-scotland/entries', query);
    expect(pinned).toEqual({ status: 200, body: { ...old.body, plugin: block } });
    expect(pinned.body.version).toBe(scotland.version);
    expect(await post('/p/elm/pedagogy/api/collections/pedagogy-scotland/entries', query)).toEqual(pinned);
  });

  it('takes an @ sent as %40', async () => {
    const res = await post('/p/elm/pedagogy%400.1.0/api/collections/pedagogy-scotland/entries', query);
    expect(res.body.plugin).toEqual(block);
  });

  it('ignores a Plugin-Settings header until settings are applied', async () => {
    const res = await fetch(`${base}/p/elm/pedagogy@0.1.0/api/collections/pedagogy-scotland/entries`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'plugin-settings': '{"hide":["x"]}' },
      body: JSON.stringify(query),
    });
    expect(res.status).toBe(200);
  });

  it('answers 404 with a reason for an unknown plugin, version, collection or tool', async () => {
    expect(await post('/p/elm/nope/api/collections/pedagogy-scotland/entries')).toMatchObject({ status: 404, body: { error: 'no plugin called elm/nope' } });
    expect(await post('/p/elm/pedagogy@9.9.9/api/collections/pedagogy-scotland/entries')).toMatchObject({
      status: 404,
      body: { error: 'elm/pedagogy has no version 9.9.9; it has 0.1.0' },
    });
    expect(await post('/p/elm/pedagogy@0.1.0/api/collections/trails/search', { query: 'x' })).toMatchObject({
      status: 404,
      body: { error: 'elm/pedagogy@0.1.0 has no collection called trails', plugin: block },
    });
    expect(await post('/p/elm/pedagogy@0.1.0/api/collections/pedagogy-scotland/search', { query: 'x' })).toMatchObject({
      status: 404,
      body: { error: 'search is not switched on for pedagogy-scotland', version: scotland.version, plugin: block },
    });
    expect(await post('/p/elm/pedagogy@0.1.0/api/collections/pedagogy-scotland/frobnicate')).toMatchObject({ status: 404 });
    expect(await post('/p/elm/pedagogy@0.1.0/other')).toMatchObject({ status: 404 });
  });

  it('keeps the plugin block on a refused body', async () => {
    const res = await post('/p/elm/pedagogy@0.1.0/api/collections/pedagogy-scotland/entry', {});
    expect(res).toMatchObject({ status: 400, body: { version: scotland.version, plugin: block } });
  });

  it('gives the manifest and versions at GET /p/<owner>/<name>', async () => {
    for (const path of ['/p/elm/pedagogy', '/p/elm/pedagogy@0.1.0', '/p/elm/pedagogy/']) {
      const res = await fetch(`${base}${path}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ plugin: block, versions: ['0.1.0'], manifest: pedagogy.manifest });
    }
    expect((await post('/p/elm/pedagogy')).status).toBe(405);
  });

  it('leaves the old routes alone', async () => {
    expect((await fetch(`${base}/api/collections`)).status).toBe(200);
  });
});

describe('toolIsOn', () => {
  it('takes a tool with no collection as on for every collection of its kind', () => {
    expect(toolIsOn(fixture, 'search', 'test')).toBe(true);
    expect(toolIsOn(fixture, 'search', 'ped')).toBe(false);
    expect(toolIsOn(fixture, 'entries', 'ped')).toBe(true);
    expect(toolIsOn(fixture, 'grep')).toBe(false);
    expect(toolIsOn(fixture, 'search')).toBe(true);
  });
});

describe('a plugin over MCP', () => {
  const text = (r: unknown) => JSON.parse((r as { content: { text: string }[] }).content[0]!.text);

  it("offers only the plugin's tools and collections, answering as its JSON API", async () => {
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/p/elm/pedagogy@0.1.0/mcp`)));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['list_collections', 'pedagogy_claims', 'pedagogy_entries', 'pedagogy_entry']);

    const cols = text(await client.callTool({ name: 'list_collections', arguments: {} }));
    expect(cols.map((c: { id: string }) => c.id)).toEqual(['pedagogy-scotland']);

    const viaMcp = text(await client.callTool({ name: 'pedagogy_entries', arguments: { collection: 'pedagogy-scotland', ...query } }));
    const viaJson = await post('/p/elm/pedagogy@0.1.0/api/collections/pedagogy-scotland/entries', query);
    expect(viaMcp).toEqual(viaJson.body);

    const missing = await client.callTool({ name: 'pedagogy_entry', arguments: { collection: 'trails', id: 'x' } });
    expect(missing.isError).toBe(true);
    await client.close();
  });

  it('refuses a tool on a collection the manifest does not switch it on for', async () => {
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/p/test/plugin/mcp`)));
    expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual(['list_collections', 'pedagogy_entries', 'search']);
    const res = await client.callTool({ name: 'search', arguments: { collection: 'ped', query: 'x' } });
    expect(res.isError).toBe(true);
    expect(text(res)).toEqual({ error: 'search is not switched on for ped', plugin: pluginBlock(fixture) });
    await client.close();
  });
});
