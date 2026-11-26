/** "View as pupil" (#215): signs this browser in as the class's test pupil, for /r. */
import { endpoints } from './endpoints';
import { api, type ApiOptions } from './http';
import type { Envelope } from './types';

export interface ViewAsPupilApi {
  /** Makes the class's test pupil if new and sets the pupil sign-in cookie; /r then opens as it. */
  viewAsPupil(classId: string, envelope: Envelope): Promise<void>;
}

export function viewAsPupilApi(sessionId: string, opts: ApiOptions): ViewAsPupilApi {
  return {
    viewAsPupil: (classId, envelope) => api<void>('POST', endpoints.viewAsPupil(sessionId, classId), { envelope }, opts),
  };
}

/** Whether this api can open /r as the test pupil (the make kit's cannot). */
export function hasViewAsPupil<T extends Partial<ViewAsPupilApi>>(a: T): a is T & ViewAsPupilApi {
  return typeof a.viewAsPupil === 'function';
}
