/**
 * Classes (docs/classes.md): the teacher's schools, and in each school year its year groups,
 * classes and the pupils in each class, kept with what the assistant should know about them.
 * Classes change every year, so a class belongs to one school year ("2026-27"). A pupil is a
 * made-up label and their needs, never a name. Archiving hides a row; nothing is deleted.
 */
import { z } from "zod";
import { Timestamp, Ulid } from "./blocks.js";

export const CLASS_NAME_MAX = 80;
export const CLASS_NOTE_MAX = 4000;
export const CLASS_FIELD_MAX = 120;
export const PUPIL_LABEL_MAX = 40;
export const PUPIL_TEXT_MAX = 1000;
export const PUPIL_NEEDS_MAX = 12;
export const PUPILS_PER_CLASS = 60;

/** A school year, e.g. "2026-27" (schoolYear.ts). */
export const SchoolYear = z.string().regex(/^\d{4}-\d{2}$/, "a school year such as 2026-27");

/** Where the teacher teaches. Its name stays with the teacher: the export and events have only its id (Sam, 12 Nov 2026). */
export const School = z.object({
  id: Ulid,
  session_id: z.string(),
  name: z.string().min(1).max(CLASS_NAME_MAX),
  /** The demo class's fictional school: the teacher's own classes never go in it. */
  demo: z.boolean(),
  created_at: Timestamp,
  archived_at: Timestamp.nullable(),
});
export type School = z.infer<typeof School>;

/** A year group in one school year: P7 at a school in 2026-27. */
export const YearGroup = z.object({
  id: Ulid,
  session_id: z.string(),
  school_id: Ulid,
  school_year: SchoolYear,
  name: z.string().min(1).max(CLASS_NAME_MAX),
  /** About the whole year group, for the assistant. */
  note: z.string().max(CLASS_NOTE_MAX).nullable(),
  created_at: Timestamp,
  archived_at: Timestamp.nullable(),
});
export type YearGroup = z.infer<typeof YearGroup>;

/** Federated curriculum configuration for a class (jurisdiction, framework, level, MCP endpoint). */
export const CurriculumProfile = z.object({
  jurisdiction: z.string().trim().min(1).max(60).optional(),
  framework: z.string().trim().min(1).max(80).optional(),
  level: z.string().trim().min(1).max(60).optional(),
  mcp_endpoint: z.string().url().max(300).optional(),
});
export type CurriculumProfile = z.infer<typeof CurriculumProfile>;

export const SchoolClass = z.object({
  id: Ulid,
  session_id: z.string(),
  school_id: Ulid,
  school_year: SchoolYear,
  year_group_id: Ulid,
  name: z.string().min(1).max(CLASS_NAME_MAX),
  /** Stage and level, e.g. "Primary 7, Second level". */
  stage: z.string().max(CLASS_FIELD_MAX).nullable(),
  subject: z.string().max(CLASS_FIELD_MAX).nullable(),
  /** About the class, for the assistant: the teacher's own words, needs in summary too. */
  note: z.string().max(CLASS_NOTE_MAX).nullable(),
  /** Optional federated curriculum profile (T4 prep). */
  curriculum_profile: CurriculumProfile.nullable().optional(),
  /** The teacher's own class: shown in the sidebar. Per teacher (the workspace is one, for now). */
  starred_at: Timestamp.nullable(),
  /** The class it was copied from, the year before. */
  copied_from: Ulid.nullable(),
  created_at: Timestamp,
  archived_at: Timestamp.nullable(),
});
export type SchoolClass = z.infer<typeof SchoolClass>;

export const Pupil = z.object({
  id: Ulid,
  class_id: Ulid,
  /** The pupil's number in the class, from 1, given when they join it and never given twice there. */
  number: z.number().int().positive(),
  /** A made-up label (amber-otter) or the teacher's own code; never a name. */
  label: z.string().min(1).max(PUPIL_LABEL_MAX),
  needs: z.array(z.string().min(1).max(CLASS_FIELD_MAX)).max(PUPIL_NEEDS_MAX),
  /** What helps: overlays, fonts, chunking, a reading pen. */
  helps: z.string().max(PUPIL_TEXT_MAX).nullable(),
  /** Where the pupil is working, e.g. a grade or a level. */
  working_at: z.string().max(CLASS_FIELD_MAX).nullable(),
  note: z.string().max(PUPIL_TEXT_MAX).nullable(),
  position: z.number().int().nonnegative(),
  created_at: Timestamp,
  archived_at: Timestamp.nullable(),
});
export type Pupil = z.infer<typeof Pupil>;

/** What a teacher writes for a pupil (the label is made up when left out). */
export const PupilFields = z.object({
  label: z.string().trim().min(1).max(PUPIL_LABEL_MAX).optional(),
  needs: z.array(z.string().trim().min(1).max(CLASS_FIELD_MAX)).max(PUPIL_NEEDS_MAX).optional(),
  helps: z.string().max(PUPIL_TEXT_MAX).nullable().optional(),
  working_at: z.string().max(CLASS_FIELD_MAX).nullable().optional(),
  note: z.string().max(PUPIL_TEXT_MAX).nullable().optional(),
});
export type PupilFields = z.infer<typeof PupilFields>;

/** Needs offered in the table; a teacher can type others. */
export const COMMON_NEEDS = [
  "Dyslexia",
  "Dyscalculia",
  "ADHD",
  "Autism",
  "EAL",
  "Working memory",
  "Visual impairment",
  "Hearing impairment",
  "Speech and language",
  "Motor skills",
  "High achiever",
] as const;

/** How many pupils have each need (case and spacing ignored, first spelling kept), largest first. */
export function needsCounts(pupils: readonly Pick<Pupil, "needs">[]): Record<string, number> {
  const counts = new Map<string, { name: string; n: number }>();
  for (const p of pupils) {
    const seen = new Set<string>();
    for (const need of p.needs.map((x) => x.trim()).filter(Boolean)) {
      const key = need.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const c = counts.get(key) ?? { name: need, n: 0 };
      c.n += 1;
      counts.set(key, c);
    }
  }
  return Object.fromEntries([...counts.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).map((c) => [c.name, c.n]));
}

/** Schools, year groups and classes as the Classes screen lists them (no pupils). */
export const ClassesList = z.object({
  schools: z.array(School),
  year_groups: z.array(YearGroup),
  classes: z.array(SchoolClass.extend({ pupil_count: z.number().int().nonnegative(), needs_counts: z.record(z.number()) })),
});
export type ClassesList = z.infer<typeof ClassesList>;
export type ClassSummary = ClassesList["classes"][number];
