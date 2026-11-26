import { describe, expect, it } from 'vitest';
import { Fetcher } from './fetcher.js';
import { formatReport, readLock, runIngest } from './run.js';
import { memoryStore } from './store.js';
import type { Adapter, LockEntry } from './types.js';

const META = { id: 't', name: 'T', publisher: 'P', description: 'D', licence: 'L', licence_url: null, homepage: 'https://a.example', sources: [] };

/** A site whose files can be changed between runs, answering conditional requests. */
function site(initial: Record<string, string>) {
  const files = new Map(Object.entries(initial));
  const requests: { url: string; headers: Record<string, string> }[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    requests.push({ url, headers });
    const body = files.get(url);
    if (body === undefined) return new Response('missing', { status: 404 });
    const etag = `"${body.length}-${body.charCodeAt(0)}"`;
    if (headers['if-none-match'] === etag) return new Response(null, { status: 304, headers: { etag } });
    return new Response(body, { status: 200, headers: { etag, 'last-modified': 'Sat, 01 Nov 2026 00:00:00 GMT' } });
  }) as typeof globalThis.fetch;
  const fetcher = new Fetcher({ allowedHosts: ['a.example'], delayMs: 0, fetch });
  return { files, requests, fetcher };
}

function adapter(urls: () => string[]): Adapter & { converted: string[] } {
  const converted: string[] = [];
  return {
    meta: META,
    converted,
    discover: async () => urls().map((url) => ({ url })),
    convert: async (s) => {
      converted.push(s.ref.url);
      const name = s.ref.url.split('/').pop()!;
      return [{ path: `${name}.md`, content: `---\nfetched_at: ${s.fetchedOn}\n---\n\n${new TextDecoder().decode(s.body)}\n` }];
    },
  };
}

const statuses = (r: { url: string; status: string }[]) => Object.fromEntries(r.map((l) => [l.url.split('/').pop(), l.status]));

describe('runIngest', () => {
  it('reports new, unchanged, changed, gone and failed, and converts only what changed', async () => {
    const s = site({ 'https://a.example/one': 'first', 'https://a.example/two': 'second' });
    let urls = ['https://a.example/one', 'https://a.example/two'];
    const store = memoryStore();
    const a = adapter(() => urls);
    const day1 = () => new Date('2026-11-01T10:00:00Z');

    expect(statuses(await runIngest(a, s.fetcher, store, { now: day1 }))).toEqual({ one: 'new', two: 'new' });
    expect(store.files.get('docs/one.md')).toContain('first');
    const lock = readLock(store);
    expect(lock.map((e: LockEntry) => Object.keys(e).sort())[0]).toEqual(['docs', 'etag', 'fetched_at', 'last_modified', 'sha256', 'url']);

    s.files.set('https://a.example/two', 'second, changed');
    urls = ['https://a.example/one', 'https://a.example/two', 'https://a.example/three'];
    a.converted.length = 0;
    const day2 = () => new Date('2026-11-08T10:00:00Z');
    expect(statuses(await runIngest(a, s.fetcher, store, { now: day2 }))).toEqual({ one: 'unchanged', two: 'changed', three: 'failed' });
    expect(a.converted).toEqual(['https://a.example/two']);
    expect(s.requests.find((r) => r.url.endsWith('/one') && r.headers['if-none-match'])).toBeDefined();
    expect(store.files.get('docs/two.md')).toContain('fetched_at: 2026-11-08');
    expect(readLock(store).find((e) => e.url.endsWith('/one'))!.fetched_at).toBe('2026-11-01T10:00:00.000Z');

    urls = ['https://a.example/two'];
    const report = await runIngest(a, s.fetcher, store, { now: day2 });
    expect(statuses(report)).toEqual({ two: 'unchanged', one: 'gone' });
    expect(store.files.has('docs/one.md')).toBe(false);
    expect(formatReport('t', report)).toContain('0 new, 0 changed, 1 gone, 0 failed, 1 unchanged');
  });

  it('keeps the last good documents when a source fails', async () => {
    const s = site({ 'https://a.example/one': 'first' });
    const store = memoryStore();
    const a = adapter(() => ['https://a.example/one']);
    await runIngest(a, s.fetcher, store);
    s.files.delete('https://a.example/one');
    const report = await runIngest(a, s.fetcher, store);
    expect(report[0]).toMatchObject({ status: 'failed', error: 'HTTP 404' });
    expect(store.files.get('docs/one.md')).toContain('first');
    expect(readLock(store)).toHaveLength(1);
  });

  it('converts again with force, and when the documents are missing, keeping the fetch date', async () => {
    const s = site({ 'https://a.example/one': 'first' });
    const store = memoryStore();
    const a = adapter(() => ['https://a.example/one']);
    await runIngest(a, s.fetcher, store, { now: () => new Date('2026-11-01T00:00:00Z') });
    store.remove('docs/one.md');
    a.converted.length = 0;
    expect(statuses(await runIngest(a, s.fetcher, store))).toEqual({ one: 'unchanged' });
    expect(a.converted).toHaveLength(1);
    expect(store.files.get('docs/one.md')).toContain('fetched_at: 2026-11-01');
    await runIngest(a, s.fetcher, store, { force: true });
    expect(a.converted).toHaveLength(2);
  });

  it('uses inline content without fetching', async () => {
    const s = site({});
    const store = memoryStore();
    const a = adapter(() => []);
    a.discover = async () => [{ url: 'https://a.example/r/1', inline: { body: 'record', lastModified: '2026-10-01T00:00:00' } }];
    expect(statuses(await runIngest(a, s.fetcher, store))).toEqual({ 1: 'new' });
    expect(s.requests).toHaveLength(0);
    expect(readLock(store)[0]!.last_modified).toBe('2026-10-01T00:00:00');
  });
});

describe('Fetcher', () => {
  it('refuses hosts it was not given and sends its name', async () => {
    const s = site({ 'https://a.example/x': 'x' });
    await expect(s.fetcher.get('https://b.example/x')).rejects.toThrow(/allowed/);
    await expect(s.fetcher.get('http://a.example/x')).rejects.toThrow(/allowed/);
    await s.fetcher.get('https://a.example/x');
    expect(s.requests[0]!.headers['user-agent']).toBe('edw-library-bot/0.1');
  });

  it('waits between requests', async () => {
    const waits: number[] = [];
    const fetcher = new Fetcher({ allowedHosts: ['a.example'], delayMs: 1000, fetch: (async () => new Response('x')) as typeof fetch, sleep: async (ms) => void waits.push(ms) });
    await Promise.all([fetcher.get('https://a.example/1'), fetcher.get('https://a.example/2'), fetcher.get('https://a.example/3')]);
    expect(waits).toHaveLength(2);
    expect(waits.every((w) => w > 900)).toBe(true);
  });
});
