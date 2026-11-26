import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Decision, PublicBlock } from '../editor/types.js';
import { isPicked, type SuggestionPick } from '../components/comments/SuggestionCard.js';
import { SUGGESTION_SELECT, type SuggestionSelectEvent } from '../editor/extensions/trackChanges.js';
import { suggestionsIn } from '../editor/suggest/suggestions.js';
import { partDecision } from '../editor/suggest/decide.js';
import { scrollToMiddle } from './scrollToMiddle';

export interface SuggestionsDeps {
  blocks: PublicBlock[];
  docId: string | null;
  /** Applies a decision and logs it (WorkspaceScreen's onDecision). */
  onDecision: (d: Decision) => void;
  /** Opens the comments column where it sits beside the document (not as a drawer over it). */
  reveal: () => void;
  /** The document's pane: a click on a suggestion in its text selects the suggestion's card. */
  paneRef: RefObject<HTMLElement | null>;
  /** A suggestion was picked (its card or its text): the selected comment thread lets go, so one card stands out. */
  onPick?: () => void;
}

/** The open doc's suggestions as cards in the comments column, the selected one, and deciding one. */
export function useSuggestions({ blocks, docId, onDecision, reveal, paneRef, onPick }: SuggestionsDeps) {
  const items = useMemo(() => (docId ? suggestionsIn(blocks, docId) : []), [blocks, docId]);
  const [picked, setPicked] = useState<SuggestionPick>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  // A suggestion decided, or typed into, is no longer selected.
  const active = picked && items.some((s) => isPicked(s, picked)) ? picked : null;

  /** A card clicked: its change (or block) comes to about the middle of the document. */
  const select = useCallback((blockId: string, part: number | null = null) => {
    setPicked({ block_id: blockId, part });
    onPickRef.current?.();
    const block = document.querySelector(`.doc-panel [data-block-id="${blockId}"]`);
    const change = part === null ? null : block?.querySelector(`[data-suggest-part="${part}"]`);
    scrollToMiddle(change ?? block);
  }, []);

  /** One card's Accept or Reject: one change inside a suggested edit (`part`), or the whole block. */
  const decide = useCallback(
    (blockId: string, accept: boolean, part: number | null = null) => {
      const block = part === null ? undefined : blocks.find((b) => b.id === blockId);
      const decided = block && part !== null ? partDecision(block, part, accept) : null;
      onDecision({ decision: accept ? 'accept' : 'reject', block_id: blockId, doc_id: docId, mode: 'click', ...(decided ? { part: decided } : {}) });
    },
    [onDecision, docId, blocks],
  );

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    // A click in the text: its card is picked out and brought into view in the column.
    const onPick = (e: Event) => {
      const { block_id, part = null } = (e as SuggestionSelectEvent).detail;
      setPicked({ block_id, part });
      onPickRef.current?.();
      reveal();
      requestAnimationFrame(() => {
        const sel = `.comments-panel [data-for-block="${block_id}"]${part === null ? '' : `[data-part="${part}"]`}`;
        document.querySelector(sel)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      });
    };
    pane.addEventListener(SUGGESTION_SELECT, onPick);
    return () => pane.removeEventListener(SUGGESTION_SELECT, onPick);
  }, [paneRef, reveal]);

  /** A comment thread was selected instead. */
  const clear = useCallback(() => setPicked(null), []);

  return { items, active, select, decide, clear };
}
