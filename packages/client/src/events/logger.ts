import { newUlid } from '@edw/shared';
import type { ClientEvent, ClientEventBatch, EventKind, FocusPane, PayloadOfKind } from '@edw/shared';
import { api } from '../api/http';

export interface EventLoggerOptions {
  sessionId: string;
  participantToken: string;
  /** Minimum gap between sends. Default 500. */
  batchMs?: number;
  /** Queue length that triggers an immediate send. Default 100. */
  maxBatch?: number;
  /** The doc and thread open when an event is logged; every event carries them. */
  getContext: () => EventContext;
  getFocusPane: () => FocusPane;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /** Each accepted batch's answer: whether interaction logging is on for the workspace (events/interactions). */
  onAck?: (ack: { interactions: boolean }) => void;
}

export interface EventContext {
  doc_id: string | null;
  thread_id: string | null;
}

export interface EventLogger {
  log<K extends EventKind>(kind: K, payload: PayloadOfKind<K>): string;
  /** Events queued or in flight (not yet acknowledged). */
  pending(): number;
  /** Resolves once everything queued so far has been acknowledged (or the logger is stopped). */
  flush(): Promise<void>;
  /** Called with the failure count and error when a batch has failed 3 times in a row (and on each later failure). */
  onError(cb: (err: unknown, failures: number) => void): () => void;
  /** Stop timers and page-hide listeners. Unsent events are dropped. */
  stop(): void;
}

export const BACKOFF_BASE_MS = 500;
export const BACKOFF_CAP_MS = 10_000;
export const ERROR_AFTER_FAILURES = 3;

export function backoffDelay(failures: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_CAP_MS);
}

export function createEventLogger(opts: EventLoggerOptions): EventLogger {
  const batchMs = opts.batchMs ?? 500;
  const maxBatch = opts.maxBatch ?? 100;
  const now = opts.now ?? (() => new Date());

  let queue: ClientEvent[] = [];
  let inflight = false;
  let failures = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let flushRequested = false;
  let waiters: Array<() => void> = [];
  const errorCbs = new Set<(err: unknown, failures: number) => void>();

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const schedule = (ms: number) => {
    if (stopped || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void send();
    }, ms);
  };
  const resolveWaiters = () => {
    const w = waiters;
    waiters = [];
    w.forEach((r) => r());
  };

  async function send(): Promise<void> {
    if (stopped || inflight || queue.length === 0) return;
    clearTimer();
    const batch = queue.slice(0, maxBatch);
    inflight = true;
    try {
      const body: ClientEventBatch = { session_id: opts.sessionId, events: batch };
      const ack = await api<{ accepted: number; last_seq: number; interactions?: boolean }>(
        'POST',
        `/sessions/${encodeURIComponent(opts.sessionId)}/events`,
        body,
        { token: opts.participantToken, fetchImpl: opts.fetchImpl },
      );
      const sent = new Set(batch);
      queue = queue.filter((e) => !sent.has(e));
      failures = 0;
      inflight = false;
      if (typeof ack?.interactions === 'boolean') opts.onAck?.({ interactions: ack.interactions });
      if (queue.length === 0) {
        flushRequested = false;
        resolveWaiters();
      } else if (flushRequested || queue.length >= maxBatch) {
        void send();
      } else {
        schedule(batchMs);
      }
    } catch (err) {
      inflight = false;
      failures += 1;
      if (failures >= ERROR_AFTER_FAILURES) errorCbs.forEach((cb) => cb(err, failures));
      schedule(backoffDelay(failures));
    }
  }

  function hideFlush(): void {
    if (stopped || queue.length === 0) return;
    const events = queue.slice();
    const body: ClientEventBatch = { session_id: opts.sessionId, events };
    const url = `/api/sessions/${encodeURIComponent(opts.sessionId)}/events`;
    const json = JSON.stringify(body);
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      // sendBeacon cannot set headers, so the token travels as a query parameter.
      const blob = new Blob([json], { type: 'application/json' });
      const ok = navigator.sendBeacon(`${url}?token=${encodeURIComponent(opts.participantToken)}`, blob);
      if (ok) {
        // Events in an in-flight request are removed when that request settles; the server de-duplicates by event_id.
        const sent = new Set(events);
        queue = queue.filter((e) => !sent.has(e));
        return;
      }
    }
    const f = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    void f(url, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.participantToken}` },
      body: json,
    }).catch(() => undefined);
    // keepalive fetch outcome is unknown; leave the events queued so a resumed page retries.
  }

  const onVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') hideFlush();
  };
  const onPageHide = () => hideFlush();
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
  if (typeof window !== 'undefined') window.addEventListener('pagehide', onPageHide);

  return {
    log(kind, payload) {
      const id = newUlid();
      const { doc_id, thread_id } = opts.getContext();
      const event = {
        event_id: id,
        client_ts: now().toISOString(),
        focus_pane: opts.getFocusPane(),
        doc_id,
        thread_id,
        kind,
        payload,
      } as ClientEvent;
      queue.push(event);
      if (!stopped && !inflight && failures === 0) {
        if (queue.length >= maxBatch) void send();
        else schedule(batchMs);
      }
      return id;
    },
    pending: () => queue.length,
    flush() {
      if (stopped || queue.length === 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        waiters.push(resolve);
        flushRequested = true;
        if (!inflight && failures === 0) void send();
      });
    },
    onError(cb) {
      errorCbs.add(cb);
      return () => errorCbs.delete(cb);
    },
    stop() {
      stopped = true;
      clearTimer();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
      if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide);
      resolveWaiters();
    },
  };
}
