/** `pointer`: the pointer's position, sampled while it moves and sent a few seconds at a time. */
import type { PayloadOfKind } from '@edw/shared';
import type { EventLogger } from '../logger';
import { pointTarget } from './target';

type Sample = PayloadOfKind<'pointer'>['samples'][number];

export interface PointerOptions {
  /** At most one sample this often. */
  intervalMs?: number;
  /** Samples are sent this long after the first one waiting, or sooner when there are `maxSamples`. */
  sendMs?: number;
  maxSamples?: number;
  now?: () => number;
}

export function attachPointerSampling(logger: Pick<EventLogger, 'log'>, doc: Document, opts: PointerOptions = {}): () => void {
  const { intervalMs = 100, sendMs = 2000, maxSamples = 100, now = () => Date.now() } = opts;
  let samples: Sample[] = [];
  let last = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const send = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (samples.length === 0) return;
    logger.log('pointer', { interval_ms: intervalMs, samples });
    samples = [];
  };
  const onMove = (e: PointerEvent) => {
    const t = now();
    if (t - last < intervalMs) return;
    last = t;
    samples.push({ t, x: Math.round(e.clientX), y: Math.round(e.clientY), ...pointTarget(e.target) });
    if (samples.length >= maxSamples) send();
    else timer ??= setTimeout(send, sendMs);
  };
  doc.addEventListener('pointermove', onMove, { passive: true, capture: true });
  return () => {
    doc.removeEventListener('pointermove', onMove, { capture: true });
    send();
  };
}
