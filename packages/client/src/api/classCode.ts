/** A class's code for pupils (#209 routes, #212 card): read it, make, renew or close it. */
import { endpoints } from './endpoints';
import { api, type ApiOptions } from './http';
import type { Envelope } from './types';

export type ClassCodeAction = 'make' | 'renew' | 'close';

export interface ClassCodeApi {
  /** The class's live code (`XXXX-XXXX`), or null when it has none. */
  getClassCode(classId: string): Promise<string | null>;
  /** Makes, renews or closes the code; the code after it (null once closed). */
  setClassCode(classId: string, action: ClassCodeAction, envelope: Envelope): Promise<string | null>;
}

export function classCodeApi(sessionId: string, opts: ApiOptions): ClassCodeApi {
  const at = (classId: string) => endpoints.classCode(sessionId, classId);
  return {
    getClassCode: (classId) => api<{ code: string | null }>('GET', at(classId), undefined, opts).then((r) => r.code),
    setClassCode: (classId, action, envelope) => api<{ code: string | null }>('POST', at(classId), { action, envelope }, opts).then((r) => r.code),
  };
}

/** Whether this api has class codes (the make kit's has none, nor a workspace with pupils off). */
export function hasClassCode<T extends Partial<ClassCodeApi>>(a: T): a is T & ClassCodeApi {
  return typeof a.getClassCode === 'function' && typeof a.setClassCode === 'function';
}
