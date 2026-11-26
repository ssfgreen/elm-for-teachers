import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { CanvasSnapshot, Decision } from '../editor/types.js';
import type { EventContext, EventLogger } from '../events/logger';
import { applyDecision } from '../state/canvasState';

export interface DecisionsDeps {
  setSnap: Dispatch<SetStateAction<CanvasSnapshot | null>>;
  logger: EventLogger;
  context: { current: EventContext };
}

/**
 * The teacher's decisions on the assistant's suggestions: applied to the snapshot at once and
 * logged; the server applies the same decision from the logged event.
 */
export function useDecisions({ setSnap, logger, context }: DecisionsDeps) {
  return useCallback(
    (d: Decision) => {
      // A click on one block names no doc; the block's own doc is the open one.
      const decision = { ...d, doc_id: d.doc_id ?? context.current.doc_id };
      setSnap((s) => (s ? applyDecision(s, decision) : s));
      logger.log(decision.decision === 'accept' ? 'proposal_accept' : 'proposal_reject', {
        block_id: decision.block_id,
        doc_id: decision.doc_id,
        mode: decision.mode,
        ...(decision.part ? { part: decision.part } : {}),
      });
    },
    [context, logger, setSnap],
  );
}
