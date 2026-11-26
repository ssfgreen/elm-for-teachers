/**
 * The curriculum in full (Curriculum for Excellence experiences and outcomes), to explore: its
 * areas and organisers down the side, the outcomes at a level beside them, and a search. The class
 * in view (from the sidebar) sets the level it starts at, and its own items are marked and listed
 * at the top. Each outcome has its benchmarks a click away, and Ideas, which opens the pedagogy
 * that aligns to it. Picking outcomes for a class stays on the class's page.
 */
import { useEffect, useState } from 'react';
import { Lightbulb, Search } from 'lucide-react';
import type { CurriculumItem, CurriculumOption } from '@edw/shared';
import { useClassDetail } from '../../state/useClassDetail';
import type { SessionApi } from '../../api/participant';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { cn } from '../../lib/utils';
import { Benchmarks } from '../classes/Benchmarks';
import { LEVELS, STATUS_LABELS } from '../classes/curriculumView';
import { hintClass, screenClass } from '../classes/styles';
import { useCurriculumSearch } from '../classes/useCurriculumSearch';
import { groupOutcomes } from './groupOutcomes';

export interface CurriculumScreenProps {
  api: Pick<SessionApi, 'getCurriculum' | 'searchCurriculum' | 'curriculumBenchmarks' | 'getClass'>;
  /** The class in view, with the level (0 Early to 4 Fourth) its stage gives. */
  cls: { id: string; name: string; level: number | undefined } | null;
  /** Opened on an outcome: its code goes in the search box. */
  code?: string;
  onIdeas: (code: string) => void;
}

const NO_ITEMS: CurriculumItem[] = [];

const navButton = (on: boolean) =>
  cn('block w-full truncate rounded-sm border-0 bg-transparent px-2.5 py-1.5 text-left text-md text-foreground', on ? 'bg-pressed font-medium' : 'hover:bg-hover');

export function CurriculumScreen({ api, cls, code, onIdeas }: CurriculumScreenProps) {
  const [query, setQuery] = useState(code ?? '');
  const [level, setLevel] = useState<number | undefined>(code ? undefined : cls?.level);
  const [area, setArea] = useState('');
  const [organiser, setOrganiser] = useState('');
  const { shape, found, failed } = useCurriculumSearch(api, { query, level, area, organiser });

  // Opened again on another outcome or class: start from there.
  useEffect(() => {
    setQuery(code ?? '');
    setLevel(code ? undefined : cls?.level);
    setArea('');
    setOrganiser('');
  }, [code, cls?.id, cls?.level]);

  const { detail } = useClassDetail(api, cls?.id);
  const items: CurriculumItem[] = detail?.curriculum ?? NO_ITEMS;

  const statusOf = new Map(items.map((i) => [i.code, i.status]));
  const chooseArea = (name: string) => {
    setArea(name);
    setOrganiser('');
  };
  const card = (o: Pick<CurriculumOption, 'code' | 'text'>) => {
    const status = statusOf.get(o.code);
    return (
      <article key={o.code} aria-label={o.code} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 shadow-card">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="m-0 text-md">
            <span className="font-semibold">{o.code}</span> {o.text}
          </p>
          {cls && status && <span className="w-fit rounded-full bg-pressed px-2 py-0.5 text-xs font-medium">{`${cls.name}: ${STATUS_LABELS[status]}`}</span>}
          <Benchmarks api={api} code={o.code} />
        </div>
        <Button size="sm" className="flex-none" aria-label={`Ideas for ${o.code}`} title="Teaching ideas from the pedagogy library that align to this outcome" onClick={() => onIdeas(o.code)}>
          <Lightbulb size={14} aria-hidden="true" /> Ideas
        </Button>
      </article>
    );
  };

  return (
    <div className={screenClass} data-make-part="curriculum">
      <div className="mx-auto flex max-w-260 flex-col gap-5 px-6 py-10">
        <header className="flex flex-col gap-1.5">
          <h1 className="m-0 text-3xl leading-tight font-semibold">Curriculum</h1>
          <p className="m-0 text-md text-foreground-2">The Curriculum for Excellence experiences and outcomes. Browse by area or search; Ideas shows teaching from the pedagogy library that fits an outcome.</p>
        </header>

        {cls && items.some((i) => i.status === 'now') && (
          <section aria-label={`${cls.name} is working on`} className="flex flex-col gap-2">
            <h2 className="m-0 text-base font-semibold">{cls.name} is working on</h2>
            <div className="flex flex-col gap-2">{items.filter((i) => i.status === 'now').map(card)}</div>
          </section>
        )}

        <div className="flex flex-col gap-5 md:flex-row md:items-start">
          <nav aria-label="Curriculum areas" className="flex flex-none flex-col gap-0.5 md:sticky md:top-4 md:w-60">
            <button type="button" className={navButton(!area)} aria-current={!area ? 'true' : undefined} onClick={() => chooseArea('')}>
              Every area
            </button>
            {shape?.areas.map((a) => (
              <div key={a.id}>
                <button type="button" className={navButton(area === a.name && !organiser)} aria-current={area === a.name ? 'true' : undefined} onClick={() => chooseArea(a.name)}>
                  {a.name}
                </button>
                {area === a.name &&
                  a.organisers.map((o) => (
                    <button key={o} type="button" className={cn(navButton(organiser === o), 'pl-6 text-sm')} aria-current={organiser === o ? 'true' : undefined} onClick={() => setOrganiser(o)}>
                      {o}
                    </button>
                  ))}
              </div>
            ))}
          </nav>

          <section aria-label="Outcomes" className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-56 flex-1">
                <Search size={15} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
                <Input type="search" aria-label="Search the curriculum" className="w-full pl-8" placeholder="Words or a code, such as main ideas or LIT 2-16a" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              <select aria-label="Level" className="rounded-sm border border-border bg-card px-1.5 py-1 text-md" value={level ?? ''} onChange={(e) => setLevel(e.target.value === '' ? undefined : Number(e.target.value))}>
                <option value="">Any level</option>
                {LEVELS.map((l, i) => (
                  <option key={l} value={i}>
                    {l} level
                  </option>
                ))}
              </select>
            </div>
            {failed && (
              <p className="error-text" role="alert">
                {failed}
              </p>
            )}
            {found && found.options.length === 0 && <p className={hintClass}>Nothing matches. Try other words, another level or every area.</p>}
            {found?.truncated && <p className={hintClass}>Showing the first {found.options.length} of {found.total}. Pick an area or search to narrow it down.</p>}
            {groupOutcomes(found?.options ?? []).map(([key, options]) => (
              <section key={key} aria-label={key} className="flex flex-col gap-2">
                <h2 className="m-0 text-sm font-medium text-foreground-2">{key}</h2>
                {options.map(card)}
              </section>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
