/** Tiny typed fetch wrapper. All paths are relative to `/api`. */

export class ApiError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(`API ${status}: ${body.slice(0, 200)}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/** The `code` of an API error's JSON body (`{ error, code }`), if it has one. */
export function errorCode(e: unknown): string | null {
  if (!(e instanceof ApiError)) return null;
  try {
    const code = (JSON.parse(e.body) as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  } catch {
    return null;
  }
}

export type FetchImpl = typeof fetch;

let fetchImpl: FetchImpl | null = null;

/** Replace the fetch implementation (tests). Pass null to restore the global. */
export function setFetch(impl: FetchImpl | null): void {
  fetchImpl = impl;
}

export interface ApiOptions {
  token?: string;
  /** Per-call override, takes precedence over `setFetch`. */
  fetchImpl?: FetchImpl;
  keepalive?: boolean;
  /** Aborting it cancels the request (the chat's Stop). */
  signal?: AbortSignal;
}

/** A binary download (e.g. the session zip): the body as a Blob and the server's filename. */
export async function apiBlob(path: string, opts: ApiOptions = {}): Promise<{ blob: Blob; filename: string | null }> {
  const f: FetchImpl = opts.fetchImpl ?? fetchImpl ?? ((...a) => fetch(...a));
  const headers: Record<string, string> = {};
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  const res = await f(`/api${path.startsWith('/') ? path : `/${path}`}`, { method: 'GET', headers });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  const disposition = res.headers.get('Content-Disposition') ?? '';
  // Prefer the UTF-8 name (filename*=UTF-8''...) over the ASCII stand-in.
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const filename = encoded ? decodeURIComponent(encoded) : (/filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? null);
  return { blob: await res.blob(), filename };
}

export async function api<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: ApiOptions = {},
): Promise<T> {
  const f: FetchImpl = opts.fetchImpl ?? fetchImpl ?? ((...a) => fetch(...a));
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  const res = await f(`/api${path.startsWith('/') ? path : `/${path}`}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    keepalive: opts.keepalive,
  });
  const text = await res.text();
  if (!res.ok) throw new ApiError(res.status, text);
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * POST a JSON body and read an NDJSON answer line by line. An error status (sent before
 * any line) throws ApiError like `api()`.
 */
export async function apiLines(path: string, body: unknown, onLine: (value: unknown) => void, opts: ApiOptions = {}): Promise<void> {
  const f: FetchImpl = opts.fetchImpl ?? fetchImpl ?? ((...a) => fetch(...a));
  const headers: Record<string, string> = { Accept: 'application/x-ndjson', 'Content-Type': 'application/json' };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  const res = await f(`/api${path.startsWith('/') ? path : `/${path}`}`, { method: 'POST', headers, body: JSON.stringify(body), signal: opts.signal });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  const emit = (line: string) => {
    if (line.trim()) onLine(JSON.parse(line));
  };
  if (!res.body) {
    (await res.text()).split('\n').forEach(emit);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      emit(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  emit(buffer);
}
