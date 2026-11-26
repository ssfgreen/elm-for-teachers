/**
 * The sidebar's Curriculum section (docs/classes.md, C.4): what the class in view is working on
 * now. The class in view is the one whose page or chat is open, else the teacher's first starred
 * class this year. The heading opens the Curriculum screen for that class, and an item opens it on
 * that outcome (where Ideas leads to the pedagogy aligned to it). With nothing picked yet, the
 * line opens the class's page, where its curriculum is picked.
 */
import { schoolYearOf, type ClassesList } from '@edw/shared';
import type { SessionApi } from '../../api/participant';
import { cn } from '../../lib/utils';
import { starredClasses } from '../../state/classList';
import { useClassDetail } from '../../state/useClassDetail';
import { SectionHeading } from './SectionHeading';
import { itemClass, listClass } from './styles';

/** The class the section is about, or none. Pure. */
export function classInView(list: ClassesList, activeClassId: string | null, now = new Date()) {
  const open = activeClassId ? list.classes.find((c) => c.id === activeClassId && !c.archived_at) : undefined;
  return open ?? starredClasses(list, schoolYearOf(now))[0] ?? null;
}

export interface CurriculumSectionProps {
  list: ClassesList;
  activeClassId: string | null;
  api: Pick<SessionApi, 'getClass'>;
  /** The class's page, where its curriculum is picked. */
  onOpenClass: (classId: string) => void;
  /** The Curriculum screen for the class, opened on an outcome when one is given. */
  onOpenCurriculum: (classId: string, code?: string) => void;
}

export function CurriculumSection({ list, activeClassId, api, onOpenClass, onOpenCurriculum }: CurriculumSectionProps) {
  const cls = classInView(list, activeClassId);
  // The one copy of the class: a change on its page shows here at once.
  const { detail } = useClassDetail(api, cls?.id);
  const items = detail ? (detail.curriculum ?? []) : null;

  if (!cls) return null;
  const now = (items ?? []).filter((i) => i.status === 'now');
  return (
    <section aria-label="Curriculum">
      <SectionHeading title={`What ${cls.name} is working on now, in the curriculum`} onOpen={() => onOpenCurriculum(cls.id)}>
        Curriculum · {cls.name}
      </SectionHeading>
      <ul className={listClass}>
        {items && now.length === 0 && (
          <li>
            <button type="button" className={cn(itemClass(false), 'text-md text-muted-foreground')} onClick={() => onOpenClass(cls.id)}>
              Pick what {cls.name} is working on
            </button>
          </li>
        )}
        {now.map((i) => (
          <li key={i.id}>
            <button type="button" className={cn(itemClass(false), 'text-md')} title={`${i.text}\n\nSee it in the curriculum.`} onClick={() => onOpenCurriculum(cls.id, i.code)}>
              <span className="font-medium">{i.code}</span> <span className="text-foreground-2">{i.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
