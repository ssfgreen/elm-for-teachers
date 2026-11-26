/**
 * A class's readings for its page (#187): loads them with the docs they can be set from and the
 * prompt library, and sets, updates and removes them through the server. Nothing is shown before
 * the server answers; a refusal says why, and reloads when the list was not what we thought.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Reading, ReadingFields, ReadingPatch, ReadingSource, ReaderPrompt } from '@edw/shared';
import type { ReadingsApi } from '../../../api/readings';
import type { Envelope } from '../../../api/types';
import { refusal } from './readingView';

export interface ClassReadings {
  status: 'loading' | 'ready' | 'failed';
  readings: Reading[];
  sources: ReadingSource[];
  prompts: ReaderPrompt[];
  error: string | null;
  /** Each resolves true when the server took it. */
  set(fields: ReadingFields): Promise<boolean>;
  update(readingId: string, patch: ReadingPatch): Promise<boolean>;
  remove(readingId: string): Promise<boolean>;
  /** The docs again (a doc made since the page opened). */
  refreshSources(): void;
}

export function useReadings(api: ReadingsApi, classId: string, getEnvelope: () => Envelope): ClassReadings {
  const [status, setStatus] = useState<ClassReadings['status']>('loading');
  const [readings, setReadings] = useState<Reading[]>([]);
  const [sources, setSources] = useState<ReadingSource[]>([]);
  const [prompts, setPrompts] = useState<ReaderPrompt[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([api.listReadings(classId), api.listReadingSources(), api.listReaderPrompts()]).then(
        ([r, s, p]) => {
          setReadings(r);
          setSources(s);
          setPrompts(p);
          setStatus('ready');
        },
        () => setStatus((was) => (was === 'ready' ? was : 'failed')),
      ),
    [api, classId],
  );

  useEffect(() => {
    setStatus('loading');
    setError(null);
    void load();
  }, [load]);

  const attempt = useCallback(
    async (run: () => Promise<void>) => {
      setError(null);
      try {
        await run();
        return true;
      } catch (e) {
        const r = refusal(e);
        setError(r.message);
        if (r.reload) void load();
        return false;
      }
    },
    [load],
  );

  const set = useCallback(
    (fields: ReadingFields) =>
      attempt(async () => {
        const made = await api.setReading(classId, fields, getEnvelope());
        // The same doc set again replaces its reading.
        setReadings((rs) => [made, ...rs.filter((r) => r.doc_id !== made.doc_id)]);
      }),
    [api, attempt, classId, getEnvelope],
  );

  const update = useCallback(
    (readingId: string, patch: ReadingPatch) =>
      attempt(async () => {
        const saved = await api.updateReading(classId, readingId, patch, getEnvelope());
        setReadings((rs) => rs.map((r) => (r.id === saved.id ? saved : r)));
      }),
    [api, attempt, classId, getEnvelope],
  );

  const remove = useCallback(
    (readingId: string) =>
      attempt(async () => {
        await api.removeReading(classId, readingId, getEnvelope());
        setReadings((rs) => rs.filter((r) => r.id !== readingId));
      }),
    [api, attempt, classId, getEnvelope],
  );

  const refreshSources = useCallback(() => void api.listReadingSources().then(setSources, () => undefined), [api]);

  return { status, readings, sources, prompts, error, set, update, remove, refreshSources };
}
