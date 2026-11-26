/** A turn's Stop: the teacher's Stop button (a `chat_stop` event) or the client closing the stream. */
import type { Db } from '../db/client.js';
import { ProviderError } from './errors.js';
import { stopRequested } from './history.js';

export interface StopControl {
  signal: AbortSignal;
  check(): Promise<boolean>;
  byTeacher(): Promise<boolean>;
}

/** Logged when the client closed the stream before the turn finished (and no Stop was logged). */
export const STREAM_CLOSED = 'the connection closed before the reply finished';

export const isStop = (err: unknown) => err instanceof ProviderError && err.kind === 'aborted';

/**
 * `signal` aborts the model call under way, `check` also looks for a Stop logged by another
 * server instance (and aborts once it finds one), `byTeacher` tells a Stop from a closed stream.
 */
export function stopControl(db: Db, sessionId: string, turnId: string, closed?: AbortSignal): StopControl {
  const controller = new AbortController();
  if (closed?.aborted) controller.abort();
  else closed?.addEventListener('abort', () => controller.abort(), { once: true });
  const byTeacher = () => stopRequested(db, sessionId, turnId);
  return {
    signal: controller.signal,
    async check() {
      if (!controller.signal.aborted && (await byTeacher())) controller.abort();
      return controller.signal.aborted;
    },
    byTeacher,
  };
}
