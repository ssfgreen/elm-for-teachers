/**
 * Plugins: the plugins the assistant can use (docs/plugins.md), to browse, search and set a
 * trust level for each: Use freely, Ask first or Off, for the whole workspace. A change is saved
 * at once and logged on the server (plugin_trust_set). Above them, the workspace's drafts from the
 * plugin studio, when the server has drafts on (DraftsSection, useDrafts).
 */
import { useEffect, useState } from 'react';
import { BookOpen, ExternalLink, Image, Search } from 'lucide-react';
import { PluginTrust, type PluginInfo } from '@edw/shared';
import type { SessionApi } from '../../api/participant';
import type { Envelope } from '../../api/types';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { cn } from '../../lib/utils';
import { DraftsSection } from './DraftsSection';
import { useDrafts } from './useDrafts';
import { filterPlugins, TRUST_HINTS, TRUST_LABELS, type KindFilter } from './filterPlugins';

const KINDS: { id: KindFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'library', label: 'Libraries' },
  { id: 'pictures', label: 'Pictures' },
];

export function PluginsScreen({ api, getEnvelope }: { api: SessionApi; getEnvelope: () => Envelope }) {
  const [plugins, setPlugins] = useState<PluginInfo[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const drafts = useDrafts(api, getEnvelope);

  useEffect(() => {
    let cancelled = false;
    api
      .listPlugins?.()
      .then((ps) => !cancelled && setPlugins(Array.isArray(ps) ? ps : []))
      .catch(() => !cancelled && setFailed('The plugins could not be loaded. Please reload the page.'));
    return () => {
      cancelled = true;
    };
  }, [api]);

  const setTrust = (id: string, trust: PluginTrust) => {
    const before = plugins;
    setFailed(null);
    setPlugins((ps) => ps?.map((p) => (p.id === id ? { ...p, trust } : p)) ?? ps);
    api
      .setPluginTrust?.(id, trust, getEnvelope())
      .then((saved) => setPlugins((ps) => ps?.map((p) => (p.id === id ? saved : p)) ?? ps))
      .catch(() => {
        setPlugins(before);
        setFailed('That change could not be saved. Please try again.');
      });
  };

  const shown = plugins ? filterPlugins(plugins, query, kind) : [];
  return (
    <div className="min-w-0 flex-1 overflow-y-auto bg-background" data-make-part="plugins">
      <div className="mx-auto flex max-w-200 flex-col gap-5 px-6 py-10">
        <header className="flex flex-col gap-1.5">
          <h1 className="m-0 text-3xl leading-tight font-semibold">Plugins</h1>
          <p className="m-0 text-md text-foreground-2">
            Choose what the assistant can look in beyond your chat: curated libraries of curriculum documents and resources, and the picture library. It looks in these before relying on
            what it remembers.
          </p>
        </header>
        <DraftsSection drafts={drafts} />
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-60 flex-1">
            <span className="sr-only">Search plugins</span>
            <Search size={15} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" className="w-full pl-8" placeholder="Search by name, subject or publisher" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div role="radiogroup" aria-label="Kind" className="flex gap-1">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={kind === k.id}
                className="rounded-full border border-border px-3 py-1 text-sm text-foreground-2 hover:bg-hover aria-checked:border-border-strong aria-checked:bg-pressed aria-checked:text-foreground"
                onClick={() => setKind(k.id)}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>
        {failed && (
          <p className="error-text" role="alert">
            {failed}
          </p>
        )}
        {plugins === null && !failed && <p className="m-0 text-md text-muted-foreground">Loading…</p>}
        {plugins && shown.length === 0 && <p className="m-0 text-md text-muted-foreground">Nothing matches that. Try other words, or All.</p>}
        <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Plugins">
          {shown.map((p) => (
            <PluginCard key={p.id} plugin={p} onTrust={(t) => setTrust(p.id, t)} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function PluginCard({ plugin: p, onTrust }: { plugin: PluginInfo; onTrust: (trust: PluginTrust) => void }) {
  const Icon = p.kind === 'pictures' ? Image : BookOpen;
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card" aria-label={p.name}>
      <div className="flex items-start gap-3">
        <Icon size={20} aria-hidden="true" className="mt-0.5 flex-none text-foreground-2" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-base font-semibold">{p.name}</h2>
            <Badge>{p.kind === 'pictures' ? 'Pictures' : p.kind === 'pedagogy' ? 'Pedagogy' : 'Library'}</Badge>
            {!p.available && <Badge variant="warning">Not set up yet</Badge>}
          </div>
          <p className="m-0 text-sm text-muted-foreground">
            {p.publisher} · Licence: {p.licence}
            {p.homepage && (
              <>
                {' · '}
                <a href={p.homepage} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-foreground-2 underline">
                  Website
                  <ExternalLink size={11} aria-hidden="true" />
                </a>
              </>
            )}
          </p>
          <p className="m-0 text-md text-foreground-2">{p.description}</p>
        </div>
      </div>
      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend className="sr-only">{`How the assistant may use ${p.name}`}</legend>
        <div className="flex w-fit rounded-md border border-border bg-panel p-0.5">
          {PluginTrust.options.map((t) => (
            <label
              key={t}
              className={cn('cursor-pointer rounded-sm px-3 py-1 text-sm text-foreground-2 hover:text-foreground', p.trust === t && 'bg-card font-medium text-foreground shadow-card')}
            >
              <input type="radio" className="sr-only" name={`trust-${p.id}`} value={t} checked={p.trust === t} onChange={() => onTrust(t)} />
              {TRUST_LABELS[t]}
            </label>
          ))}
        </div>
        <p className="m-0 text-sm text-muted-foreground">{p.available ? TRUST_HINTS[p.trust] : 'This library is not connected here yet, so the assistant cannot use it whatever you choose.'}</p>
      </fieldset>
    </li>
  );
}
