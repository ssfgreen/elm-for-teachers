/**
 * Naming an Untitled chat on its own: after each of its turns the client asks the server, which
 * names the chat once it has had its first three prompts (server/src/threads/title.ts) and
 * otherwise sends it back as it is. A separate request after the reply is taken in, so it never
 * holds up a turn. Quiet: a failure is logged, not shown, and the teacher can still use the wand.
 */
import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { Thread } from '@edw/shared';
import type { SessionApi } from '../api/participant';
import type { Envelope } from '../api/types';
import type { EventLogger } from '../events/logger';
import { UNTITLED } from '../state/canvasState';

export interface AutoNameDeps {
  api: Pick<SessionApi, 'nameThread'>;
  getEnvelope: () => Envelope;
  threads: Thread[];
  setThreads: Dispatch<SetStateAction<Thread[]>>;
  logger: Pick<EventLogger, 'log'>;
}

/** Returns what to call after a chat turn's reply, with the turn's chat. */
export function useAutoName({ api, getEnvelope, threads, setThreads, logger }: AutoNameDeps) {
  const threadsRef = useRef(threads);
  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);
  const asking = useRef(new Set<string>());

  return useCallback(
    async (threadId: string) => {
      const thread = threadsRef.current.find((t) => t.id === threadId);
      if (!api.nameThread || thread?.title !== UNTITLED || asking.current.has(threadId)) return;
      asking.current.add(threadId);
      try {
        const named = await api.nameThread(threadId, getEnvelope(), { auto: true });
        if (named.title === UNTITLED) return;
        // A name the teacher typed meanwhile stays (the server keeps it too).
        setThreads((ts) => ts.map((t) => (t.id === named.id && t.title === UNTITLED ? named : t)));
      } catch (err) {
        logger.log('error', { source: 'client', message: `auto-naming chat failed: ${err instanceof Error ? err.message : String(err)}` });
      } finally {
        asking.current.delete(threadId);
      }
    },
    [api, getEnvelope, setThreads, logger],
  );
}
