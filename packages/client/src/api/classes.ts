/** The workspace's classes (docs/classes.md): year groups, classes and their pupils' needs. */
import type { AdaptationPick, AdaptationStatus, ClassesList, CurriculumBenchmark, CurriculumItem, CurriculumOption, CurriculumPick, CurriculumStatus, Pupil, PupilAdaptation, PupilFields, School, SchoolClass, YearGroup } from '@edw/shared';
import { api, type ApiOptions } from './http';
import type { Envelope } from './types';

const e = encodeURIComponent;

/** Where a new chat goes: a project, a class or a year group (at most one). */
export interface ThreadPlace {
  project_id?: string;
  class_id?: string;
  year_group_id?: string;
}

export interface ClassDetail {
  class: SchoolClass;
  year_group: YearGroup | null;
  pupils: Pupil[];
  /** Library adaptations chosen for its pupils (an older server sends none). */
  adaptations?: PupilAdaptation[];
  curriculum?: CurriculumItem[];
}

export interface CurriculumSearch {
  version: string | null;
  options: CurriculumOption[];
  total: number;
  truncated: boolean;
}

/** The curriculum's shape: its areas and their organisers, and which levels have benchmarks. */
export interface CurriculumStructure {
  benchmark_levels: string[];
  areas: { id: string; name: string; organisers: string[]; counts: Record<string, number> }[];
}

export interface ClassFieldsUpdate {
  name?: string;
  stage?: string | null;
  subject?: string | null;
  note?: string | null;
  year_group_id?: string;
  starred?: boolean;
}

export interface ClassesApi {
  listClasses(): Promise<ClassesList>;
  getClass(classId: string): Promise<ClassDetail>;
  createSchool(name: string, envelope: Envelope): Promise<School>;
  renameSchool(id: string, name: string, envelope: Envelope): Promise<School>;
  /** Default: the first school (made if none), this school year. */
  createYearGroup(fields: { name: string; school_id?: string; school_year?: string }, envelope: Envelope): Promise<YearGroup>;
  updateYearGroup(id: string, fields: { name?: string; note?: string | null }, envelope: Envelope): Promise<YearGroup>;
  archiveYearGroup(id: string, envelope: Envelope): Promise<YearGroup>;
  createClass(fields: { year_group_id: string; name: string; stage?: string | null; subject?: string | null }, envelope: Envelope): Promise<SchoolClass>;
  /** The study's fictional P7A, with names left out, in year group P7. */
  addDemoClass(envelope: Envelope): Promise<SchoolClass>;
  updateClass(id: string, fields: ClassFieldsUpdate, envelope: Envelope): Promise<SchoolClass>;
  archiveClass(id: string, envelope: Envelope): Promise<SchoolClass>;
  /** Into next school year, with its pupils; the year group moves up unless named. */
  copyClass(id: string, fields: { year_group_name?: string; name?: string }, envelope: Envelope): Promise<SchoolClass>;
  addPupils(classId: string, pupils: PupilFields[], envelope: Envelope): Promise<Pupil[]>;
  updatePupil(classId: string, pupilId: string, fields: PupilFields, envelope: Envelope): Promise<Pupil>;
  movePupil(classId: string, pupilId: string, toClassId: string, envelope: Envelope): Promise<Pupil>;
  archivePupil(classId: string, pupilId: string, envelope: Envelope): Promise<Pupil>;
  getCurriculum(): Promise<CurriculumStructure>;
  /** The experiences and outcomes: words or a code, at a level (0 Early to 4 Fourth), in an area and organiser. */
  searchCurriculum(q: { query?: string; level?: number; area?: string; organiser?: string }): Promise<CurriculumSearch>;
  curriculumBenchmarks(codes: string[]): Promise<{ benchmark_levels: string[]; benchmarks: CurriculumBenchmark[] }>;
  pickCurriculum(classId: string, items: CurriculumPick[], status: CurriculumStatus, envelope: Envelope): Promise<CurriculumItem[]>;
  /** `removed` takes the item off the class. */
  setCurriculumStatus(classId: string, itemId: string, status: CurriculumStatus | 'removed', envelope: Envelope): Promise<CurriculumItem>;
  addAdaptation(classId: string, pupilId: string, pick: AdaptationPick, envelope: Envelope): Promise<PupilAdaptation>;
  updateAdaptation(classId: string, id: string, fields: { status?: AdaptationStatus; overrides?: string | null }, envelope: Envelope): Promise<PupilAdaptation>;
  removeAdaptation(classId: string, id: string, envelope: Envelope): Promise<PupilAdaptation>;
}

