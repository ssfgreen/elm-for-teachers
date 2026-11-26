/**
 * One copy of each class's detail (its pupils, their adaptations and its curriculum) per api, so
 * every place that shows a class reads the same one and an edit shows everywhere at once. Readers
 * use `useClassDetail`; the pupil table and the curriculum card write through `update`. Plain, so
 * it is tested without React.
 *
 * The detail's `class` and `year_group` are held as loaded and are not kept up to date (a rename,
 * a move to another year group): no reader uses them. Read those from the class list (useClasses).
 */
import type { ClassDetail } from '../api/classes';

export type ClassDetailApi = { getClass?: (classId: string) => Promise<ClassDetail> };

export interface ClassDetailEntry {
  /** None until the class has loaded. */
  detail: ClassDetail | null;
  /** The last load failed and there is nothing to show. */
  failed: boolean;
}

export interface ClassDetailStore {
  entry(classId: string): ClassDetailEntry;
  /** Fetches the class (again); calls made while one is on its way share it. */
  load(classId: string): void;
  /** A local change, after the server took it. Nothing happens before the class has loaded. */
  update(classId: string, change: (d: ClassDetail) => ClassDetail): void;
  /** Fetches the class again if it is held or on its way: something changed it on the server (a pupil moved in). */
  refresh(classId: string): void;
  subscribe(listener: () => void): () => void;
}

/** Rows the server has just made, joined to the list; a load that already had one does not double it. */
export function withAdded<T extends { id: string }>(rows: T[], added: T[]): T[] {
  const ids = new Set(added.map((a) => a.id));
  return [...rows.filter((r) => !ids.has(r.id)), ...added];
}

const EMPTY: ClassDetailEntry = { detail: null, failed: false };

export function createClassDetailStore(api: ClassDetailApi): ClassDetailStore {
  const entries = new Map<string, ClassDetailEntry>();
  /** Bumped by each local change: a fetch that started before one is out of date. */
  const revs = new Map<string, number>();
  const loading = new Set<string>();
  const listeners = new Set<() => void>();

  const set = (classId: string, e: ClassDetailEntry) => {
    entries.set(classId, e);
    listeners.forEach((l) => l());
  };
  const entry = (classId: string) => entries.get(classId) ?? EMPTY;

  const load = (classId: string) => {
    if (!api.getClass || loading.has(classId)) return;
    loading.add(classId);
    const rev = revs.get(classId) ?? 0;
    api
      .getClass(classId)
      .then((detail) => {
        loading.delete(classId);
        // The teacher changed the class while this was on its way: it may not have the change.
        if ((revs.get(classId) ?? 0) !== rev) load(classId);
        else set(classId, { detail, failed: false });
      })
      .catch(() => {
        loading.delete(classId);
        if (!entry(classId).detail) set(classId, { detail: null, failed: true });
      });
  };

  return {
    entry,
    load,
    update(classId, change) {
      const cur = entry(classId).detail;
      if (!cur) return;
      revs.set(classId, (revs.get(classId) ?? 0) + 1);
      set(classId, { detail: change(cur), failed: false });
    },
    refresh(classId) {
      // A load on its way was asked for before the change: its answer is thrown away and asked for again.
      if (loading.has(classId)) revs.set(classId, (revs.get(classId) ?? 0) + 1);
      else if (entries.has(classId)) load(classId);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

const stores = new WeakMap<object, ClassDetailStore>();

/** The store for an api (one per workspace session); made when first asked for. */
export function classDetailStore(api: ClassDetailApi): ClassDetailStore {
  let s = stores.get(api);
  if (!s) {
    s = createClassDetailStore(api);
    stores.set(api, s);
  }
  return s;
}
