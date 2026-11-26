/**
 * The pedagogy library (library/pedagogy-sample/HANDOFF.md), for the teacher to browse: entries
 * by type and by stage, subject, barrier or hint, each with its evidence and claims. It is what
 * the assistant grounds its choices on in a class chat and cites with "i". Every entry is a draft
 * that no educator has reviewed yet, and the screen says so.
 */
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import type { PedagogyApi } from '../../api/pedagogy';
import type { EventLogger } from '../../events/logger';
import { Input } from '../../components/ui/input';
import { screenClass } from '../classes/styles';
import { EntryBadges } from './EntryBadges';
import { EntryDetail } from './EntryDetail';
import { facetLabel, facetOptions, TYPE_DESCRIPTIONS, TYPE_LABELS } from './labels';
import { NO_FILTERS, usePedagogy, type PedagogyFilters } from './usePedagogy';

export interface PedagogyScreenProps {
  api: Partial<PedagogyApi>;
  logger: Pick<EventLogger, 'log'>;
  /** Opened on an entry (a curriculum item from the sidebar), or filtered to what aligns to some. */
  entryId?: string;
  alignsTo?: string[];
  /** How the teacher knows what `alignsTo` names: an outcome's code, such as LIT 2-01a. */
  alignsLabel?: string;
}

const SELECTS: { key: 'stage' | 'subject' | 'barrier' | 'hint'; facet: string; label: string }[] = [
  { key: 'stage', facet: 'stage', label: 'Stage' },
  { key: 'subject', facet: 'subject', label: 'Subject' },
  { key: 'barrier', facet: 'barrier', label: 'Barrier' },
  { key: 'hint', facet: 'often_relevant_to', label: 'Often relevant to' },
];

export function PedagogyScreen({ api, logger, entryId, alignsTo, alignsLabel }: PedagogyScreenProps) {
  const [filters, setFilters] = useState<PedagogyFilters>({ ...NO_FILTERS, alignsTo: alignsTo ?? null });
  const [openId, setOpenId] = useState<string | null>(entryId ?? null);
  const { info, entries, entry, failed } = usePedagogy(api, filters, openId);
  const alignsKey = alignsTo?.join(',');
  useEffect(() => {
    setOpenId(entryId ?? null);
    setFilters({ ...NO_FILTERS, alignsTo: alignsKey ? alignsKey.split(',') : null });
  }, [entryId, alignsKey]);
  useEffect(() => {
    logger.log('pedagogy_open', { entry_id: openId });
  }, [logger, openId]);

  const set = (patch: Partial<PedagogyFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const count = info?.counts;
  return (
    <div className={screenClass} data-make-part="pedagogy">
      <div className="mx-auto flex max-w-220 flex-col gap-5 px-6 py-10">
        <header className="flex flex-col gap-1.5">
          <h1 className="m-0 text-3xl leading-tight font-semibold">Pedagogy</h1>
          <p className="m-0 text-md text-foreground-2">
            What the assistant grounds its teaching choices in for your classes: principles, activities, subject pedagogies, adaptations for pupils, format rules and cautions. In a class’s chat it cites them, and the “i” after a sentence shows the source.
          </p>
          <p className="m-0 rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm text-warning" role="note">
            A draft sample: no teacher or specialist has reviewed these entries yet, and most sources’ licences are still to be confirmed.{count ? ` ${count.entries} entries, ${count.claims} claims from ${count.sources} sources.` : ''}
          </p>
        </header>
        {failed && (
          <p className="error-text" role="alert">
            {failed}
          </p>
        )}
        {info && !info.available && <p className="m-0 text-md text-muted-foreground">No pedagogy library is set up here yet.</p>}
        {info?.available && openId && entry && entry.entry.id === openId && <EntryDetail detail={entry} onOpen={setOpenId} onBack={() => setOpenId(null)} />}
        {info?.available && !openId && (
          <>
            <div role="radiogroup" aria-label="Type" className="flex flex-wrap gap-1">
              {[null, ...Object.keys(TYPE_LABELS)].map((t) => (
                <button
                  key={t ?? 'all'}
                  type="button"
                  role="radio"
                  aria-checked={filters.type === t}
                  className="rounded-full border border-border px-3 py-1 text-sm text-foreground-2 hover:bg-hover aria-checked:border-border-strong aria-checked:bg-pressed aria-checked:text-foreground"
                  onClick={() => set({ type: t })}
                >
                  {t ? `${TYPE_LABELS[t]} ${info.types?.[t] ?? 0}` : 'All'}
                </button>
              ))}
            </div>
            {filters.type && TYPE_DESCRIPTIONS[filters.type] && (
              <section aria-label="About this type" className="-mt-2 max-w-170 text-md text-foreground-2">
                {TYPE_DESCRIPTIONS[filters.type]}
              </section>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <label className="relative min-w-56 flex-1">
                <span className="sr-only">Search the pedagogy library</span>
                <Search size={15} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
                <Input type="search" className="w-full pl-8" placeholder="Words, such as spacing or source" value={filters.text} onChange={(e) => set({ text: e.target.value })} />
              </label>
              {SELECTS.map((s) => (
                <label key={s.key} className="flex flex-col gap-0.5 text-sm text-foreground-2">
                  {s.label}
                  <select className="rounded-sm border border-border bg-card px-1.5 py-1 text-md text-foreground" value={filters[s.key] ?? ''} onChange={(e) => set({ [s.key]: e.target.value || null })}>
                    <option value="">Any</option>
                    {facetOptions(info.facets?.[s.facet]).map((o) => (
                      <option key={o.value} value={o.value}>
                        {facetLabel(o.value)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {filters.alignsTo && (
              <p className="m-0 flex items-center gap-2 text-sm text-foreground-2">
                {alignsLabel ? `Teaching ideas for ${alignsLabel}.` : `Showing what aligns to ${filters.alignsTo.join(', ')}.`}
                <button type="button" className="border-0 bg-transparent p-0 text-primary underline" onClick={() => set({ alignsTo: null })}>
                  Show everything
                </button>
              </p>
            )}
            {filters.hint && <p className="m-0 text-sm text-foreground-2">A hint for where to look, not a rule: pupils with the same diagnosis can need different things.</p>}
            {entries && entries.list.length === 0 && (
              <p className="m-0 text-md text-muted-foreground">
                {filters.alignsTo && alignsLabel ? `The library has nothing for ${alignsLabel} yet: it is a small sample so far. Show everything to browse it all.` : 'Nothing matches that. Try fewer filters.'}
              </p>
            )}
            <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Entries">
              {entries?.list.map((e) => (
                <li key={e.id}>
                  <button type="button" className="flex w-full flex-col gap-1 rounded-lg border border-border bg-card p-3 text-left shadow-card hover:border-border-strong" onClick={() => setOpenId(e.id)}>
                    <span className="text-md font-semibold">{e.title}</span>
                    <EntryBadges type={e.type} evidence={e.evidence} status={e.status} changesGoal={e.changes_goal} />
                    <span className="text-sm text-foreground-2">{e.summary}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
