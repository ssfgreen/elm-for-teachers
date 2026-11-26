/** The Curriculum screen's pure parts. */
import type { ClassesList, CurriculumOption } from '@edw/shared';
import { startLevel } from '../classes/curriculumView';

/** Outcomes grouped as the curriculum is, by area › organiser › sub-organiser, in the order found. */
export function groupOutcomes(options: readonly CurriculumOption[]): [string, CurriculumOption[]][] {
  const groups = new Map<string, CurriculumOption[]>();
  for (const o of options) {
    const key = [o.area, o.organiser, o.sub_organiser].filter(Boolean).join(' › ');
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  return [...groups];
}

/** The class the Curriculum screen is for, with the level its stage (or year group) gives; null when it is not in the list. Pure. */
export function classForCurriculum(list: ClassesList, classId: string | undefined): { id: string; name: string; level: number | undefined } | null {
  const c = classId ? list.classes.find((x) => x.id === classId) : undefined;
  if (!c) return null;
  return { id: c.id, name: c.name, level: startLevel(c.stage, list.year_groups.find((y) => y.id === c.year_group_id)?.name) };
}
