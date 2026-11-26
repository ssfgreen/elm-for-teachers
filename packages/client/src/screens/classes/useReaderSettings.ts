/**
 * A class's pupil reader settings (#186; the safety instruction #195), for the card on the class page: loaded once per class,
 * and saved one field at a time. Each field's saves are queued: the next is sent only once the one
 * before has settled, and only the newest value waiting goes, so the server ends with the last value
 * the teacher gave, whatever order it would handle requests in. A save the server refuses leaves the
 * last good value; a reply changes only its own field.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClassReaderSettings } from '@edw/shared';
import type { SessionApi } from '../../api/participant';
import type { Envelope } from '../../api/types';

export type ReaderField = 'follow_ups_max' | 'pupil_budget_gbp' | 'safety_instruction';

/** A number for the figures, text for the safety instruction, null for "back to the default". */
export type ReaderValue = number | string | null;

/** `stale`: a later save of the same field was made since, so this one's outcome is not shown. */
export type SaveOutcome = 'saved' | 'failed' | 'stale';

export interface ReaderSettingsState {
  /** Null while loading, or when it could not load. */
  settings: ClassReaderSettings | null;
  loadFailed: boolean;
  /** Sets a field or goes back to the default (null). */
  save(field: ReaderField, value: ReaderValue): Promise<SaveOutcome>;
}

/** A field's saves: whether one is with the server, and the newest value waiting behind it. */
export interface Queue {
  busy: boolean;
  waiting: { value: ReaderValue; resolve: (o: SaveOutcome) => void } | null;
}
export const idle = (): Queue => ({ busy: false, waiting: null });

/**
 * Puts a value in a field's queue. It is sent once the save before it has settled, unless a newer
 * value overtakes it first (then `stale`). A save settled with another waiting behind is `stale` too.
 */
export function enqueue(q: Queue, value: ReaderValue, send: (value: ReaderValue) => Promise<void>): Promise<SaveOutcome> {
  return new Promise((resolve) => {
    q.waiting?.resolve('stale');
    q.waiting = { value, resolve };
    if (!q.busy) void drain(q, send);
  });
}

async function drain(q: Queue, send: (value: ReaderValue) => Promise<void>): Promise<void> {
  q.busy = true;
  while (q.waiting) {
    const { value, resolve } = q.waiting;
    q.waiting = null;
    const outcome: SaveOutcome = await send(value).then(
      () => 'saved',
      () => 'failed',
    );
    resolve(q.waiting ? 'stale' : outcome);
  }
  q.busy = false;
}

/** The field from the reply, the rest as it is now. Pure. */
export function takeField(now: ClassReaderSettings, reply: ClassReaderSettings, field: ReaderField): ClassReaderSettings {
  return { ...now, [field]: reply[field], defaults: reply.defaults, set: { ...now.set, [field]: reply.set[field] } };
}

export function useReaderSettings(api: SessionApi, classId: string, getEnvelope: () => Envelope): ReaderSettingsState {
  const [settings, setSettings] = useState<ClassReaderSettings | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const { getReaderSettings, setReaderSettings } = api;
  const queues = useRef<Record<ReaderField, Queue>>({ follow_ups_max: idle(), pupil_budget_gbp: idle(), safety_instruction: idle() });

  useEffect(() => {
    if (!getReaderSettings) return;
    let live = true;
    setSettings(null);
    setLoadFailed(false);
    getReaderSettings(classId).then(
      (s) => live && setSettings(s),
      () => live && setLoadFailed(true),
    );
    return () => {
      live = false;
    };
  }, [getReaderSettings, classId]);

  const save = useCallback(
    (field: ReaderField, value: ReaderValue): Promise<SaveOutcome> => {
      if (!setReaderSettings) return Promise.resolve('failed');
      return enqueue(queues.current[field], value, async (v) => {
        const reply = await setReaderSettings(classId, { [field]: v }, getEnvelope());
        setSettings((now) => (now ? takeField(now, reply, field) : reply));
      });
    },
    [setReaderSettings, classId, getEnvelope],
  );

  return { settings, loadFailed, save };
}
