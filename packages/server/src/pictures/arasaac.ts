/**
 * ARASAAC (arasaac.org), a free library of pictograms from the Government of Aragón, made for
 * teaching and communication. The assistant searches it before drawing a picture itself
 * (tools/search-pictures.ts), and a picture the teacher keeps is copied into the session as an
 * ordinary PNG asset. Licence: CC BY-NC-SA 4.0, credit "ARASAAC (arasaac.org)".
 *
 * Search: `bestsearch` gives exact matches; when it has fewer than `max`, `search` (looser: "water
 * cycle" finds boats) tops them up. Pictures ARASAAC marks as sexual or violent are left out.
 */

/** One picture found: its ARASAAC id and what it shows (its keywords, best first). */
export interface PictureOption {
  id: number;
  label: string;
}

/** What the server needs of a picture library: searching it and fetching a picture's PNG. */
export interface PictureLibrary {
  search(query: string, max?: number): Promise<PictureOption[]>;
  /** The picture as a PNG, or null when it cannot be had. */
  image(id: number): Promise<Buffer | null>;
}

export const ARASAAC_API = 'https://api.arasaac.org/v1';
export const ARASAAC_STATIC = 'https://static.arasaac.org';

const MAX_PICTURE_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 8000;

/** The PNG of a picture, 500 pixels square: big enough to print, small enough to store. */
export const arasaacImageUrl = (id: number, size: 300 | 500 = 500) => `${ARASAAC_STATIC}/pictograms/${id}/${id}_${size}.png`;

interface RawPictogram {
  _id?: unknown;
  keywords?: { keyword?: unknown }[];
  sex?: unknown;
  violence?: unknown;
}

/** The pictures in a search response that can be offered, in order. */
export function pictureOptions(body: unknown): PictureOption[] {
  if (!Array.isArray(body)) return [];
  const out: PictureOption[] = [];
  for (const p of body as RawPictogram[]) {
    if (typeof p?._id !== 'number' || p.sex === true || p.violence === true) continue;
    const words = [...new Set((p.keywords ?? []).map((k) => (typeof k?.keyword === 'string' ? k.keyword.trim() : '')).filter(Boolean))];
    if (words.length === 0) continue;
    out.push({ id: p._id, label: words.slice(0, 3).join(' / ') });
  }
  return out;
}

export function createArasaac(fetchFn: typeof fetch = fetch, opts: { api?: string; language?: string } = {}): PictureLibrary {
  const api = opts.api ?? ARASAAC_API;
  const language = opts.language ?? 'en';
  const get = (url: string) => fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' } });

  /** One search endpoint's pictures; nothing found is a 404 with `[]`, so any failure is none. */
  async function find(kind: 'bestsearch' | 'search', query: string): Promise<PictureOption[]> {
    try {
      const res = await get(`${api}/pictograms/${language}/${kind}/${encodeURIComponent(query)}`);
      return res.ok ? pictureOptions(await res.json()) : [];
    } catch {
      return [];
    }
  }

  return {
    async search(query, max = 4) {
      const q = query.trim().slice(0, 100);
      if (!q) return [];
      const best = await find('bestsearch', q);
      const more = best.length >= max ? [] : await find('search', q);
      const seen = new Set<number>();
      return [...best, ...more].filter((p) => !seen.has(p.id) && seen.add(p.id)).slice(0, max);
    },
    async image(id) {
      if (!Number.isInteger(id) || id <= 0) return null;
      try {
        const res = await fetchFn(arasaacImageUrl(id), { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/png')) return null;
        const data = Buffer.from(await res.arrayBuffer());
        return data.length > 0 && data.length <= MAX_PICTURE_BYTES ? data : null;
      } catch {
        return null;
      }
    },
  };
}
