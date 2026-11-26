import { useEffect, useState } from 'react';
import type { ChatUsage } from '@edw/shared';

/**
 * The chat's tokens and cost, fetched when the chat opens and again each time a turn ends
 * (`sending` goes false). A failed fetch, or an answer that is not usage, keeps the last figures:
 * the counter is not worth an error.
 */
export function useChatUsage(get: ((threadId: string) => Promise<ChatUsage>) | undefined, threadId: string, sending: boolean): ChatUsage | null {
  const [usage, setUsage] = useState<ChatUsage | null>(null);
  useEffect(() => {
    if (!get || sending) return;
    let cancelled = false;
    get(threadId)
      .then((u) => {
        if (!cancelled && isUsage(u)) setUsage(u);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [get, threadId, sending]);
  return usage;
}

const count = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

function isUsage(u: unknown): u is ChatUsage {
  if (!u || typeof u !== 'object') return false;
  const x = u as Record<string, unknown>;
  return count(x.input_tokens) && count(x.output_tokens) && count(x.gbp);
}
