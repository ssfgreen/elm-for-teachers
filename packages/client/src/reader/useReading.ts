/**
 * One reading as the pupil's page holds it (#213): the copy, the pupil's highlights, and saving
 * and removing them. The server is the only store: a highlight shows once the server has it, and
 * a failed save or removal leaves the page as it was and says so. One per page
 * (docs/client-state.md).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Highlight, HighlightFields, PupilReading } from '@edw/shared';
import { errorCode } from '../api/http';
import { deleteHighlight, fetchHighlights, fetchReading, saveHighlight } from './readerApi';

export type ReadingLoad = { status: 'loading' } | { status: 'ready'; reading: PupilReading } | { status: 'refused'; code: string | null };

export interface ReadingState {
  load: ReadingLoad;
  highlights: Highlight[];
  /** Why the last save or removal failed (a reason code), or null. */
  failed: string | null;
  add: (h: HighlightFields) => Promise<boolean>;
  remove: (highlightId: string) => Promise<boolean>;
}

export function useReading(readingId: string): ReadingState {
  const [load, setLoad] = useState<ReadingLoad>({ status: 'loading' });
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  /** The reading the page shows now: an answer for another one changes nothing. */
  const shown = useRef(readingId);

  useEffect(() => {
    shown.current = readingId;
    let live = true;
    setLoad({ status: 'loading' });
    Promise.all([fetchReading(readingId), fetchHighlights(readingId)])
      .then(([reading, hs]) => {
        if (!live) return;
        setHighlights(hs);
        setLoad({ status: 'ready', reading });
      })
      .catch((err: unknown) => live && setLoad({ status: 'refused', code: errorCode(err) }));
    return () => {
      live = false;
    };
  }, [readingId]);

  const add = useCallback(
    async (h: HighlightFields) => {
      try {
        const made = await saveHighlight(readingId, h);
        if (shown.current !== readingId) return false;
        setHighlights((hs) => [...hs, made]);
        setFailed(null);
        return true;
      } catch (err) {
        if (shown.current === readingId) setFailed(errorCode(err) ?? 'failed');
        return false;
      }
    },
    [readingId],
  );

  const remove = useCallback(
    async (highlightId: string) => {
      try {
        await deleteHighlight(readingId, highlightId);
        if (shown.current !== readingId) return false;
        setHighlights((hs) => hs.filter((x) => x.id !== highlightId));
        setFailed(null);
        return true;
      } catch (err) {
        if (shown.current === readingId) setFailed(errorCode(err) ?? 'failed');
        return false;
      }
    },
    [readingId],
  );

  return { load, highlights, failed, add, remove };
}
