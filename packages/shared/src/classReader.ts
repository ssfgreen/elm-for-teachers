/**
 * A class's settings for the pupil reader (#186): how many follow-ups a pupil may ask after one
 * answer, and the default budget for each pupil, in pounds. A class that has not set one takes
 * config `reader.follow_ups_max` or `reader.pupil_budget_gbp`, read when asked, so a change to
 * config reaches every class that has not chosen. The same holds for the safety instruction the
 * reader's model is given (#195; config `reader.safety_instruction`). Nothing uses them yet (R2 will).
 */
import { z } from "zod";

export const FOLLOW_UPS_MAX_LIMIT = 10;
export const PUPIL_BUDGET_GBP_LIMIT = 5;

/** Whole pence: 0.5 and 0.07 are, 0.505 is not. */
export const isWholePence = (gbp: number): boolean => Math.abs(gbp * 100 - Math.round(gbp * 100)) < 1e-6;

/** Follow-ups a pupil may ask after one answer: 0 to 10. */
export const FollowUpsMax = z.number().int().min(0).max(FOLLOW_UPS_MAX_LIMIT);
export type FollowUpsMax = z.infer<typeof FollowUpsMax>;

/** Rounded to the penny, so 0.5000000001 and 0.5 are the same value. */
export const toPence = (gbp: number): number => Math.round(gbp * 100) / 100;

/** A pupil's default budget: £0 to £5, to the penny (kept rounded, so a repeat is a no-op). */
export const PupilBudgetGbp = z.number().min(0).max(PUPIL_BUDGET_GBP_LIMIT).refine(isWholePence, "to the penny").transform(toPence);
export type PupilBudgetGbp = z.infer<typeof PupilBudgetGbp>;

/** Longest safety instruction a class may keep, in characters. */
export const SAFETY_INSTRUCTION_MAX = 2000;

/** What the reader's model is told about keeping pupils safe: never empty, at most 2,000 characters, trimmed. */
export const SafetyInstruction = z.string().trim().min(1, "cannot be empty").max(SAFETY_INSTRUCTION_MAX);
export type SafetyInstruction = z.infer<typeof SafetyInstruction>;

const Values = z.object({ follow_ups_max: z.number(), pupil_budget_gbp: z.number(), safety_instruction: z.string() });

/** What the class page shows: the values in force, config's defaults, and which the teacher set. */
export const ClassReaderSettings = Values.extend({
  defaults: Values,
  set: z.object({ follow_ups_max: z.boolean(), pupil_budget_gbp: z.boolean(), safety_instruction: z.boolean() }),
});
export type ClassReaderSettings = z.infer<typeof ClassReaderSettings>;

/** A change: a value sets a field, null goes back to the default, a field left out stays. */
export const ClassReaderSettingsPatch = z.object({
  follow_ups_max: FollowUpsMax.nullable().optional(),
  pupil_budget_gbp: PupilBudgetGbp.nullable().optional(),
  safety_instruction: SafetyInstruction.nullable().optional(),
});
export type ClassReaderSettingsPatch = z.infer<typeof ClassReaderSettingsPatch>;
