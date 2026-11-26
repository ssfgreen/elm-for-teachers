import { describe, expect, it } from 'vitest';
import { createLibraryClient, LibraryError, libraryClientFor } from './library-client.js';

const answer = (status: number, body: unknown) => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('library client', () => {
  it('posts to the collection and operation, and returns the JSON', async () => {
    const seen: { url: string; body: unknown }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ version: 'v1', results: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await createLibraryClient('https://lib.example/', fetchFn).call('education-scotland-eo', 'search', { query: 'fractions' });
    expect(out).toEqual({ version: 'v1', results: [] });
    expect(seen).toEqual([{ url: 'https://lib.example/api/collections/education-scotland-eo/search', body: { query: 'fractions' } }]);
  });

  it("passes on the library's reason for a refusal, with its status", async () => {
    const client = createLibraryClient('https://lib.example', answer(400, { error: 'the pattern is not a valid regular expression' }) as unknown as typeof fetch);
    await expect(client.call('trails', 'grep', { pattern: '(' })).rejects.toMatchObject({ message: 'the pattern is not a valid regular expression', status: 400 });
  });

  it('reports a library that cannot be reached or sends no JSON', async () => {
    const down = createLibraryClient('https://lib.example', (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch);
    await expect(down.call('trails', 'list', {})).rejects.toBeInstanceOf(LibraryError);
    const html = createLibraryClient('https://lib.example', answer(200, '<html>') as unknown as typeof fetch);
    await expect(html.call('trails', 'list', {})).rejects.toThrow(/not JSON/);
  });

  it("sends LIBRARY_TOKEN to LIBRARY_URL's library only, never to a plugin's own", async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen.push({ url, auth: new Headers(init.headers).get('authorization') });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const clientFor = libraryClientFor({ LIBRARY_URL: 'https://app.example/library', LIBRARY_TOKEN: 's3cret' }, fetchFn);
    await clientFor('https://app.example/library').call('trails', 'list', {});
    await clientFor('https://elsewhere.example').call('trails', 'list', {});
    await libraryClientFor({ LIBRARY_URL: 'https://app.example/library' }, fetchFn)('https://app.example/library').call('trails', 'list', {});
    expect(seen).toEqual([
      { url: 'https://app.example/library/api/collections/trails/list', auth: 'Bearer s3cret' },
      { url: 'https://elsewhere.example/api/collections/trails/list', auth: null },
      { url: 'https://app.example/library/api/collections/trails/list', auth: null },
    ]);
  });

  const bypassSeen = () => {
    const seen: (string | null)[] = [];
    const fetchFn = (async (_url: string, init: RequestInit) => {
      seen.push(new Headers(init.headers).get('x-vercel-protection-bypass'));
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    return { seen, fetchFn };
  };

  it("sends Vercel's protection bypass to LIBRARY_URL only, when env.ts set one", async () => {
    const { seen, fetchFn } = bypassSeen();
    const clientFor = libraryClientFor({ LIBRARY_URL: 'https://edw-git-development.vercel.app/library', LIBRARY_TOKEN: 'tok', LIBRARY_BYPASS_SECRET: 'bypass' }, fetchFn);
    await clientFor('https://edw-git-development.vercel.app/library').call('trails', 'list', {});
    await clientFor('https://elsewhere.example').call('trails', 'list', {});
    expect(seen).toEqual(['bypass', null]);
  });

  // env/library.ts sets no LIBRARY_BYPASS_SECRET for a LIBRARY_URL set by hand (env/settings.test.ts).
  it("sends no protection bypass without LIBRARY_BYPASS_SECRET, and LIBRARY_TOKEN still goes", async () => {
    const { seen, fetchFn } = bypassSeen();
    const auth: (string | null)[] = [];
    const both = (async (url: string, init: RequestInit) => {
      auth.push(new Headers(init.headers).get('authorization'));
      return fetchFn(url, init);
    }) as unknown as typeof fetch;
    const byHand = { LIBRARY_URL: 'https://lib.example.org', LIBRARY_TOKEN: 'tok' };
    await libraryClientFor(byHand, both)('https://lib.example.org').call('trails', 'list', {});
    await libraryClientFor(byHand, both)('https://lib.example.org/').call('trails', 'list', {});
    expect(seen).toEqual([null, null]);
    expect(auth).toEqual(['Bearer tok', 'Bearer tok']);
  });
});
