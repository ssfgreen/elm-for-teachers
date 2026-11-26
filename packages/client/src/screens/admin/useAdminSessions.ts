import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveFeatures, storedFeatures, type FeatureName, type FeaturesPatch } from '@edw/shared';
import type { AdminApi } from '../../api/admin';
import type { AdminSessionRow } from '../../api/types';

/** A workspace just made or renamed, with the link to hand out (null: an account workspace, reached by signing in). */
export interface CreatedWorkspace {
  session: AdminSessionRow;
  participant_url: string | null;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The admin's workspace list: loads it, creates, renames, switches features, and keeps the last created link. */
export function useAdminSessions(api: Pick<AdminApi, 'listSessions' | 'createSession' | 'renameSession' | 'setFeatures'>) {
  const [sessions, setSessions] = useState<AdminSessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedWorkspace | null>(null);
  const { listSessions, createSession, renameSession, setFeatures: saveFeatures } = api;
  /** The latest feature save per workspace: an older answer arriving later is not shown. */
  const featureSaves = useRef(new Map<string, number>());

  const load = useCallback(() => {
    listSessions()
      .then((s) => {
        setSessions(s);
        setError(null);
      })
      .catch((e: unknown) => setError(message(e)));
  }, [listSessions]);

  useEffect(() => load(), [load]);

  /**
   * Makes a workspace; resolves true when it was made. `features`: switches to start with; only
   * those that differ from their default are sent.
   */
  const create = async (label: string, study: boolean, features?: FeaturesPatch): Promise<boolean> => {
    const changed = features ? storedFeatures(resolveFeatures(features)) : null;
    try {
      setCreated(await createSession(label, { study, ...(changed ? { features: changed } : {}) }));
      load();
      return true;
    } catch (err) {
      setError(message(err));
      return false;
    }
  };

  const rename = async (sessionId: string, next: string) => {
    try {
      const renamed = await renameSession(sessionId, next);
      setSessions((all) => all.map((s) => (s.session_id === sessionId ? { ...s, ...renamed.session } : s)));
      setCreated((c) => (c?.session.session_id === sessionId ? renamed : c));
      setError(null);
    } catch (err) {
      setError(message(err));
    }
  };

  /**
   * Changes some of a workspace's feature switches. The ticks move at once; a refused save puts
   * them back. Only the answer to the latest save on a workspace replaces its row, so two quick
   * ticks cannot end with the older answer shown. Resolves null when saved, or the reason it was not.
   */
  const setFeatures = async (sessionId: string, patch: FeaturesPatch): Promise<string | null> => {
    const ticket = (featureSaves.current.get(sessionId) ?? 0) + 1;
    featureSaves.current.set(sessionId, ticket);
    const latest = () => featureSaves.current.get(sessionId) === ticket;
    const before = resolveFeatures(sessions.find((s) => s.session_id === sessionId)?.features ?? null);
    const put = (p: FeaturesPatch) =>
      setSessions((all) => all.map((s) => (s.session_id === sessionId ? { ...s, features: { ...resolveFeatures(s.features ?? null), ...p } } : s)));
    put(patch);
    try {
      const saved = await saveFeatures(sessionId, patch);
      if (!latest()) return null;
      setSessions((all) => all.map((s) => (s.session_id === sessionId ? { ...s, ...saved } : s)));
      return null;
    } catch (err) {
      put(Object.fromEntries(Object.keys(patch).map((k) => [k, before[k as FeatureName]])));
      return message(err);
    }
  };

  /**
   * A row the server changed (the interaction logging switch, a new code, a replaced or closed
   * link). The link just made follows it: a replaced link shows the new one, a closed one goes.
   */
  const replace = (next: AdminSessionRow) => {
    setSessions((all) => all.map((x) => (x.session_id === next.session_id ? { ...x, ...next } : x)));
    setCreated((c) => {
      if (c?.session.session_id !== next.session_id) return c;
      if (next.link_closed_at) return null;
      const session = { ...c.session, ...next };
      return { session, participant_url: 'participant_url' in next ? next.participant_url : c.participant_url };
    });
  };

  const deleted = (sessionId: string) => {
    if (created?.session.session_id === sessionId) setCreated(null);
    load();
  };

  return { sessions, error, created, create, rename, setFeatures, replace, deleted };
}

export type AdminSessions = ReturnType<typeof useAdminSessions>;
