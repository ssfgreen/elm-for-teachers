/**
 * Needs groups (T1): generic or class-assigned groups of learning needs ("Dyslexia group",
 * "Level 1 learners") replacing per-pupil rows so Elm for Teachers holds zero pupil data.
 */
import { z } from "zod";
import { Timestamp, Ulid } from "./blocks.js";
import { ADAPTATION_OVERRIDES_MAX, AdaptationStatus } from "./pedagogy.js";

export const NEEDS_GROUP_NAME_MAX = 120;
export const NEEDS_GROUP_TEXT_MAX = 2000;
export const NEEDS_GROUPS_PER_SESSION = 60;
export const ADAPTATIONS_PER_NEEDS_GROUP = 20;

export const NeedsGroupAdaptation = z.object({
  id: Ulid,
  needs_group_id: Ulid,
  entry_id: z.string().min(1).max(120),
  title: z.string().max(200),
  changes_goal: z.boolean(),
  status: AdaptationStatus,
  overrides: z.string().max(ADAPTATION_OVERRIDES_MAX).nullable(),
  source_version: z.string().max(40).nullable(),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type NeedsGroupAdaptation = z.infer<typeof NeedsGroupAdaptation>;

export const NeedsGroup = z.object({
  id: Ulid,
  session_id: z.string(),
  name: z.string().min(1).max(NEEDS_GROUP_NAME_MAX),
  description: z.string().max(NEEDS_GROUP_TEXT_MAX).nullable(),
  what_helps: z.string().max(NEEDS_GROUP_TEXT_MAX).nullable(),
  position: z.number().int().nonnegative(),
  created_at: Timestamp,
  updated_at: Timestamp,
  archived_at: Timestamp.nullable(),
});
export type NeedsGroup = z.infer<typeof NeedsGroup>;

export const NeedsGroupSummary = NeedsGroup.extend({
  class_ids: z.array(Ulid),
  adaptations: z.array(NeedsGroupAdaptation),
});
export type NeedsGroupSummary = z.infer<typeof NeedsGroupSummary>;

export const NeedsGroupInput = z.object({
  name: z.string().trim().min(1).max(NEEDS_GROUP_NAME_MAX),
  description: z.string().max(NEEDS_GROUP_TEXT_MAX).nullable().optional(),
  what_helps: z.string().max(NEEDS_GROUP_TEXT_MAX).nullable().optional(),
  class_ids: z.array(Ulid).max(60).optional(),
});
export type NeedsGroupInput = z.infer<typeof NeedsGroupInput>;

export const NeedsGroupUpdate = z.object({
  name: z.string().trim().min(1).max(NEEDS_GROUP_NAME_MAX).optional(),
  description: z.string().max(NEEDS_GROUP_TEXT_MAX).nullable().optional(),
  what_helps: z.string().max(NEEDS_GROUP_TEXT_MAX).nullable().optional(),
  position: z.number().int().nonnegative().optional(),
});
export type NeedsGroupUpdate = z.infer<typeof NeedsGroupUpdate>;

export const NeedsGroupsList = z.object({
  groups: z.array(NeedsGroupSummary),
});
export type NeedsGroupsList = z.infer<typeof NeedsGroupsList>;
