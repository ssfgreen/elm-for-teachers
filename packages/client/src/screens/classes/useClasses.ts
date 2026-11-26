/**
 * The workspace's year groups and classes (docs/classes.md): the list, with each class's pupil
 * count, and the actions that open, make, change and archive them. A class's pupils and
 * curriculum are in state/classDetail.ts; its page calls `refresh` after a change so the counts
 * here follow.
 */
import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { ClassesList, type SchoolClass, type YearGroup } from '@edw/shared';
import type { ClassFieldsUpdate } from '../../api/classes';
import type { SessionApi } from '../../api/participant';
import type { Envelope } from '../../api/types';
import type { EventLogger } from '../../events/logger';
import type { MainView } from '../WorkspaceScreen';

const EMPTY: ClassesList = { schools: [], year_groups: [], classes: [] };

/** The list as the server sent it, or none when it is not one (an older server, a test's fake). */
const wellFormed = (l: unknown): ClassesList => {
  const r = ClassesList.safeParse(l);
  return r.success ? r.data : EMPTY;
};

/** A call the api may not have (the make kit has no classes). */
function required<T>(f: T | undefined): T {
  if (!f) throw new Error('classes are not available');
  return f;
}

export function useClasses({
  api,
  getEnvelope,
  logger,
  setView,
}: {
  api: SessionApi;
  getEnvelope: () => Envelope;
  logger: EventLogger;
  setView: Dispatch<SetStateAction<MainView>>;
}) {
  const [list, setList] = useState<ClassesList>(EMPTY);
  const available = !!api.listClasses;

  const refresh = useCallback(async () => {
    if (!api.listClasses) return;
    setList(wellFormed(await api.listClasses()));
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    api
      .listClasses?.()
      .then((l) => {
        if (!cancelled) setList(wellFormed(l));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api]);

  /** The Classes screen (no ids), a year group's page or a class's page. */
  const showClasses = useCallback(
    (to: { classId?: string; yearGroupId?: string } = {}) => {
      logger.log('class_open', {
        class_id: to.classId ?? null,
        year_group_id: to.classId ? null : (to.yearGroupId ?? null),
      });
      setView({ kind: 'classes', ...to });
    },
    [logger, setView],
  );

  const putYearGroup = useCallback(
    (y: YearGroup) =>
      setList((l) => ({
        ...l,
        year_groups: l.year_groups.some((x) => x.id === y.id)
          ? l.year_groups.map((x) => (x.id === y.id ? y : x))
          : [...l.year_groups, y],
      })),
    [],
  );
  const putClass = useCallback(
    (c: SchoolClass) =>
      setList((l) => {
        const old = l.classes.find((x) => x.id === c.id);
        const next = {
          ...c,
          pupil_count: old?.pupil_count ?? 0,
          // No longer shown (#243); kept in the type so the list still parses.
          needs_counts: {},
        };
        return {
          ...l,
          classes: old ? l.classes.map((x) => (x.id === c.id ? next : x)) : [...l.classes, next],
        };
      }),
    [],
  );

  const createYearGroup = useCallback(
    async (fields: { name: string; school_id?: string; school_year?: string }) => {
      const y = await required(api.createYearGroup)(fields, getEnvelope());
      // The first year group may have made the first school too.
      await refresh();
      return y;
    },
    [api, getEnvelope, refresh],
  );

  const renameSchool = useCallback(
    async (id: string, name: string) => {
      const school = await required(api.renameSchool)(id, name, getEnvelope());
      setList((l) => ({ ...l, schools: l.schools.map((x) => (x.id === id ? school : x)) }));
    },
    [api, getEnvelope],
  );

  const updateYearGroup = useCallback(
    async (id: string, fields: { name?: string; note?: string | null }) => {
      putYearGroup(await required(api.updateYearGroup)(id, fields, getEnvelope()));
    },
    [api, getEnvelope, putYearGroup],
  );

  const archiveYearGroup = useCallback(
    async (id: string) => {
      putYearGroup(await required(api.archiveYearGroup)(id, getEnvelope()));
      setView({ kind: 'classes' });
    },
    [api, getEnvelope, setView, putYearGroup],
  );

  const createClass = useCallback(
    async (fields: { year_group_id: string; name: string; stage?: string | null; subject?: string | null }) => {
      const c = await required(api.createClass)(fields, getEnvelope());
      putClass(c);
      showClasses({ classId: c.id });
    },
    [api, getEnvelope, showClasses, putClass],
  );

  /**
   * A class from the list's form: into the year group of that name in the school year (in the
   * first school), made if there is none yet.
   */
  const addClass = useCallback(
    async (fields: { name: string; year_group: string; subject: string | null; school_year: string }) => {
      const school = list.schools.find((x) => !x.archived_at && !x.demo);
      const existing = list.year_groups.find((y) => !y.archived_at && y.school_year === fields.school_year && y.name.toLowerCase() === fields.year_group.trim().toLowerCase() && (!school || y.school_id === school.id));
      const yearGroup = existing ?? (await required(api.createYearGroup)({ name: fields.year_group.trim(), school_year: fields.school_year, ...(school ? { school_id: school.id } : {}) }, getEnvelope()));
      await createClass({ year_group_id: yearGroup.id, name: fields.name, subject: fields.subject });
      if (!existing) await refresh();
    },
    [api, getEnvelope, list, createClass, refresh],
  );

  /** Into next school year with its pupils; opens the new class. */
  const copyClass = useCallback(
    async (id: string, fields: { year_group_name?: string; name?: string }) => {
      const c = await required(api.copyClass)(id, fields, getEnvelope());
      await refresh();
      showClasses({ classId: c.id });
    },
    [api, getEnvelope, refresh, showClasses],
  );

  /** Adds the demo P7A and opens it. */
  const addDemoClass = useCallback(async () => {
    const c = await required(api.addDemoClass)(getEnvelope());
    await refresh();
    showClasses({ classId: c.id });
  }, [api, getEnvelope, refresh, showClasses]);

  const updateClass = useCallback(
    async (id: string, fields: ClassFieldsUpdate) => {
      putClass(await required(api.updateClass)(id, fields, getEnvelope()));
    },
    [api, getEnvelope, putClass],
  );

  const archiveClass = useCallback(
    async (id: string) => {
      putClass(await required(api.archiveClass)(id, getEnvelope()));
      setView({ kind: 'classes' });
    },
    [api, getEnvelope, setView, putClass],
  );

  return {
    available,
    list,
    refresh,
    showClasses,
    createYearGroup,
    renameSchool,
    addClass,
    copyClass,
    updateYearGroup,
    archiveYearGroup,
    createClass,
    addDemoClass,
    updateClass,
    archiveClass,
  };
}

export type Classes = ReturnType<typeof useClasses>;
