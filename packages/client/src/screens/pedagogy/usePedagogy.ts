/**
 * The Pedagogy screen's data: what the library holds, the entries matching the filters, and the
 * entry open. Each fetch that is overtaken by a newer one is ignored.
 */
import { useEffect, useState } from 'react';
import type { EntriesQuery, EntryBrief, EntryDetail, PedagogyApi, PedagogyInfo } from '../../api/pedagogy';

export interface PedagogyFilters {
  type: string | null;
  stage: string | null;
  subject: string | null;
  barrier: string | null;
  hint: string | null;
  text: string;
  /** Entries aligned to these curriculum entries (from the sidebar's Curriculum). */
  alignsTo: string[] | null;
}

export const NO_FILTERS: PedagogyFilters = { type: null, stage: null, subject: null, barrier: null, hint: null, text: '', alignsTo: null };

/** The library query for the filters. Pure. */
export function queryFor(f: PedagogyFilters): EntriesQuery {
  const facets: Record<string, string[]> = {};
  if (f.stage) facets.stage = [f.stage];
  if (f.subject) facets.subject = [f.subject];
  if (f.barrier) facets.barrier = [f.barrier];
  if (f.hint) facets.often_relevant_to = [f.hint];
  return {
    ...(f.type ? { types: [f.type] } : {}),
    ...(Object.keys(facets).length ? { facets } : {}),
    ...(f.text.trim() ? { text: f.text.trim() } : {}),
    ...(f.alignsTo ? { aligns_to: f.alignsTo } : {}),
    limit: 120,
  };
}

type Api = Partial<PedagogyApi>;

export function usePedagogy(api: Api, filters: PedagogyFilters, openId: string | null) {
  const [info, setInfo] = useState<PedagogyInfo | null>(null);
  const [entries, setEntries] = useState<{ total: number; list: EntryBrief[] } | null>(null);
  const [entry, setEntry] = useState<EntryDetail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .pedagogyInfo?.()
      .then((i) => !cancelled && setInfo(i))
      .catch(() => !cancelled && setFailed('The pedagogy library could not be reached. Please try again later.'));
    return () => {
      cancelled = true;
    };
  }, [api]);

  const key = JSON.stringify(queryFor(filters));
  useEffect(() => {
    if (!info?.available || !api.pedagogyEntries) return;
    let cancelled = false;
    // An earlier query's entries never show under new filters.
    setEntries(null);
    const t = setTimeout(() => {
      api.pedagogyEntries!(JSON.parse(key) as EntriesQuery)
        .then((r) => !cancelled && setEntries({ total: r.total, list: r.entries }))
        .catch(() => !cancelled && setFailed('The entries could not be loaded.'));
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [api, info?.available, key]);

  useEffect(() => {
    if (!openId || !api.pedagogyEntry) {
      setEntry(null);
      return;
    }
    let cancelled = false;
    api
      .pedagogyEntry(openId)
      .then((e) => !cancelled && setEntry(e))
      .catch(() => !cancelled && setFailed('That entry could not be loaded.'));
    return () => {
      cancelled = true;
    };
  }, [api, openId]);

  return { info, entries, entry, failed };
}
