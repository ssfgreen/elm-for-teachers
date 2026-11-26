/**
 * The Classes list as a table (docs/classes.md): one row a class, filtered to a school year (or
 * all) and sorted by any column. Pure, so it is tested without React.
 */
import type { ClassesList, ClassSummary } from '@edw/shared';

export type SortKey = 'name' | 'year_group' | 'subject' | 'school_year' | 'pupils';
export interface Sort {
  key: SortKey;
  dir: 'asc' | 'desc';
}

export interface ClassRow extends ClassSummary {
  year_group_name: string;
  school_name: string;
}

/** "all", or a school year such as 2026-27. */
export type YearFilter = string;

/** Every school year with a class or year group in it, and the current one, newest first. */
export function schoolYears(list: ClassesList, current: string): string[] {
  return [...new Set([current, ...list.year_groups.filter((y) => !y.archived_at).map((y) => y.school_year)])].sort().reverse();
}

const collator = new Intl.Collator('en-GB', { numeric: true, sensitivity: 'base' });

/**
 * Whether a row matches the search: every word of it is in one of the row's fields (class, year
 * group, subject, school year, school or stage), ignoring case. Not needs (#243).
 */
export function matches(row: ClassRow, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = [row.name, row.year_group_name, row.subject, row.school_year, row.school_name, row.stage].filter(Boolean).join(' ').toLowerCase();
  return words.every((w) => text.includes(w));
}

/** The live classes in the year (or all years) that match the search, sorted; ties fall back to year group, then name. */
export function classRows(list: ClassesList, year: YearFilter, sort: Sort, query = ''): ClassRow[] {
  const yearGroups = new Map(list.year_groups.map((y) => [y.id, y.name]));
  const schools = new Map(list.schools.map((s) => [s.id, s.name]));
  const rows: ClassRow[] = list.classes
    .filter((c) => !c.archived_at && (year === 'all' || c.school_year === year))
    .map((c) => ({ ...c, year_group_name: yearGroups.get(c.year_group_id) ?? '', school_name: schools.get(c.school_id) ?? '' }))
    .filter((r) => matches(r, query));
  const value = (r: ClassRow, key: SortKey): string | number => {
    if (key === 'pupils') return r.pupil_count;
    if (key === 'year_group') return r.year_group_name;
    if (key === 'subject') return r.subject ?? '';
    if (key === 'school_year') return r.school_year;
    return r.name;
  };
  const compare = (a: ClassRow, b: ClassRow, key: SortKey) => {
    const x = value(a, key);
    const y = value(b, key);
    return typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y));
  };
  const sign = sort.dir === 'asc' ? 1 : -1;
  return rows.sort((a, b) => sign * compare(a, b, sort.key) || compare(a, b, 'year_group') || compare(a, b, 'name'));
}

/** A click on a column: sorts by it, or turns the order round when it already does. */
export function nextSort(sort: Sort, key: SortKey): Sort {
  return sort.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'school_year' || key === 'pupils' ? 'desc' : 'asc' };
}

/** The classes for the sidebar: starred ones in the current school year, by year group then name. */
export function starredClasses(list: ClassesList, current: string): ClassRow[] {
  return classRows(list, current, { key: 'year_group', dir: 'asc' }).filter((c) => c.starred_at);
}
