export const USER_AGENT = 'edw-library-bot/0.1';
// Lesson zips and slide decks with video run to about 75 MB; only their text parts are unpacked.
const MAX_BYTES = 100_000_000;

export interface Conditional {
  etag?: string | null;
  lastModified?: string | null;
}

export interface FetchResult {
  status: number;
  body: Uint8Array | null;
  etag: string | null;
  lastModified: string | null;
  headers: Headers;
}

export interface FetcherOptions {
  allowedHosts: string[];
  delayMs?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * A polite HTTP client: one request at a time with a pause between, a named User-Agent,
 * conditional requests, and only to the hosts a collection names.
 */
export class Fetcher {
  private queue: Promise<unknown> = Promise.resolve();
  private last = 0;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly delayMs: number;

  constructor(private readonly options: FetcherOptions) {
    this.fetchFn = options.fetch ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.delayMs = options.delayMs ?? 1000;
  }

  private check(url: string) {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !this.options.allowedHosts.includes(u.hostname)) throw new Error(`not an allowed host: ${u.hostname}`);
  }

  get(url: string, conditional: Conditional = {}): Promise<FetchResult> {
    const run = this.queue.then(() => this.send(url, conditional));
    this.queue = run.catch(() => undefined);
    return run;
  }

  async getText(url: string): Promise<string> {
    const res = await this.get(url);
    if (res.status !== 200 || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
    return new TextDecoder().decode(res.body);
  }

  private async send(url: string, conditional: Conditional): Promise<FetchResult> {
    this.check(url);
    const wait = this.last + this.delayMs - Date.now();
    if (this.last > 0 && wait > 0) await this.sleep(wait);
    const headers: Record<string, string> = { 'user-agent': USER_AGENT };
    if (conditional.etag) headers['if-none-match'] = conditional.etag;
    if (conditional.lastModified) headers['if-modified-since'] = conditional.lastModified;
    try {
      const res = await this.fetchFn(url, { headers, redirect: 'follow' });
      if (res.url) this.check(res.url);
      const etag = res.headers.get('etag');
      const lastModified = res.headers.get('last-modified');
      if (res.status !== 200) return { status: res.status, body: null, etag, lastModified, headers: res.headers };
      const length = Number(res.headers.get('content-length') ?? 0);
      if (length > MAX_BYTES) throw new Error(`${url}: over ${MAX_BYTES} bytes`);
      const body = new Uint8Array(await res.arrayBuffer());
      if (body.length > MAX_BYTES) throw new Error(`${url}: over ${MAX_BYTES} bytes`);
      return { status: 200, body, etag, lastModified, headers: res.headers };
    } finally {
      this.last = Date.now();
    }
  }
}
