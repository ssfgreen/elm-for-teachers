/** Chat input keystroke batching: text diffs collected for `ms` and logged as one `keystroke_batch`. */
import type { EventLogger } from '../events/logger';

export interface TextStep {
  from: number;
  to: number;
  text: string;
}

/** Minimal single-range diff from `prev` to `next`. Null when they are equal. */
export function textDiff(prev: string, next: string): TextStep | null {
  if (prev === next) return null;
  let p = 0;
  const max = Math.min(prev.length, next.length);
  while (p < max && prev[p] === next[p]) p++;
  let s = 0;
  while (s < max - p && prev[prev.length - 1 - s] === next[next.length - 1 - s]) s++;
  return { from: p, to: prev.length - s, text: next.slice(p, next.length - s) };
}

export interface ChatBatcher {
  change(prev: string, next: string): void;
  flush(): void;
  cancel(): void;
}

export function createChatBatcher(
  logger: Pick<EventLogger, 'log'>,
  ms = 500,
  now: () => Date = () => new Date(),
): ChatBatcher {
  let steps: TextStep[] = [];
  let chars = 0;
  let start: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (steps.length === 0) return;
    logger.log('keystroke_batch', {
      target: { kind: 'chat' },
      steps,
      char_count: chars,
      batch_start_ts: start ?? now().toISOString(),
      batch_end_ts: now().toISOString(),
    });
    steps = [];
    chars = 0;
    start = null;
  };

  return {
    change(prev, next) {
      const step = textDiff(prev, next);
      if (!step) return;
      if (steps.length === 0) start = now().toISOString();
      steps.push(step);
      chars += step.text.length;
      if (timer === null) timer = setTimeout(flush, ms);
    },
    flush,
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      steps = [];
      chars = 0;
      start = null;
    },
  };
}
