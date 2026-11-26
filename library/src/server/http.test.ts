import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixture } from '../core/test-fixture.js';
import { createLibraryServer } from './http.js';

const collection = fixture();
const server = createLibraryServer(new Map([['test', collection]]));
let base = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const post = async (path: string, body: unknown) => {
  const res = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

describe('JSON API', () => {
  it('lists collections with their version and counts', async () => {
    const res = await fetch(`${base}/api/collections`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        id: 'test',
        kind: 'documents',
        name: 'Test',
        publisher: 'Nobody',
        description: 'A test collection',
        licence: 'OGL-UK-3.0',
        licence_url: 'https://example.org/ogl',
        homepage: 'https://example.org',
        version: collection.version,
        doc_count: 2,
        updated_at: '2026-11-08',
      },
    ]);
  });

  it('searches, greps, lists and reads, each with the version', async () => {
    const s = await post('/api/collections/test/search', { query: 'MNU 2-03a', limit: 2 });
    expect(s.status).toBe(200);
    expect(s.body.version).toBe(collection.version);
    expect(Object.keys((s.body.results as object[])[0]!).sort()).toEqual(['line', 'path', 'score', 'snippet', 'source_url', 'title']);

    const g = await post('/api/collections/test/grep', { pattern: '^LIT', context: 1 });
    expect(g.body).toMatchObject({ version: collection.version, truncated: false });
    expect(g.body.matches).toHaveLength(2);

    const l = await post('/api/collections/test/list', { filters: { level: 'second' } });
    expect(l.body).toMatchObject({ version: collection.version, files: [{ path: 'numeracy.md' }] });

    const r = await post('/api/collections/test/read', { path: 'numeracy.md', from_line: 13, max_lines: 1 });
    expect(r.body).toMatchObject({ version: collection.version, from_line: 13, to_line: 13, text: expect.stringMatching(/^MNU 2-03a/) });
  });

  it('accepts an empty body where every argument is optional', async () => {
    const res = await fetch(`${base}/api/collections/test/list`, { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('answers errors as { error } with 400 or 404', async () => {
    expect(await post('/api/collections/nope/search', { query: 'x' })).toMatchObject({ status: 404, body: { error: expect.any(String) } });
    expect(await post('/api/collections/test/read', { path: 'nope.md' })).toMatchObject({ status: 404, body: { error: expect.any(String) } });
    expect(await post('/api/collections/test/search', {})).toMatchObject({ status: 400, body: { error: expect.stringMatching(/query/) } });
    expect(await post('/api/collections/test/search', { query: 'x', filters: { colour: 'red' } })).toMatchObject({ status: 400 });
    expect(await post('/api/collections/test/grep', { pattern: '(a+)+' })).toMatchObject({ status: 400, body: { version: collection.version } });
    const bad = await fetch(`${base}/api/collections/test/grep`, { method: 'POST', body: '{nope' });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'body is not JSON' });
  });
});

describe('MCP', () => {
  it('offers the five tools, the pedagogy three and the curriculum two, and answers like the JSON API', async () => {
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['curriculum_benchmarks', 'curriculum_outcomes', 'grep', 'list', 'list_collections', 'pedagogy_claims', 'pedagogy_entries', 'pedagogy_entry', 'read', 'search']);

    const text = (r: unknown) => JSON.parse((r as { content: { text: string }[] }).content[0]!.text);
    const cols = text(await client.callTool({ name: 'list_collections', arguments: {} }));
    expect(cols[0]).toMatchObject({ id: 'test', version: collection.version });

    const found = text(await client.callTool({ name: 'search', arguments: { collection: 'test', query: 'MNU 2-03b' } }));
    expect(found.results[0].snippet).toMatch(/^MNU 2-03b/);

    const missing = await client.callTool({ name: 'read', arguments: { collection: 'test', path: 'nope.md' } });
    expect(missing.isError).toBe(true);
    await client.close();
  });
});
