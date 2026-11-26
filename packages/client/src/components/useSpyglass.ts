/**
 * The Spyglass callout's logic (docs/spyglass.md, Part 5): Show (scrolls to the flag's first
 * block in the open document), logged as `spyglass_action`. Restore, Undo, Keep, Remove one and
 * Apply to the other copies write to the doc and come later.
 */
import { useCallback } from 'react';
import type { KeyDecision, SpyglassResult } from '@edw/shared';
import type { EventLogger } from '../events/logger';

/** The flag's first block on screen, if the open document has one of them. */
export function blockOnScreen(flag: KeyDecision): Element | null {
  for (const id of flag.block_ids) {
    const el = document.querySelector(`.doc-panel [data-block-id="${id}"]`);
    if (el) return el;
  }
  return null;
}

export function useSpyglass({ turnId, result, logger }: { turnId: string; result: SpyglassResult; logger: Pick<EventLogger, 'log'> }) {
  const show = useCallback(
    (index: number) => {
      const f = result.flags[index]!;
      blockOnScreen(f)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      logger.log('spyglass_action', { turn_id: turnId, flag: index, label: f.label, block_ids: f.block_ids, action: 'show' });
    },
    [logger, result, turnId],
  );
  return { flags: result.flags, others: result.others, show };
}