export function classesApi(sessionId: string, opts: ApiOptions): ClassesApi {
  const base = `/sessions/${e(sessionId)}`;
  const cls = (id: string) => `${base}/classes/${e(id)}`;
  const pupil = (classId: string, pupilId: string, action: string) => `${cls(classId)}/pupils/${e(pupilId)}/${action}`;
  const post = <T>(path: string, body: Record<string, unknown>) => api<T>('POST', path, body, opts);
  return {
    listClasses: () => api<ClassesList>('GET', `${base}/classes`, undefined, opts),
    getClass: (id) => api<ClassDetail>('GET', cls(id), undefined, opts),
    createSchool: (name, envelope) => post<{ school: School }>(`${base}/schools`, { name, envelope }).then((r) => r.school),
    renameSchool: (id, name, envelope) => post<{ school: School }>(`${base}/schools/${e(id)}/rename`, { name, envelope }).then((r) => r.school),
    createYearGroup: (fields, envelope) => post<{ year_group: YearGroup }>(`${base}/year-groups`, { ...fields, envelope }).then((r) => r.year_group),
    updateYearGroup: (id, fields, envelope) => post<{ year_group: YearGroup }>(`${base}/year-groups/${e(id)}/update`, { ...fields, envelope }).then((r) => r.year_group),
    archiveYearGroup: (id, envelope) => post<{ year_group: YearGroup }>(`${base}/year-groups/${e(id)}/archive`, { envelope }).then((r) => r.year_group),
    createClass: (fields, envelope) => post<{ class: SchoolClass }>(`${base}/classes`, { ...fields, envelope }).then((r) => r.class),
    addDemoClass: (envelope) => post<{ class: SchoolClass }>(`${base}/classes/demo`, { envelope }).then((r) => r.class),
    updateClass: (id, fields, envelope) => post<{ class: SchoolClass }>(`${cls(id)}/update`, { ...fields, envelope }).then((r) => r.class),
    archiveClass: (id, envelope) => post<{ class: SchoolClass }>(`${cls(id)}/archive`, { envelope }).then((r) => r.class),
    copyClass: (id, fields, envelope) => post<{ class: SchoolClass }>(`${cls(id)}/copy`, { ...fields, envelope }).then((r) => r.class),
    addPupils: (classId, pupils, envelope) => post<{ pupils: Pupil[] }>(`${cls(classId)}/pupils`, { pupils, envelope }).then((r) => r.pupils),
    updatePupil: (classId, pupilId, fields, envelope) => post<{ pupil: Pupil }>(pupil(classId, pupilId, 'update'), { ...fields, envelope }).then((r) => r.pupil),
    movePupil: (classId, pupilId, to, envelope) => post<{ pupil: Pupil }>(pupil(classId, pupilId, 'move'), { to_class_id: to, envelope }).then((r) => r.pupil),
    archivePupil: (classId, pupilId, envelope) => post<{ pupil: Pupil }>(pupil(classId, pupilId, 'archive'), { envelope }).then((r) => r.pupil),
    getCurriculum: () => api<CurriculumStructure>('GET', `${base}/curriculum`, undefined, opts),
    searchCurriculum: (q) => post<CurriculumSearch>(`${base}/curriculum/search`, q),
    curriculumBenchmarks: (codes) => post(`${base}/curriculum/benchmarks`, { codes }),
    pickCurriculum: (classId, items, status, envelope) => post<{ items: CurriculumItem[] }>(`${cls(classId)}/curriculum`, { items, status, envelope }).then((r) => r.items),
    setCurriculumStatus: (classId, itemId, status, envelope) => post<{ item: CurriculumItem }>(`${cls(classId)}/curriculum/${e(itemId)}/status`, { status, envelope }).then((r) => r.item),
    addAdaptation: (classId, pupilId, pick, envelope) => post<{ adaptation: PupilAdaptation }>(`${cls(classId)}/pupils/${e(pupilId)}/adaptations`, { ...pick, envelope }).then((r) => r.adaptation),
    updateAdaptation: (classId, id, fields, envelope) => post<{ adaptation: PupilAdaptation }>(`${cls(classId)}/adaptations/${e(id)}/update`, { ...fields, envelope }).then((r) => r.adaptation),
    removeAdaptation: (classId, id, envelope) => post<{ adaptation: PupilAdaptation }>(`${cls(classId)}/adaptations/${e(id)}/remove`, { envelope }).then((r) => r.adaptation),
  };
}
