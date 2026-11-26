/** A class's readings (#187): an article set for the class, and the prompts it allows. */
import type { Reading, ReadingFields, ReadingPatch, ReadingSource, ReaderPrompt } from '@edw/shared';
import { endpoints } from './endpoints';
import { api, type ApiOptions } from './http';
import type { Envelope } from './types';

export interface ReadingsApi {
  /** The class's readings, newest first (never the copy itself). */
  listReadings(classId: string): Promise<Reading[]>;
  /** Stores a frozen copy of the doc as it is now. */
  setReading(classId: string, fields: ReadingFields, envelope: Envelope): Promise<Reading>;
  updateReading(classId: string, readingId: string, patch: ReadingPatch, envelope: Envelope): Promise<Reading>;
  removeReading(classId: string, readingId: string, envelope: Envelope): Promise<void>;
  /** The docs a reading can be set from: name and chat title, newest first. */
  listReadingSources(): Promise<ReadingSource[]>;
  /** The prompt library (reader-prompts), to tick from. */
  listReaderPrompts(): Promise<ReaderPrompt[]>;
}

export function readingsApi(sessionId: string, opts: ApiOptions): ReadingsApi {
  const at = (classId: string, readingId?: string) => endpoints.readings(sessionId, classId, readingId);
  return {
    listReadings: (classId) => api<{ readings: Reading[] }>('GET', at(classId), undefined, opts).then((r) => r.readings),
    setReading: (classId, fields, envelope) => api<{ reading: Reading }>('POST', at(classId), { ...fields, envelope }, opts).then((r) => r.reading),
    updateReading: (classId, readingId, patch, envelope) => api<{ reading: Reading }>('PATCH', at(classId, readingId), { ...patch, envelope }, opts).then((r) => r.reading),
    removeReading: (classId, readingId, envelope) => api<void>('DELETE', at(classId, readingId), { envelope }, opts),
    listReadingSources: () => api<{ sources: ReadingSource[] }>('GET', endpoints.readingSources(sessionId), undefined, opts).then((r) => r.sources),
    listReaderPrompts: () => api<{ prompts: ReaderPrompt[] }>('GET', endpoints.readerPrompts(sessionId), undefined, opts).then((r) => r.prompts),
  };
}

/** Whether this api has readings (the make kit's has none). */
export function hasReadings<T extends Partial<ReadingsApi>>(api: T): api is T & ReadingsApi {
  return typeof api.listReadings === 'function';
}
