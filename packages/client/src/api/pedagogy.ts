/**
 * The pedagogy library, through the app's server (which reaches the library server over HTTP):
 * entries by type and facets, one entry in full, and claims for the "i" hovers. Every entry is a
 * draft until educators review it.
 */
import { api, type ApiOptions } from './http';

export type Verification = 'located' | 'locator_to_confirm' | 'not_fetched';

export interface ClaimBrief {
  id: string;
  text: string;
  support_type: 'direct_quote' | 'paraphrase' | 'inference_by_curator';
}

export interface EntryBrief {
  id: string;
  type: string;
  title: string;
  summary: string;
  status: string;
  evidence: string | null;
  changes_goal?: boolean;
  facets: Partial<Record<'stage' | 'subject' | 'lesson_purpose' | 'barrier' | 'often_relevant_to', string[]>>;
  claims: ClaimBrief[];
}

export interface ClaimDetail extends ClaimBrief {
  verification: Verification;
  entry: { id: string; title: string; type: string; status: string };
  passages: {
    id: string;
    locator: string;
    text: string;
    excerpt_type: 'quote' | 'paraphrase';
    verified_by_fetch: boolean;
    source: { id: string; title: string; publisher: string; year: number | null; url: string; evidence_weight: string; licence: string; reuse_rule: string };
  }[];
}

export interface EntryDetail {
  entry: Omit<EntryBrief, 'claims' | 'facets'> & {
    body: string;
    facets: Record<string, unknown>;
    prerequisites: string[];
    risks: string[];
    artefact_recipes: Record<string, string>;
    claims: ClaimDetail[];
    reviewed_by: string[];
  };
  related: Record<string, { id: string; type: string; title: string }[]>;
  linked_from: Record<string, { id: string; type: string; title: string }[]>;
}

export interface PedagogyInfo {
  available: boolean;
  name?: string;
  version?: string;
  counts?: { sources: number; passages: number; entries: number; claims: number };
  types?: Record<string, number>;
  statuses?: Record<string, number>;
  facets?: Record<string, Record<string, number>>;
}

export interface EntriesQuery {
  types?: string[];
  ids?: string[];
  facets?: Record<string, string[]>;
  aligns_to?: string[];
  text?: string;
  limit?: number;
}

export interface PedagogyApi {
  pedagogyInfo(): Promise<PedagogyInfo>;
  pedagogyEntries(q: EntriesQuery): Promise<{ total: number; truncated: boolean; entries: EntryBrief[] }>;
  pedagogyEntry(id: string): Promise<EntryDetail>;
  pedagogyClaims(ids: string[]): Promise<{ claims: ClaimDetail[]; missing: string[] }>;
}

export function pedagogyApi(sessionId: string, opts: ApiOptions): PedagogyApi {
  const base = `/sessions/${encodeURIComponent(sessionId)}/pedagogy`;
  return {
    pedagogyInfo: () => api<PedagogyInfo>('GET', base, undefined, opts),
    pedagogyEntries: (q) => api('POST', `${base}/entries`, { ...q }, opts),
    pedagogyEntry: (id) => api('POST', `${base}/entry`, { id }, opts),
    pedagogyClaims: (ids) => api('POST', `${base}/claims`, { ids }, opts),
  };
}
