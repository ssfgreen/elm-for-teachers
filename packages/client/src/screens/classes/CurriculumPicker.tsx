/**
 * Picking experiences and outcomes for a class from the structured curriculum: an area and an
 * organiser to browse, words or a code to search, at a level (from the class's stage), each
 * outcome with its benchmarks a click away. A pick keeps the code, its text as shown here and the
 * curriculum's version (docs/classes.md, C.4).
 */
import { useEffect, useState } from 'react';
import type { CurriculumOption, CurriculumPick, CurriculumStatus } from '@edw/shared';
import type { SessionApi } from '../../api/participant';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Benchmarks } from './Benchmarks';
import { LEVELS, STATUS_LABELS, STATUS_ORDER } from './curriculumView';
import { hintClass } from './styles';
import { useCurriculumSearch } from './useCurriculumSearch';

export interface CurriculumPickerProps {
  api: Pick<SessionApi, 'searchCurriculum' | 'getCurriculum' | 'curriculumBenchmarks'>;
  level: number | undefined;
  /** Codes the class already has. */
  have: ReadonlySet<string>;
  onPick: (items: CurriculumPick[], status: CurriculumStatus) => Promise<void>;
  onClose: () => void;
}

const selectClass = 'max-w-56 rounded-sm border border-border bg-card px-1 py-0.5';

export function CurriculumPicker({ api, level: startLevel, have, onPick, onClose }: CurriculumPickerProps) {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<number | undefined>(startLevel);
  const [area, setArea] = useState('');
  const [organiser, setOrganiser] = useState('');
  const [status, setStatus] = useState<CurriculumStatus>('now');
  const [pickFailed, setFailed] = useState<string | null>(null);
  const { shape, found, failed: searchFailed } = useCurriculumSearch(api, { query, level, area, organiser });
  // A new search result clears a failed pick's message, as before.
  useEffect(() => setFailed(null), [found]);
  const failed = pickFailed ?? searchFailed;

  const pick = (o: CurriculumOption) => void onPick([{ code: o.code, text: o.text, source_version: found?.version ?? null, framework: 'cfe-eo', kind: 'eo' }], status).catch(() => setFailed('That could not be added. Please try again.'));
  const organisers = shape?.areas.find((a) => a.name === area)?.organisers ?? [];
  // Grouped as the curriculum is: by area and organiser.
  const groups = new Map<string, CurriculumOption[]>();
  for (const o of found?.options.slice(0, 80) ?? []) {
    const key = [o.area, o.organiser, o.sub_organiser].filter(Boolean).join(' › ');
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }

  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Add from the curriculum">
      <div className="flex flex-wrap gap-2 text-sm">
        <select aria-label="Curriculum area" className={selectClass} value={area} onChange={(e) => {
            setArea(e.target.value);
            setOrganiser('');
          }}>
          <option value="">Every area</option>
          {shape?.areas.map((a) => (
            <option key={a.id} value={a.name}>
              {a.name}
            </option>
          ))}
        </select>
        {organisers.length > 0 && (
          <select aria-label="Organiser" className={selectClass} value={organiser} onChange={(e) => setOrganiser(e.target.value)}>
            <option value="">Every organiser</option>
            {organisers.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}
        <select aria-label="Level" className={selectClass} value={level ?? ''} onChange={(e) => setLevel(e.target.value === '' ? undefined : Number(e.target.value))}>
          <option value="">Any level</option>
          {LEVELS.map((l, i) => (
            <option key={l} value={i}>
              {l}
            </option>
          ))}
        </select>
        <select aria-label="Add as" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as CurriculumStatus)}>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              Add as {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <Input type="search" aria-label="Search the curriculum" placeholder="Words or a code, such as main ideas or LIT 2-16a" value={query} onChange={(e) => setQuery(e.target.value)} />
      {failed && (
        <p className="error-text" role="alert">
          {failed}
        </p>
      )}
      {found && found.options.length === 0 && <p className={hintClass}>Nothing matches. Try other words, another level or every area.</p>}
      <div className="flex max-h-96 flex-col gap-2 overflow-y-auto" aria-label="Outcomes found">
        {[...groups].map(([key, options]) => (
          <section key={key} aria-label={key} className="flex flex-col gap-1">
            <h4 className="m-0 text-xs font-medium text-foreground-2">{key}</h4>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {options.map((o) => (
                <li key={o.code} className="flex items-start gap-2 text-sm">
                  <Button size="sm" disabled={have.has(o.code)} onClick={() => pick(o)} aria-label={`Add ${o.code}`}>
                    {have.has(o.code) ? 'Added' : 'Add'}
                  </Button>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span>
                      <span className="font-medium">{o.code}</span> {o.text}
                    </span>
                    <Benchmarks api={api} code={o.code} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {found && (found.truncated || found.options.length > 80) && <p className={hintClass}>More match than are shown: choose an area or organiser, or add words.</p>}
      <Button variant="ghost" size="sm" className="w-fit" onClick={onClose}>
        Done
      </Button>
    </div>
  );
}
