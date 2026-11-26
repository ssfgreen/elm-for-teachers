/**
 * The pedagogy library as the app sees it (library/pedagogy-sample/HANDOFF.md): a pupil's
 * chosen adaptations, and claim citations in the assistant's replies. Needs are barriers, not
 * diagnoses: a diagnosis is a hint for where to look, never a filter.
 */
import { z } from "zod";
import { Timestamp, Ulid } from "./blocks.js";

/** Whether an adaptation helps this pupil: kept only while there is evidence it does. */
export const AdaptationStatus = z.enum(["confirmed", "trialling", "stopped"]);
export type AdaptationStatus = z.infer<typeof AdaptationStatus>;

export const ADAPTATIONS_PER_PUPIL = 20;
export const ADAPTATION_OVERRIDES_MAX = 300;

/** A library adaptation the teacher chose for a pupil, with the pupil's own settings (cream background, 14pt). */
export const PupilAdaptation = z.object({
  id: Ulid,
  pupil_id: Ulid,
  /** The library entry, e.g. adp-ACC-individual-spacing-background. */
  entry_id: z.string().min(1).max(120),
  /** Its title when chosen, so the table reads without the library. */
  title: z.string().max(200),
  /** It changes the learning goal (a modification): only ever the teacher's choice. */
  changes_goal: z.boolean(),
  status: AdaptationStatus,
  overrides: z.string().max(ADAPTATION_OVERRIDES_MAX).nullable(),
  source_version: z.string().max(40).nullable(),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type PupilAdaptation = z.infer<typeof PupilAdaptation>;

export const AdaptationPick = z.object({
  entry_id: z.string().trim().min(1).max(120),
  title: z.string().trim().max(200),
  changes_goal: z.boolean(),
  status: AdaptationStatus.default("trialling"),
  overrides: z.string().max(ADAPTATION_OVERRIDES_MAX).nullable().optional(),
  source_version: z.string().max(40).nullable().optional(),
});
export type AdaptationPick = z.infer<typeof AdaptationPick>;

/** A citation in a reply: `[[clm-ACC-spacing-zorzi]]`. */
export const CITATION_RE = /\[\[(clm-[A-Za-z0-9-]+)\]\]/g;

/** The claim ids a text cites, each once, in order. */
export function citedClaims(text: string): string[] {
  return [...new Set([...text.matchAll(CITATION_RE)].map((m) => m[1]!))];
}

/**
 * The text with every citation of a claim not in `allowed` taken out (HANDOFF.md: reject any
 * citation not in the retrieved set). Returns what was taken out too, for the log.
 */
export function keepKnownCitations(text: string, allowed: ReadonlySet<string>): { text: string; dropped: string[] } {
  const dropped: string[] = [];
  const out = text.replace(/ ?\[\[(clm-[A-Za-z0-9-]+)\]\]/g, (whole, id: string) => {
    if (allowed.has(id)) return whole;
    if (!dropped.includes(id)) dropped.push(id);
    return "";
  });
  return { text: out, dropped };
}

/**
 * Where to look first for a pupil, from the needs a teacher typed: the library's
 * `often_relevant_to` hints. Only a hint: every adaptation stays available.
 */
const NEED_HINTS: [RegExp, string][] = [
  [/dyslexi/i, "dyslexia"],
  [/autis|asd|asc\b/i, "autism"],
  [/adhd|attention/i, "ADHD"],
  [/\beal\b|english as an additional/i, "EAL"],
  [/speech|language|dld/i, "developmental language disorder"],
  [/visual|sight/i, "visual impairment"],
  [/anxi/i, "anxiety"],
  [/motor|dcd|dyspraxi/i, "developmental coordination disorder"],
  [/learning disab/i, "learning disability"],
];

export function needHints(needs: readonly string[]): string[] {
  const out = new Set<string>();
  for (const n of needs) for (const [re, hint] of NEED_HINTS) if (re.test(n)) out.add(hint);
  return [...out];
}
