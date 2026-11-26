import { describe, expect, it } from 'vitest';
import { LibraryError } from '../library-client.js';
import { createDraftRunner, manifestOf, withoutAddress } from './runner.js';

const CODE = 'Secret_Code-123456';
const ADDRESS = `https://studio.example/d/${CODE}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const HASH = `sha256:${'b'.repeat(64)}`;

describe('reading a draft for a turn', () => {
  it("takes a pedagogy collection first, else the first documents one, and the studio's own content hash", () => {
    const both = { content_hash: HASH, description: 'Phonics\n games', collections: [{ id: 'notes', kind: 'documents' }, { id: 'phonics', kind: 'pedagogy' }] };
    expect(manifestOf(both, '{}')).toEqual({ content_hash: HASH, collection: { id: 'phonics', kind: 'pedagogy' }, description: 'Phonics games' });
    expect(manifestOf({ manifest: { collections: [{ id: 'x', kind: 'curriculum' }, { id: 'notes', kind: 'documents' }] } }, '{}').collection).toEqual({ id: 'notes', kind: 'library' });
    expect(manifestOf({ plugin: { collections: [{ id: 'p', kind: 'pedagogy' }] } }, '{}').collection).toEqual({ id: 'p', kind: 'pedagogy' });
  });

  it('falls back to a hash of the answer, as E1a does, and has no collection when it names none it can use', () => {
    const m = manifestOf({ content_hash: 'not a hash', collections: [{ kind: 'documents' }] }, 'text');
    expect(m.content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(m.collection).toBeNull();
    expect(m.description).toBeNull();
  });

  it('reads the manifest at the address, and calls its tools under it', async () => {
    const urls: string[] = [];
    const fetchFn = (async (url: string) => {
      urls.push(url);
      return url === ADDRESS ? json({ collections: [{ id: 'notes', kind: 'documents' }] }) : json({ results: [] });
    }) as unknown as typeof fetch;
    const runner = createDraftRunner(fetchFn);
    expect((await runner.read(ADDRESS))?.collection).toEqual({ id: 'notes', kind: 'library' });
    expect(await runner.client(ADDRESS).call('notes', 'search', { query: 'similes' })).toEqual({ results: [] });
    expect(urls).toEqual([ADDRESS, `${ADDRESS}/api/collections/notes/search`]);
  });

  it('gives null when the studio is down, slow or answers something else', async () => {
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const slow = ((_: string, init: RequestInit) => new Promise((_r, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))) as unknown as typeof fetch;
    const html = (async () => new Response('<p>hi</p>', { headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch;
    expect(await createDraftRunner(down).read(ADDRESS)).toBeNull();
    expect(await createDraftRunner(slow, 20).read(ADDRESS)).toBeNull();
    expect(await createDraftRunner(html).read(ADDRESS)).toBeNull();
  });

  it("takes the address and its code out of a tool's error", async () => {
    const refuses = (async () => json({ error: `no such collection at ${ADDRESS}/api/collections/x (code ${CODE})` }, 404)) as unknown as typeof fetch;
    const err = await createDraftRunner(refuses).client(ADDRESS).call('x', 'read', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LibraryError);
    expect((err as LibraryError).status).toBe(404);
    expect((err as Error).message).not.toContain(CODE);
    expect(withoutAddress(`${ADDRESS}/x`, ADDRESS)).toBe('the draft/x');
  });

  it('calls its tools with no redirects and refuses an answer over 256 KB, as the read on add', async () => {
    const inits: RequestInit[] = [];
    let body = JSON.stringify({ results: [] });
    const fetchFn = (async (_url: string, init: RequestInit) => {
      inits.push(init);
      return new Response(body, { headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    const client = createDraftRunner(fetchFn).client(ADDRESS);
    await client.call('notes', 'search', { query: 'x' });
    expect(inits[0]!.redirect).toBe('error');
    body = JSON.stringify({ results: 'x'.repeat(256 * 1024) });
    await expect(client.call('notes', 'search', { query: 'x' })).rejects.toThrow('too big');
  });
});
