/** Rows of the classes tables (migration 0022) as shared types. */
import type { Row } from '../db/types.js';
import { Pupil, School, SchoolClass, YearGroup } from '@edw/shared';

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export function rowToSchool(r: Row): School {
  return School.parse({ id: r.id, session_id: r.session_id, name: r.name, demo: Number(r.demo) === 1, created_at: r.created_at, archived_at: str(r.archived_at) });
}

export function rowToYearGroup(r: Row): YearGroup {
  return YearGroup.parse({ id: r.id, session_id: r.session_id, school_id: r.school_id, school_year: r.school_year, name: r.name, note: str(r.note), created_at: r.created_at, archived_at: str(r.archived_at) });
}

export function rowToClass(r: Row): SchoolClass {
  const rawProfile = str(r.curriculum_profile);
  return SchoolClass.parse({
    id: r.id,
    session_id: r.session_id,
    school_id: r.school_id,
    school_year: r.school_year,
    year_group_id: r.year_group_id,
    name: r.name,
    stage: str(r.stage),
    subject: str(r.subject),
    note: str(r.note),
    ...(rawProfile ? { curriculum_profile: JSON.parse(rawProfile) as unknown } : {}),
    starred_at: str(r.starred_at),
    copied_from: str(r.copied_from),
    created_at: r.created_at,
    archived_at: str(r.archived_at),
  });
}

export function rowToPupil(r: Row): Pupil {
  return Pupil.parse({
    id: r.id,
    class_id: r.class_id,
    number: Number(r.number),
    label: r.label,
    needs: JSON.parse(String(r.needs ?? '[]')) as unknown,
    helps: str(r.helps),
    working_at: str(r.working_at),
    note: str(r.note),
    position: Number(r.position),
    created_at: r.created_at,
    archived_at: str(r.archived_at),
  });
}
