import { describe, expect, it } from 'vitest';
import type { ClassesList, ClassSummary, YearGroup } from '@edw/shared';
import { classRows, nextSort, schoolYears, starredClasses } from './classList';

const T = '2026-11-12T09:00:00.000Z';
const SCHOOL = '01JSCH00000000000000000001';
let n = 0;
const id = () => `01JC${String(++n).padStart(22, '0')}`;
const yg = (name: string, school_year: string): YearGroup => ({ id: id(), session_id: 'S1', school_id: SCHOOL, school_year, name, note: null, created_at: T, archived_at: null });
const cls = (y: YearGroup, name: string, extra: Partial<ClassSummary> = {}): ClassSummary => ({
  id: id(),
  session_id: 'S1',
  school_id: SCHOOL,
  school_year: y.school_year,
  year_group_id: y.id,
  name,
  stage: null,
  subject: null,
  note: null,
  starred_at: null,
  copied_from: null,
  created_at: T,
  archived_at: null,
  pupil_count: 0,
  needs_counts: {},
  ...extra,
});

const s2 = yg('S2', '2026-27');
const s10 = yg('S10', '2026-27');
const s3 = yg('S3', '2026-27');
const old = yg('S1', '2025-26');
const list: ClassesList = {
  schools: [{ id: SCHOOL, session_id: 'S1', name: 'Hillhead', demo: false, created_at: T, archived_at: null }],
  year_groups: [s2, s10, s3, old],
  classes: [
    cls(s3, '3B', { subject: 'Maths', pupil_count: 28, starred_at: T }),
    cls(s2, '2A', { subject: 'English', pupil_count: 30, needs_counts: { Dyslexia: 2 } }),
    cls(s10, 'Ten', { subject: 'Art' }),
    cls(s2, '2C', { subject: 'Maths', pupil_count: 12, starred_at: T }),
    cls(old, '1A', { subject: 'English', starred_at: T }),
    cls(s2, 'Gone', { archived_at: T }),
  ],
};

describe('the class list', () => {
  it('keeps to the school year, leaves archived classes out, and sorts year groups as numbers', () => {
    expect(classRows(list, '2026-27', { key: 'year_group', dir: 'asc' }).map((r) => r.name)).toEqual(['2A', '2C', '3B', 'Ten']);
    expect(classRows(list, 'all', { key: 'school_year', dir: 'asc' }).map((r) => r.name)).toEqual(['1A', '2A', '2C', '3B', 'Ten']);
  });

  it('sorts by subject or pupils either way, then by year group and name', () => {
    expect(classRows(list, '2026-27', { key: 'subject', dir: 'asc' }).map((r) => r.name)).toEqual(['Ten', '2A', '2C', '3B']);
    expect(classRows(list, '2026-27', { key: 'pupils', dir: 'desc' }).map((r) => r.name)).toEqual(['2A', '3B', '2C', 'Ten']);
  });

  it('turns the order round on a second click', () => {
    expect(nextSort({ key: 'name', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'desc' });
    expect(nextSort({ key: 'name', dir: 'asc' }, 'pupils')).toEqual({ key: 'pupils', dir: 'desc' });
  });

  it('lists the school years, newest first, with the current one even when empty', () => {
    expect(schoolYears(list, '2027-28')).toEqual(['2027-28', '2026-27', '2025-26']);
  });

  it('searches every field, all words, ignoring case', () => {
    const find = (q: string) => classRows(list, 'all', { key: 'name', dir: 'asc' }, q).map((r) => r.name);
    expect(find('maths')).toEqual(['2C', '3B']);
    expect(find('s2 MATHS')).toEqual(['2C']);
    expect(find('2025-26')).toEqual(['1A']);
    expect(find('hillhead art')).toEqual(['Ten']);
    expect(find('  ')).toHaveLength(5);
    // Not needs (#243), even from a server that still counts them.
    expect(find('dyslexia')).toEqual([]);
  });

  it('gives the sidebar this year’s starred classes only', () => {
    expect(starredClasses(list, '2026-27').map((r) => r.name)).toEqual(['2C', '3B']);
  });
});
