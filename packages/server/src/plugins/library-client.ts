/**
 * Talks to a library server (library/, its API in docs/plugins.md) over HTTP. This app never
 * imports the library package: a library is another site, like ARASAAC. Calls are short, so a
 * slow or missing library costs the turn seconds, not minutes.
 */

import { cappedText } from './capped-text.js';

export type LibraryOp = 'search' | 'grep' | 'list' | 'read' | 'entries' | 'entry' | 'claims' | 'facets' | 'structure' | 'outcomes' | 'benchmarks';

export interface LibraryClient {
  /** The server's JSON answer; throws LibraryError with the server's reason when it refuses or cannot be reached. */
  call(collection: string, op: LibraryOp, body: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export class LibraryError extends Error {
  constructor(
    message: string,
    /** 400: the request was wrong (a bad pattern, say), so the model can fix it; otherwise the library failed. */
    readonly status: number | null,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 10_000;

/** For a server this app does not run (a studio draft, #159): no redirects, and answers of at most `maxBytes`. */
export interface StrictCalls {
  maxBytes: number;
}

/** `headers` go with every call: the library deployed beside the app (DEPLOY.md) needs its token. */
export function createLibraryClient(baseUrl: string, fetchFn: typeof fetch = fetch, timeoutMs = TIMEOUT_MS, headers: Record<string, string> = {}, strict?: StrictCalls): LibraryClient {
  const base = baseUrl.replace(/\/+$/, '');
  return {
    async call(collection, op, body) {
      let res: Response;
      try {
        res = await fetchFn(`${base}/api/collections/${encodeURIComponent(collection)}/${op}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
          ...(strict ? { redirect: 'error' as const } : {}),
        });
      } catch (err) {
        throw new LibraryError(`the library could not be reached (${err instanceof Error ? err.name : 'error'})`, null);
      }
      let json: unknown = null;
      try {
        if (strict) {
          const text = await cappedText(res, strict.maxBytes);
          if (text === null) throw new LibraryError('the answer was too big', res.status);
          json = JSON.parse(text);
        } else json = await res.json();
      } catch (err) {
        if (err instanceof LibraryError) throw err;
        // A non-JSON answer is reported by its status below.
      }
      const reason = json && typeof json === 'object' && typeof (json as { error?: unknown }).error === 'string' ? (json as { error: string }).error : null;
      if (!res.ok) throw new LibraryError(reason ?? `the library answered ${res.status}`, res.status);
      if (!json || typeof json !== 'object' || Array.isArray(json)) throw new LibraryError('the library sent an answer that is not JSON', res.status);
      return json as Record<string, unknown>;
    },
  };
}

const trimmed = (url: string) => url.replace(/\/+$/, '');

/**
 * A client for each library url. LIBRARY_URL's library, and no other (a plugin may name its own),
 * gets LIBRARY_TOKEN, and LIBRARY_BYPASS_SECRET when env/library.ts set one: only for the deployment's own
 * library on Vercel, never a LIBRARY_URL set by hand, which may be somebody else's server.
 */
export function libraryClientFor(
  env: { LIBRARY_URL?: string; LIBRARY_TOKEN?: string; LIBRARY_BYPASS_SECRET?: string },
  fetchFn: typeof fetch = fetch,
): (url: string) => LibraryClient {
  const own = env.LIBRARY_URL ? trimmed(env.LIBRARY_URL) : null;
  const bypass = env.LIBRARY_BYPASS_SECRET;
  const headers: Record<string, string> = {
    ...(env.LIBRARY_TOKEN ? { authorization: `Bearer ${env.LIBRARY_TOKEN}` } : {}),
    ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
  };
  return (url) => createLibraryClient(url, fetchFn, TIMEOUT_MS, own !== null && trimmed(url) === own ? headers : {});
}
