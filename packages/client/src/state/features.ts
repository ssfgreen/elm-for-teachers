/**
 * The workspace's feature switches applied to the api object the screens get (#212). Screens show a
 * card or section only when the api has its methods, so taking the methods away hides them.
 * Pupil routes and methods have moved to ELM for Students; this helper remains ready for future
 * teacher feature switches (such as Needs Groups).
 */
import { resolveFeatures, type Features } from '@edw/shared';
import type { NeedsGroupsApi } from '../api/needsGroups';
import type { SessionApi } from '../api/participant';

export const NEEDS_GROUP_METHODS = [
  'listNeedsGroups',
  'createNeedsGroup',
  'updateNeedsGroup',
  'archiveNeedsGroup',
  'attachNeedsGroupClass',
  'detachNeedsGroupClass',
  'addNeedsGroupAdaptation',
  'updateNeedsGroupAdaptation',
  'removeNeedsGroupAdaptation',
] as const satisfies readonly (keyof NeedsGroupsApi)[];

/**
 * The api as the switches allow. Pure: the api given is not changed.
 */
export function featureApi<T extends SessionApi>(a: T, features: Partial<Features> | null | undefined): T {
  if (resolveFeatures(features ?? null).needs_groups) return a;
  const out = { ...a };
  for (const m of NEEDS_GROUP_METHODS) delete (out as Partial<SessionApi>)[m];
  return out;
}
