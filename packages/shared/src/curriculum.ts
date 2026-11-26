/**
 * A class's curriculum (docs/classes.md, C.4): the items a teacher picks for a class, each with
 * its code, its text as picked and the library version it came from, so a later change to the
 * library does not silently change the class. Stored generically, so the Know, Do and Understand
 * statements can join the experiences and outcomes later without a new table.
 */
import { z } from "zod";
import { Timestamp, Ulid } from "./blocks.js";

export const CurriculumFramework = z.enum(["cfe-eo", "cfe-kdu"]);
export const CurriculumKind = z.enum(["eo", "know", "do", "understand"]);
/** The make kit's Already covered card: planned (next), now and done. */
export const CurriculumStatus = z.enum(["planned", "now", "done"]);
export type CurriculumStatus = z.infer<typeof CurriculumStatus>;

export const CURRICULUM_TEXT_MAX = 1200;
export const CURRICULUM_PER_CLASS = 80;

export const CurriculumItem = z.object({
  id: Ulid,
  class_id: Ulid,
  framework: CurriculumFramework,
  /** "LIT 2-16a", or two codes for one statement: "LIT 2-10a / LIT 3-10a". */
  code: z.string().min(1).max(60),
  kind: CurriculumKind,
  text: z.string().min(1).max(CURRICULUM_TEXT_MAX),
  /** The library collection's version when it was picked. */
  source_version: z.string().max(40).nullable(),
  /** Optional CASE / JSON-LD standard URI for federated Curriculum MCP binding (T4). */
  standard_uri: z.string().max(240).nullable().optional(),
  status: CurriculumStatus,
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type CurriculumItem = z.infer<typeof CurriculumItem>;

/** What the picker sends for one item. */
export const CurriculumPick = z.object({
  code: z.string().trim().min(1).max(60),
  text: z.string().trim().min(1).max(CURRICULUM_TEXT_MAX),
  source_version: z.string().max(40).nullable().optional(),
  standard_uri: z.string().trim().max(240).nullable().optional(),
  framework: CurriculumFramework.default("cfe-eo"),
  kind: CurriculumKind.default("eo"),
});
export type CurriculumPick = z.infer<typeof CurriculumPick>;

/** One experience and outcome as the picker lists it (from the structured curriculum). */
export interface CurriculumOption {
  code: string;
  text: string;
  /** The curriculum area, e.g. "Literacy and English". */
  area: string;
  organiser?: string;
  sub_organiser?: string | null;
}

/** A benchmark as the curriculum gives it: evidence for the codes of its row. */
export interface CurriculumBenchmark {
  id: string;
  area: string;
  level: string;
  section: string | null;
  organiser: string;
  codes: string[];
  text: string;
}

const CODE = /[A-Z]{2,5} [0-4]-\d{2}[a-z]?/g;

/**
 * An experiences-and-outcomes line from the library (`LIT 2-10a / LIT 3-10a: I am …`) as its
 * codes and statement; null for a line that is not one.
 */
export function parseOutcomeLine(line: string): { codes: string[]; text: string } | null {
  const m = /^((?:[A-Z]{2,5} [0-4]-\d{2}[a-z]?)(?:\s*\/\s*[A-Z]{2,5} [0-4]-\d{2}[a-z]?)*):\s*(.+)$/.exec(line.trim());
  if (!m) return null;
  return { codes: m[1]!.match(CODE) ?? [], text: m[2]!.trim() };
}

/** A CfE level's digit in a code: Early 0 to Fourth 4. */
export const LEVEL_DIGITS = { early: 0, first: 1, second: 2, third: 3, fourth: 4 } as const;
export type CfeLevel = keyof typeof LEVEL_DIGITS;

/** How the class's stage reads as the pedagogy library's facets (both null when it says neither). */
export interface StageFacets {
  stage: string | null;
  level: CfeLevel | "senior" | null;
}

/**
 * The stage a teacher typed ("Primary 7, Second level", "S1", "P7") as a stage and a CfE level,
 * the level taken from the stage when not said (P1 first, P2 to P4 first, P5 to P7 second, S1 to
 * S3 third, S4 to S6 senior). The year group's name is a fallback.
 */
export function stageFacets(...texts: (string | null | undefined)[]): StageFacets {
  const t = texts.filter(Boolean).join(" ");
  const p = /\b(?:primary|p)\s*([1-7])\b/i.exec(t);
  const s = /\b(?:secondary|s)\s*([1-6])\b/i.exec(t);
  const stage = p ? `p${p[1]}` : s ? `s${s[1]}` : null;
  const said = /\b(early|first|second|third|fourth|senior)\s+level\b/i.exec(t)?.[1]?.toLowerCase() as StageFacets["level"] | undefined;
  if (said) return { stage, level: said };
  if (!stage) return { stage, level: null };
  const n = Number(stage.slice(1));
  if (stage.startsWith("p")) return { stage, level: n === 1 ? "early" : n <= 4 ? "first" : "second" };
  return { stage, level: n <= 3 ? "third" : "senior" };
}

/** For a code filter: "LIT 2-" finds every second level literacy code. */
export function levelDigit(level: StageFacets["level"]): number | null {
  return level && level !== "senior" ? LEVEL_DIGITS[level] : null;
}

/** A curriculum code's entry in the pedagogy library, as its brief names them: LIT 2-16a is cur-CUR-lit-2-16a. */
export const curriculumEntryId = (code: string) => `cur-CUR-${code.trim().toLowerCase().replace(/[\s-]+/g, '-')}`;
