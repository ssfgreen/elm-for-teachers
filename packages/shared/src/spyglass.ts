/**
 * What the Spyglass judge decides about a turn (docs/spyglass.md, Part 4): at most three flags a
 * teacher would want to know about, and how many more it found. Code finds the facts
 * (turn-effect.ts); the judge only labels and ranks them.
 */
import { z } from "zod";

export const SpyglassCheck = z.enum(["scope", "coherence", "account"]);
export type SpyglassCheck = z.infer<typeof SpyglassCheck>;

export const SpyglassLabel = z.enum(["removed", "changed", "added", "duplicated", "built_on_suggestion", "stale", "contradicts", "copies_differ", "unreported"]);
export type SpyglassLabel = z.infer<typeof SpyglassLabel>;

export const KeyDecision = z.object({
  check: SpyglassCheck,
  label: SpyglassLabel,
  block_ids: z.array(z.string()).min(1),
  /** A few words. */
  title: z.string().min(1),
  /** One sentence for the teacher; empty in a fallback flag. */
  why: z.string(),
  /** The text before, for a change. */
  was: z.string().optional(),
});
export type KeyDecision = z.infer<typeof KeyDecision>;

/** Flags shown at once; the rest are counted in `others`. */
export const MAX_FLAGS = 3;

export const SpyglassResult = z.object({
  flags: z.array(KeyDecision).max(MAX_FLAGS),
  others: z.number().int().nonnegative(),
  by: z.enum(["judge", "fallback"]),
});
export type SpyglassResult = z.infer<typeof SpyglassResult>;

/** The judge's answer as it gives it (any number of flags, most important first), capped for the teacher. */
export function capFlags(flags: readonly KeyDecision[], by: SpyglassResult["by"]): SpyglassResult {
  return { flags: flags.slice(0, MAX_FLAGS), others: Math.max(0, flags.length - MAX_FLAGS), by };
}

/** Why the teacher was not shown a turn's flags: the deployment's switch, the workspace's switch (#64), or their own toggle. */
export const SpyglassHidden = z.enum(["config_off", "workspace_off", "teacher_off"]);
export type SpyglassHidden = z.infer<typeof SpyglassHidden>;

/** The flags as stored with the turn: shown on reload unless `hidden`. */
export const StoredSpyglass = SpyglassResult.extend({
  hidden: SpyglassHidden.optional(),
  /** The judge's last gateway call, when it was called. */
  judge_call_id: z.string().optional(),
});
export type StoredSpyglass = z.infer<typeof StoredSpyglass>;
