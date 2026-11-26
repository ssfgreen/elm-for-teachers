import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixture } from '../core/test-fixture.js';
import { buildPlugin } from '../plugin/load.js';
import { createPluginStore } from '../plugin/store.js';
import { fixturePluginFiles } from '../plugin/test-fixture.js';
import { authorised, createVercelHandler, originalUrl } from './vercel.js';

describe('originalUrl', () => {
  it('puts back the path vercel.json moved into __path, keeping the rest of the query', () => {
    expect(originalUrl('/api/library?__path=api/collections/test/grep')).toBe('/api/collections/test/grep');
    expect(originalUrl('/api/library?__path=mcp&x=1')).toBe('/mcp?x=1');
    expect(originalUrl('/api/library?__path=')).toBe('/');
    expect(originalUrl('/health')).toBe('/health');
    expect(originalUrl('/api/library?__path=p/elm/pedagogy@0.1.0/mcp')).toBe('/p/elm/pedagogy@0.1.0/mcp');
    expect(originalUrl('/api/library?__path=p%2Felm%2Fpedagogy%400.1.0%2Fmcp')).toBe('/p/elm/pedagogy@0.1.0/mcp');
  });
});

describe('authorised', () => {
  it('takes only the exact bearer token', () => {
    expect(authorised('Bearer s3cret', 's3cret')).toBe(true);
    expect(authorised('Bearer s3cret2', 's3cret')).toBe(false);
    expect(authorised('s3cret', 's3cret')).toBe(false);
    expect(authorised(undefined, 's3cret')).toBe(false);
  });
});

describe('the library as a Vercel Function', () => {
  let loads = 0;
  const load = () => {
    loads++;
    return new Map([['test', fixture()]]);
  };
  const loadPlugins = () => createPluginStore([buildPlugin(fixturePluginFiles())]);
  const open = createServer(createVercelHandler({ token: 's3cret', load, loadPlugins }));
  const unset = createServer(createVercelHandler({ token: undefined, load }));
  const base = { open: '', unset: '' };
  const listen = (s: typeof open) =>
    new Promise<string>((resolve) => s.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(s.address() as AddressInfo).port}`)));

  beforeAll(async () => {
    base.open = await listen(open);
    base.unset = await listen(unset);
  });
  afterAll(async () => {
    await new Promise((r) => open.close(r));
    await new Promise((r) => unset.close(r));
  });

  const list = (b: string, headers: Record<string, string> = {}) => fetch(`${b}/api/library?__path=api/collections`, { headers });

  it('answers with the token, through the rewritten path, loading the collections once', async () => {
    const auth = { authorization: 'Bearer s3cret' };
    const res = await list(base.open, auth);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { id: string }[]).map((c) => c.id)).toEqual(['test']);
    const grep = await fetch(`${base.open}/api/library?__path=api/collections/test/grep`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ pattern: '.' }),
    });
    expect(grep.status).toBe(200);
    expect(loads).toBe(1);
  });

  it('reaches a plugin through the rewritten path, with an @ plain or encoded', async () => {
    const auth = { authorization: 'Bearer s3cret', 'content-type': 'application/json' };
    for (const path of ['p/test/plugin@1.0.0/api/collections/test/search', 'p%2Ftest%2Fplugin%401.0.0%2Fapi%2Fcollections%2Ftest%2Fsearch', 'p/test/plugin/api/collections/test/search']) {
      const res = await fetch(`${base.open}/api/library?__path=${path}`, { method: 'POST', headers: auth, body: JSON.stringify({ query: 'MNU' }) });
      expect(res.status).toBe(200);
      expect(((await res.json()) as { plugin: { id: string; version: string } }).plugin).toMatchObject({ id: 'test/plugin', version: '1.0.0' });
    }
    const manifest = await fetch(`${base.open}/api/library?__path=p/test/plugin`, { headers: auth });
    expect(((await manifest.json()) as { versions: string[] }).versions).toEqual(['1.0.0']);
  });

  it('keeps the old routes when the plugins fail to load, and says why under /p/', async () => {
    const broken = createServer(createVercelHandler({ token: 's3cret', load, loadPlugins: () => { throw new Error('plugin.json is missing'); } }));
    const b = await listen(broken);
    const auth = { authorization: 'Bearer s3cret' };
    for (let i = 0; i < 2; i++) expect((await list(b, auth)).status).toBe(200);
    const p = await fetch(`${b}/api/library?__path=p/test/plugin`, { headers: auth });
    expect(p.status).toBe(503);
    expect(((await p.json()) as { error: string }).error).toMatch(/plugin.json is missing/);
    expect((await list(b, auth)).status).toBe(200);
    await new Promise((r) => broken.close(r));
  });

  it('refuses a plugin address without the token', async () => {
    const res = await fetch(`${base.open}/api/library?__path=p/test/plugin@1.0.0/api/collections/test/search`, { method: 'POST', body: '{"query":"x"}' });
    expect(res.status).toBe(401);
  });

  it('refuses a request without the token, before reading any collection', async () => {
    const before = loads;
    expect((await list(base.open)).status).toBe(401);
    expect((await list(base.open, { authorization: 'Bearer wrong' })).status).toBe(401);
    expect(loads).toBe(before);
  });

  it('refuses everyone when no token is set', async () => {
    const res = await list(base.unset, { authorization: 'Bearer ' });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toMatch(/LIBRARY_TOKEN/);
  });
});
