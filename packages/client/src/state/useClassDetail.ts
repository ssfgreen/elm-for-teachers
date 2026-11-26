/**
 * A class's detail from the one copy (state/classDetail.ts). Each reader asks for a fresh load
 * when it appears, as each did before; readers that appear together share one request, and what
 * is already held shows meanwhile.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { ClassDetail } from '../api/classes';
import { classDetailStore, type ClassDetailApi, type ClassDetailEntry } from './classDetail';

const NONE: ClassDetailEntry = { detail: null, failed: false };

export function useClassDetail(api: ClassDetailApi, classId: string | null | undefined) {
  const store = classDetailStore(api);
  const get = () => (classId ? store.entry(classId) : NONE);
  const { detail, failed } = useSyncExternalStore(store.subscribe, get, get);
  useEffect(() => {
    if (classId) store.load(classId);
  }, [store, classId]);
  const update = useCallback(
    (change: (d: ClassDetail) => ClassDetail) => {
      if (classId) store.update(classId, change);
    },
    [store, classId],
  );
  /** Another class changed on the server (a pupil moved into it). */
  const refreshOther = useCallback((otherId: string) => store.refresh(otherId), [store]);
  return { detail, failed, update, refreshOther };
}
