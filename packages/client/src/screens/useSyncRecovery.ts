/**
 * After the editor drops its queue (a refused command), the server's canvas is taken as truth:
 * typing is forgotten, the snapshot reloaded, and the editor rebuilt over it (`epoch`).
 *
 * Idle or reloading: refusals that come while a reload is under way join it (a refused command
 * changed nothing on the server), so the editor is rebuilt once, not once per refusal. A reload
 * that fails shows "could not be loaded" until one works.
 */
import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import type { SessionApi } from '../api/participant';
import type { CanvasSnapshot } from '../editor/types';
import type { EventLogger } from '../events/logger';

export interface SyncRecoveryDeps {
  api: Pick<SessionApi, 'getCanvas'>;
  logger: Pick<EventLogger, 'log'>;
  forgetTyping: () => void;
  setSnap: Dispatch<SetStateAction<CanvasSnapshot | null>>;
  setEpoch: Dispatch<SetStateAction<number>>;
  setLoadError: Dispatch<SetStateAction<boolean>>;
}

export function useSyncRecovery({ api, logger, forgetTyping, setSnap, setEpoch, setLoadError }: SyncRecoveryDeps) {
  const reloading = useRef(false);
  return useCallback(
    (err: unknown) => {
      logger.log('error', { source: 'client', message: `canvas sync: ${err instanceof Error ? err.message : String(err)}` });
      if (reloading.current) return;
      reloading.current = true;
      api
        .getCanvas()
        .then((s) => {
          forgetTyping();
          setSnap(s);
          // A fresh editor over the server's version: the old one may hold changes the server refused.
          setEpoch((e) => e + 1);
          setLoadError(false);
        })
        .catch(() => setLoadError(true))
        .finally(() => {
          reloading.current = false;
        });
    },
    [api, logger, forgetTyping, setSnap, setEpoch, setLoadError],
  );
}
