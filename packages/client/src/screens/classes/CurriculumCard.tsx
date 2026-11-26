/**
 * The class page's Curriculum card (docs/classes.md, C.4): what the class is on now, next and
 * has done, each an experience and outcome kept as it was picked. The assistant gets the "now"
 * items in full and the others as codes, and grounds its choices in the pedagogy aligned to them.
 */
import { useState } from 'react';
import { Lightbulb, Trash2 } from 'lucide-react';
import type { CurriculumItem, CurriculumPick, CurriculumStatus } from '@edw/shared';
import type { SessionApi } from '../../api/participant';
import type { Envelope } from '../../api/types';
import { Button } from '../../components/ui/button';
import { withAdded } from '../../state/classDetail';
import { useClassDetail } from '../../state/useClassDetail';
import { Benchmarks } from './Benchmarks';
import { CurriculumPicker } from './CurriculumPicker';
import { byStatus, STATUS_LABELS, STATUS_ORDER } from './curriculumView';
import { cardClass, cardTitleClass, hintClass } from './styles';

export interface CurriculumCardProps {
  classId: string;
  /** The level the picker starts at (0 Early to 4 Fourth), from the class's stage. */
  level: number | undefined;
  api: SessionApi;
  getEnvelope: () => Envelope;
  onChanged: () => void;
  /** The pedagogy that aligns to an item; with none given, no Ideas button. */
  onIdeas?: (code: string) => void;
}

export function CurriculumCard({ classId, level, api, getEnvelope, onChanged, onIdeas }: CurriculumCardProps) {
  const [picking, setPicking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // The one copy of the class: the sidebar and the Curriculum screen read the same items.
  const { detail, failed: loadFailed, update } = useClassDetail(api, classId);
  const items = detail ? (detail.curriculum ?? []) : null;
  const setItems = (change: (xs: CurriculumItem[]) => CurriculumItem[]) => update((d) => ({ ...d, curriculum: change(d.curriculum ?? []) }));
  const error = failed ?? (loadFailed ? 'The curriculum could not be loaded.' : null);

  const pick = async (picks: CurriculumPick[], status: CurriculumStatus) => {
    const added = await api.pickCurriculum!(classId, picks, status, getEnvelope());
    setItems((xs) => withAdded(xs, added));
    onChanged();
  };
  const setStatus = (item: CurriculumItem, status: CurriculumStatus | 'removed') =>
    api.setCurriculumStatus!(classId, item.id, status, getEnvelope())
      .then((next) => {
        setItems((xs) => (status === 'removed' ? xs.filter((x) => x.id !== item.id) : xs.map((x) => (x.id === item.id ? next : x))));
        onChanged();
      })
      .catch(() => setFailed('That did not work. Please try again.'));

  const groups = byStatus(items ?? []);
  return (
    <section className={cardClass} aria-label="Curriculum">
      <h2 className={cardTitleClass}>Curriculum</h2>
      <p className={hintClass}>What the class is working on. The assistant reads the “now” ones in full and looks for teaching that fits them.</p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {items && items.length === 0 && !picking && <p className="m-0 text-md text-muted-foreground">Nothing picked yet.</p>}
      {STATUS_ORDER.filter((s) => groups[s].length).map((s) => (
        <div key={s} className="flex flex-col gap-1">
          <h3 className="m-0 text-sm font-medium text-foreground-2">{STATUS_LABELS[s]}</h3>
          <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={STATUS_LABELS[s]}>
            {groups[s].map((i) => (
              <li key={i.id} className="flex items-start gap-1.5 text-sm">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5" title={i.text}>
                  <span>
                    <span className="font-medium">{i.code}</span> <span className="text-foreground-2">{i.text}</span>
                  </span>
                  <Benchmarks api={api} code={i.code} />
                </span>
                {onIdeas && (
                  <button type="button" className="flex flex-none items-center gap-1 rounded-sm border-0 bg-transparent px-1 py-0.5 text-sm text-foreground-2 hover:bg-hover hover:text-foreground" aria-label={`Ideas for ${i.code}`} title="Teaching ideas from the pedagogy library that align to this" onClick={() => onIdeas(i.code)}>
                    <Lightbulb size={13} aria-hidden="true" /> Ideas
                  </button>
                )}
                <select aria-label={`Status of ${i.code}`} className="flex-none rounded-sm border border-border bg-card px-1 py-0.5 text-sm" value={i.status} onChange={(e) => void setStatus(i, e.target.value as CurriculumStatus)}>
                  {STATUS_ORDER.map((x) => (
                    <option key={x} value={x}>
                      {STATUS_LABELS[x]}
                    </option>
                  ))}
                </select>
                <button type="button" className="flex-none rounded-sm border-0 bg-transparent p-1 text-muted-foreground hover:text-destructive" aria-label={`Take ${i.code} off`} onClick={() => void setStatus(i, 'removed')}>
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {picking ? (
        <CurriculumPicker api={api} level={level} have={new Set((items ?? []).map((i) => i.code))} onPick={pick} onClose={() => setPicking(false)} />
      ) : (
        api.searchCurriculum && (
          <Button size="sm" className="w-fit" onClick={() => setPicking(true)} disabled={!items}>
            Add from the curriculum
          </Button>
        )
      )}
    </section>
  );
}
