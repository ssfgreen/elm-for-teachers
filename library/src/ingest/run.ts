import { sha256 } from '../core/version.js';
import type { Fetcher } from './fetcher.js';
import type { Adapter, LockEntry, ReportLine, SourceRef } from './types.js';

/** Where a collection's files live. The real one is a folder; tests use a map. */
export interface Store {
  read(path: string): string | null;
  write(path: string, content: string): void;
  remove(path: string): void;
  exists(path: string): boolean;
}

export interface RunOptions {
  /** Convert every source again, even when it has not changed (after changing a converter). */
  force?: boolean;
  now?: () => Date;
  /** Called with each download, so it can be kept in a temporary folder for inspection. */
  saveDownload?: (url: string, body: Uint8Array) => void;
}

export const LOCK_FILE = 'sources.lock.json';

export function readLock(store: Store): LockEntry[] {
  const text = store.read(LOCK_FILE);
  if (!text) return [];
  const parsed = JSON.parse(text) as { sources?: LockEntry[] };
  return parsed.sources ?? [];
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * Fetches every source, compares it with the lockfile (ETag and Last-Modified first, then the
 * content hash), converts what is new or changed, removes what has gone, and says which was which.
 * A source that fails keeps its last good documents.
 */
export async function runIngest(adapter: Adapter, fetcher: Fetcher, store: Store, options: RunOptions = {}): Promise<ReportLine[]> {
  const now = options.now?.() ?? new Date();
  const refs = await adapter.discover(fetcher);
  const previous = new Map(readLock(store).map((e) => [e.url, e]));
  const next: LockEntry[] = [];
  const report: ReportLine[] = [];
  const claimed = new Set<string>();

  for (const ref of refs) {
    const old = previous.get(ref.url);
    previous.delete(ref.url);
    try {
      const line = await ingestOne(adapter, fetcher, store, ref, old, claimed, now, options);
      next.push(line.entry);
      report.push({ url: ref.url, status: line.status, docs: line.entry.docs });
    } catch (e) {
      if (old) {
        next.push(old);
        old.docs.forEach((d) => claimed.add(d));
      }
      report.push({ url: ref.url, status: 'failed', docs: old?.docs ?? [], error: (e as Error).message });
    }
  }

  for (const gone of previous.values()) {
    for (const doc of gone.docs) if (!claimed.has(doc)) store.remove(`docs/${doc}`);
    report.push({ url: gone.url, status: 'gone', docs: gone.docs });
  }

  next.sort((a, b) => (a.url < b.url ? -1 : 1));
  store.write(LOCK_FILE, json({ sources: next }));
  store.write('collection.json', json(adapter.meta));
  return report;
}

async function ingestOne(
  adapter: Adapter,
  fetcher: Fetcher,
  store: Store,
  ref: SourceRef,
  old: LockEntry | undefined,
  claimed: Set<string>,
  now: Date,
  options: RunOptions,
): Promise<{ entry: LockEntry; status: ReportLine['status'] }> {
  const docsThere = !!old && old.docs.length > 0 && old.docs.every((d) => store.exists(`docs/${d}`));
  const keep = (entry: LockEntry) => {
    entry.docs.forEach((d) => claimed.add(d));
    return { entry, status: 'unchanged' as const };
  };

  let body: Uint8Array;
  let etag: string | null = null;
  let lastModified: string | null = null;
  if (ref.inline) {
    body = new TextEncoder().encode(ref.inline.body);
    lastModified = ref.inline.lastModified;
  } else {
    const conditional = old && docsThere && !options.force ? { etag: old.etag, lastModified: old.last_modified } : {};
    const res = await fetcher.get(ref.url, conditional);
    if (res.status === 304 && old) return keep(old);
    if (res.status !== 200 || !res.body) throw new Error(`HTTP ${res.status}`);
    ({ body, etag, lastModified } = { body: res.body, etag: res.etag, lastModified: res.lastModified });
    options.saveDownload?.(ref.url, body);
  }

  const hash = sha256(body);
  const same = !!old && old.sha256 === hash;
  if (same && docsThere && !options.force) return keep({ ...old!, etag: etag ?? old!.etag, last_modified: lastModified ?? old!.last_modified });

  const fetchedAt = same ? old!.fetched_at : now.toISOString();
  const docs = await adapter.convert({ ref, body, sha256: hash, fetchedOn: fetchedAt.slice(0, 10), lastModified });
  for (const d of docs) if (claimed.has(d.path)) throw new Error(`two sources write docs/${d.path}`);
  const paths = docs.map((d) => d.path);
  for (const d of docs) store.write(`docs/${d.path}`, d.content);
  for (const stale of old?.docs ?? []) if (!paths.includes(stale)) store.remove(`docs/${stale}`);
  paths.forEach((p) => claimed.add(p));
  const entry: LockEntry = { url: ref.url, etag, last_modified: lastModified, sha256: hash, fetched_at: fetchedAt, docs: paths };
  return { entry, status: !old ? 'new' : same ? 'unchanged' : 'changed' };
}

/** The report as markdown: counts, then each source that is not unchanged. */
export function formatReport(collection: string, report: ReportLine[]): string {
  const order = ['new', 'changed', 'gone', 'failed', 'unchanged'] as const;
  const counts = order.map((s) => `${report.filter((r) => r.status === s).length} ${s}`).join(', ');
  const out = [`## ${collection}`, '', counts, ''];
  for (const status of order.slice(0, 4)) {
    const lines = report.filter((r) => r.status === status);
    if (lines.length === 0) continue;
    out.push(`### ${status[0]!.toUpperCase()}${status.slice(1)}`, '');
    for (const r of lines) out.push(`- ${r.url}${r.docs.length > 0 ? ` → ${r.docs.join(', ')}` : ''}${r.error ? ` (${r.error})` : ''}`);
    out.push('');
  }
  return `${out.join('\n').trimEnd()}\n`;
}
