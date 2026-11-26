/**
 * The workspace's feature switches applied to the api object the screens get (#212). Screens show a
 * card or section only when the api has its methods, so taking the methods away hides them.
 * With `pupils` off: no readings, no pupil reader settings, no class code. The prompt library
 * (/prompts) has its own api and stays as it is.
 */
import { resolveFeatures, type Features } from '@edw/shared';
import type { ClassCodeApi } from '../api/classCode';
import type { ClassesApi } from '../api/classes';
import type { SessionApi } from '../api/participant';
import type { ReadingsApi } from '../api/readings';

/** The methods that belong to pupils: readings, the reader's settings, the class code. */
export const PUPIL_METHODS = [
  'listReadings',
  'setReading',
  'updateReading',
  'removeReading',
  'listReadingSources',
  'listReaderPrompts',
  'getReaderSettings',
  'setReaderSettings',
  'getClassCode',
  'setClassCode',
] as const satisfies readonly (keyof ReadingsApi | keyof ClassesApi | keyof ClassCodeApi)[];

/**
 * The api as the switches allow. Absent switches read as the defaults (pupils off). Pure: the api
 * given is not changed; with pupils on it comes back as it is.
 */
export function featureApi<T extends SessionApi>(a: T, features: Partial<Features> | null | undefined): T {
  if (resolveFeatures(features ?? null).pupils) return a;
  const out = { ...a };
  for (const m of PUPIL_METHODS) delete (out as Partial<SessionApi>)[m];
  return out;
}
