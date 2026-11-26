/**
 * The workspace's feature switches applied to the api object the screens get (#212). Screens show a
 * card or section only when the api has its methods, so taking the methods away hides them.
 * Pupil routes and methods have moved to ELM for Students; this helper remains ready for future
 * teacher feature switches (such as Needs Groups).
 */
import { resolveFeatures, type Features } from '@edw/shared';
import type { SessionApi } from '../api/participant';

/**
 * The api as the switches allow. Pure: the api given is not changed.
 */
export function featureApi<T extends SessionApi>(a: T, features: Partial<Features> | null | undefined): T {
  resolveFeatures(features ?? null);
  return a;
}
