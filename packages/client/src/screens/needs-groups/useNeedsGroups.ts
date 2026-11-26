/** Loads and mutates the workspace's needs groups (T1). */
import { useCallback, useEffect, useState } from 'react';
import type { NeedsGroupInput, NeedsGroupSummary, NeedsGroupUpdate } from '@edw/shared';
import type { SessionApi } from '../../api/participant';
import type { Envelope } from '../../api/types';

export interface NeedsGroupsState {
  groups: NeedsGroupSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (input: NeedsGroupInput) => Promise<NeedsGroupSummary | null>;
  update: (id: string, patch: NeedsGroupUpdate) => Promise<NeedsGroupSummary | null>;
  archive: (id: string) => Promise<void>;
  toggleClass: (group: NeedsGroupSummary, classId: string) => Promise<void>;
}

export function useNeedsGroups(api: SessionApi, getEnvelope: () => Envelope): NeedsGroupsState {
  const [groups, setGroups] = useState<NeedsGroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!api.listNeedsGroups) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setGroups(await api.listNeedsGroups());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load needs groups.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (input: NeedsGroupInput) => {
      if (!api.createNeedsGroup) return null;
      try {
        const made = await api.createNeedsGroup(input, getEnvelope());
        setGroups((prev) => [...prev, made]);
        setError(null);
        return made;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not create needs group.');
        return null;
      }
    },
    [api, getEnvelope],
  );

  const update = useCallback(
    async (id: string, patch: NeedsGroupUpdate) => {
      if (!api.updateNeedsGroup) return null;
      try {
        const next = await api.updateNeedsGroup(id, patch, getEnvelope());
        setGroups((prev) => prev.map((g) => (g.id === id ? next : g)));
        setError(null);
        return next;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save changes.');
        return null;
      }
    },
    [api, getEnvelope],
  );

  const archive = useCallback(
    async (id: string) => {
      if (!api.archiveNeedsGroup) return;
      try {
        const next = await api.archiveNeedsGroup(id, getEnvelope());
        setGroups((prev) => prev.map((g) => (g.id === id ? next : g)));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not archive needs group.');
      }
    },
    [api, getEnvelope],
  );

  const toggleClass = useCallback(
    async (group: NeedsGroupSummary, classId: string) => {
      const attached = group.class_ids.includes(classId);
      try {
        const next = attached
          ? await api.detachNeedsGroupClass?.(group.id, classId)
          : await api.attachNeedsGroupClass?.(group.id, classId, getEnvelope());
        if (next) setGroups((prev) => prev.map((g) => (g.id === group.id ? next : g)));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not update class assignment.');
      }
    },
    [api, getEnvelope],
  );

  return { groups, loading, error, refresh, create, update, archive, toggleClass };
}
