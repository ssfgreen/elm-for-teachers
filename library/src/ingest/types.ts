import type { CollectionMeta } from '../core/types.js';
import type { Fetcher } from './fetcher.js';

/** One thing to fetch and convert: a PDF, or a record an API already gave in full. */
export interface SourceRef {
  url: string;
  /** Whatever the adapter needs to convert it, such as the area name from a link. */
  data?: Record<string, unknown>;
  /** The content, when discovery already fetched it (one API call lists every record). */
  inline?: { body: string; lastModified: string | null };
}

export interface FetchedSource {
  ref: SourceRef;
  body: Uint8Array;
  sha256: string;
  /** The day it was fetched, `2026-11-08`, for frontmatter. */
  fetchedOn: string;
  lastModified: string | null;
}

/** A markdown file to write, with its path under `docs/`. */
export interface OutputDoc {
  path: string;
  content: string;
}

/** One collection's sources: how to find them and how to turn each into markdown. */
export interface Adapter {
  meta: CollectionMeta;
  discover(fetcher: Fetcher): Promise<SourceRef[]>;
  convert(source: FetchedSource): Promise<OutputDoc[]>;
}

/** A line of `sources.lock.json`. `docs` records which files came from the source. */
export interface LockEntry {
  url: string;
  etag: string | null;
  last_modified: string | null;
  sha256: string;
  fetched_at: string;
  docs: string[];
}

export type SourceStatus = 'new' | 'changed' | 'unchanged' | 'gone' | 'failed';

export interface ReportLine {
  url: string;
  status: SourceStatus;
  docs: string[];
  error?: string;
}
