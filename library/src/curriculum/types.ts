/**
 * The Curriculum for Excellence as structured data (docs/classes.md, C.4): every experience and
 * outcome with its area, organiser, level and the stages that level usually covers, and the
 * benchmarks for the levels built so far (Second for P7, Third for S1), each tied to the codes of
 * its row in the benchmark document.
 */
export const LEVELS = ['early', 'first', 'second', 'third', 'fourth'] as const;
export type Level = (typeof LEVELS)[number];

/** The stages a level usually spans (a pupil can be at another level; the teacher decides). */
export const LEVEL_STAGES: Record<Level, string[]> = {
  early: ['nursery', 'p1'],
  first: ['p2', 'p3', 'p4'],
  second: ['p5', 'p6', 'p7'],
  third: ['s1', 's2', 's3'],
  fourth: ['s3'],
};

export interface Outcome {
  /** The code as printed, e.g. "LIT 2-16a", or two for one statement: "LIT 2-10a / LIT 3-10a". */
  code: string;
  codes: string[];
  /** The level of the first code (a shared statement belongs to each of its levels; see `levels`). */
  level: Level;
  levels: Level[];
  stages: string[];
  area: string;
  /** Under the area: "Reading", "People, past events and societies". */
  organiser: string;
  /** Under that, where the document has one: "Tools for reading". */
  sub_organiser: string | null;
  text: string;
}

export interface Benchmark {
  id: string;
  area: string;
  level: Level;
  /** The document's section, where it has them: "Reading". */
  section: string | null;
  /** The row's organiser as printed in the benchmark document. */
  organiser: string;
  /** The codes in the same row: the outcomes this benchmark is evidence for. */
  codes: string[];
  text: string;
}

export interface CurriculumData {
  framework: 'cfe-eo';
  areas: { id: string; name: string; organisers: string[] }[];
  outcomes: Outcome[];
  benchmarks: Benchmark[];
  /** Which levels have benchmarks so far. */
  benchmark_levels: Level[];
  /** For each area and benchmark level, its codes and those no benchmark row names (the build's report). */
  coverage?: { area: string; level: Level; codes: number; covered: number; missing: string[] }[];
}
