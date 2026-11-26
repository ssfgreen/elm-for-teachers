import { describe, expect, it } from 'vitest';
import { createArasaac, pictureOptions } from './arasaac.js';

/** Trimmed from a real `pictograms/en/search/apple` response (6 Nov 2026). */
const pic = (id: number, ...words: string[]) => ({ _id: id, keywords: words.map((keyword) => ({ type: 2, keyword, hasLocution: true })), tags: ['food'], sex: false, violence: false });
const APPLES = [pic(2462, 'apple'), pic(13645, 'apple'), pic(13644, 'apple')];
const MORE = [...APPLES, pic(3203, 'apple tree'), pic(9057, 'apple pie', 'pie'), pic(11403, 'apple juice')];
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

/** A fetch that answers from a table of URL → response, and records what was asked. */
function fakeFetch(routes: Record<string, () => Response>) {
  const asked: string[] = [];
  const fn = (async (url: string | URL) => {
    asked.push(String(url));
    const route = routes[String(url)];
    return route ? route() : new Response('[]', { status: 404 });
  }) as typeof fetch;
  return { fn, asked };
}
const json = (body: unknown) => () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

describe('pictureOptions', () => {
  it('keeps id and up to three keywords, and leaves out flagged or unnamed pictures', () => {
    const body = [pic(1, 'apple pie', 'pie', 'cake', 'tart'), { ...pic(2, 'x'), sex: true }, { ...pic(3, 'y'), violence: true }, pic(4), { keywords: [] }, 'junk'];
    expect(pictureOptions(body)).toEqual([{ id: 1, label: 'apple pie / pie / cake' }]);
    expect(pictureOptions({ error: 'nope' })).toEqual([]);
  });
});

describe('createArasaac', () => {
  it('tops up exact matches with the looser search, without repeats, at most four', async () => {
    const { fn, asked } = fakeFetch({
      'https://api.arasaac.org/v1/pictograms/en/bestsearch/apple': json(APPLES),
      'https://api.arasaac.org/v1/pictograms/en/search/apple': json(MORE),
    });
    const found = await createArasaac(fn).search('apple');
    expect(found.map((p) => p.id)).toEqual([2462, 13645, 13644, 3203]);
    expect(asked).toHaveLength(2);
  });

  it('does not search again when exact matches fill the row', async () => {
    const { fn, asked } = fakeFetch({ 'https://api.arasaac.org/v1/pictograms/en/bestsearch/apple': json(MORE) });
    expect(await createArasaac(fn).search('apple', 2)).toHaveLength(2);
    expect(asked).toHaveLength(1);
  });

  it('finds nothing when ARASAAC has nothing, fails or cannot be reached', async () => {
    expect(await createArasaac(fakeFetch({}).fn).search('qzxw')).toEqual([]);
    const down = (async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    expect(await createArasaac(down).search('apple')).toEqual([]);
    expect(await createArasaac(down).search('   ')).toEqual([]);
  });

  it('puts the words into the path, encoded', async () => {
    const { fn, asked } = fakeFetch({});
    await createArasaac(fn).search('water cycle/x');
    expect(asked[0]).toBe('https://api.arasaac.org/v1/pictograms/en/bestsearch/water%20cycle%2Fx');
  });

  it('fetches a picture as a PNG, and nothing else', async () => {
    const png = () => new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } });
    const { fn } = fakeFetch({
      'https://static.arasaac.org/pictograms/2462/2462_500.png': png,
      'https://static.arasaac.org/pictograms/7/7_500.png': () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    });
    const lib = createArasaac(fn);
    expect(await lib.image(2462)).toEqual(PNG);
    expect(await lib.image(7)).toBeNull();
    expect(await lib.image(8)).toBeNull();
    expect(await lib.image(-1)).toBeNull();
  });
});
