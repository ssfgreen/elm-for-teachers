/** The Curriculum card's pure parts: items by status, and the level a class's stage gives. */
import { levelDigit, stageFacets, type CurriculumItem, type CurriculumStatus } from '@edw/shared';

export const STATUS_LABELS: Record<CurriculumStatus, string> = { now: 'Now', planned: 'Next', done: 'Done' };
export const STATUS_ORDER: CurriculumStatus[] = ['now', 'planned', 'done'];
export const LEVELS = ['Early', 'First', 'Second', 'Third', 'Fourth'];

export function byStatus(items: readonly CurriculumItem[]): Record<CurriculumStatus, CurriculumItem[]> {
  return { now: items.filter((i) => i.status === 'now'), planned: items.filter((i) => i.status === 'planned'), done: items.filter((i) => i.status === 'done') };
}

/** The level digit the picker starts at, from the class's stage (or its year group's name); undefined for any level. */
export function startLevel(stage: string | null, yearGroupName?: string): number | undefined {
  return levelDigit(stageFacets(stage, yearGroupName).level) ?? undefined;
}
