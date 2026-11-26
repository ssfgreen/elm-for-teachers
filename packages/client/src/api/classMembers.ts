/** The pupils who joined a class with its code (#209 list, #220 Remove). */
import { endpoints } from './endpoints';
import { api, type ApiOptions } from './http';
import type { Envelope } from './types';

/** A pupil in the class, as the teacher sees them: never a name. */
export interface ClassMember {
  id: string;
  /** "Pupil N". */
  label: string;
  /** The sign-in provider they use (`google`, `microsoft`, ...). */
  provider: string;
  /** The day they joined, `YYYY-MM-DD`. */
  joined_on: string;
}

export interface ClassMembersApi {
  /** The class's pupils, in the order they joined (the teacher's test member is not one). */
  listClassMembers(classId: string): Promise<ClassMember[]>;
  /** Removes the pupil from the class; their data goes, as `pupils/remove.ts` says. */
  removeClassMember(classId: string, memberId: string, envelope: Envelope): Promise<void>;
}

export function classMembersApi(sessionId: string, opts: ApiOptions): ClassMembersApi {
  return {
    listClassMembers: (classId) => api<{ members: ClassMember[] }>('GET', endpoints.classMembers(sessionId, classId), undefined, opts).then((r) => r.members),
    removeClassMember: (classId, memberId, envelope) => api<void>('DELETE', endpoints.classMember(sessionId, classId, memberId), { envelope }, opts),
  };
}

/** Whether this api has class members (the make kit's has none). Kept with pupils off, so a child's data can always be removed. */
export function hasClassMembers<T extends Partial<ClassMembersApi>>(a: T): a is T & ClassMembersApi {
  return typeof a.listClassMembers === 'function' && typeof a.removeClassMember === 'function';
}
