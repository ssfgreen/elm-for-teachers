import { describe, expect, it } from 'vitest';
import { contentHashOf, DRAFT_NAME_PLACEHOLDER, readDraft } from './studio.js';

const answer = (body: string, type = 'application/json', status = 200) => (async () => new Response(body, { status, headers: { 'content-type': type } })) as unknown as typeof fetch;

describe('readDraft', () => {
  it("reads the draft's name and hashes the answer", async () => {
    const r = await readDraft('https://studio.example/d/abcdefgh', answer(JSON.stringify({ manifest: { name: '  Phonics\n helper ' } })));
    expect(r.name).toBe('Phonics helper');
    expect(r.content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('keeps a name to 80 characters', async () => {
    expect((await readDraft('https://studio.example/d/abcdefgh', answer(JSON.stringify({ name: 'x'.repeat(200) })))).name).toHaveLength(80);
  });

  it('gives the placeholder when the studio cannot be read', async () => {
    const thrown = (async () => {
      throw new Error('fetch failed: https://studio.example/d/abcdefgh');
    }) as unknown as typeof fetch;
    for (const f of [thrown, answer('<html></html>', 'text/html'), answer('{}', 'application/json', 404), answer('not json')]) {
      expect(await readDraft('https://studio.example/d/abcdefgh', f)).toEqual({ name: DRAFT_NAME_PLACEHOLDER, content_hash: null });
    }
  });

  it('gives up on an answer over 256 KB, by its stated length or as it is read', async () => {
    const big = JSON.stringify({ name: 'Big', pad: 'é'.repeat(140 * 1024) });
    expect(big.length).toBeLessThan(256 * 1024);
    const placeholder = { name: DRAFT_NAME_PLACEHOLDER, content_hash: null };
    expect(await readDraft('https://studio.example/d/abcdefgh', answer(big))).toEqual(placeholder);
    let read = false;
    const stated = (async () => new Response(new ReadableStream({ pull(c) { read = true; c.close(); } }, { highWaterMark: 0 }), { headers: { 'content-type': 'application/json', 'content-length': String(10 * 1024 * 1024) } })) as unknown as typeof fetch;
    expect(await readDraft('https://studio.example/d/abcdefgh', stated)).toEqual(placeholder);
    expect(read).toBe(false);
  });

  it('does not follow a redirect', async () => {
    let seen: RequestInit | undefined;
    await readDraft('https://studio.example/d/abcdefgh', (async (_u: string, init: RequestInit) => {
      seen = init;
      return new Response('{}');
    }) as unknown as typeof fetch);
    expect(seen?.redirect).toBe('error');
  });
});

describe('contentHashOf (#159)', () => {
  const hex = 'e'.repeat(64);
  it("takes the studio's own hash, plain or prefixed, at the top or in the manifest, always as sha256:<hex>", () => {
    expect(contentHashOf({ content_hash: hex }, '{}')).toBe(`sha256:${hex}`);
    expect(contentHashOf({ manifest: { content_hash: `sha256:${hex}` } }, '{}')).toBe(`sha256:${hex}`);
  });
  it('else hashes the answer, in the same form', () => {
    expect(contentHashOf({ content_hash: 'nonsense' }, 'abc')).toBe('sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
