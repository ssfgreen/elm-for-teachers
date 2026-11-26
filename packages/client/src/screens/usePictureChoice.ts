import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { SessionApi } from '../api/participant';
import type { CanvasChanges, Envelope } from '../api/types';
import type { TurnPictureOffer } from '../components/PictureChoices';
import type { CanvasSnapshot, Decision } from '../editor/types.js';
import { mergeChanges } from '../state/canvasState';

export interface PictureChoiceDeps {
  api: Pick<SessionApi, 'choosePicture'>;
  getEnvelope: () => Envelope;
  snap: CanvasSnapshot | null;
  setSnap: Dispatch<SetStateAction<CanvasSnapshot | null>>;
  keepNewerTyping: (changes: CanvasChanges, sentAt: number) => CanvasChanges;
  /** Accept or reject a suggestion (useDecisions). */
  onDecision: (d: Decision) => void;
}

/** Whether an image block is still the assistant's suggestion (new, or a change not yet decided). */
export const awaitsDecision = (snap: CanvasSnapshot | null, blockId: string): boolean => {
  const b = snap?.blocks.find((x) => x.id === blockId);
  return !!b && (b.status === 'proposed' || (b.status === 'live' && b.pending?.op === 'replace'));
};

/**
 * The picture row's two ends (ChatPane `pictures`): which offers are open, and swapping one in.
 * Choosing the picture already in the block keeps it: an ordinary Accept, with nothing fetched.
 */
export function usePictureChoice({ api, getEnvelope, snap, setSnap, keepNewerTyping, onDecision }: PictureChoiceDeps) {
  const isOpen = useCallback((blockId: string) => awaitsDecision(snap, blockId), [snap]);
  const choose = useCallback(
    async (offer: TurnPictureOffer, picture: number) => {
      if (picture === offer.chosen) {
        const block = snap?.blocks.find((b) => b.id === offer.block_id);
        onDecision({ decision: 'accept', block_id: offer.block_id, doc_id: block?.doc_id ?? null, mode: 'click' });
        return;
      }
      if (!api.choosePicture) throw new Error('pictures cannot be chosen here');
      const res = await api.choosePicture(offer.turn_id, offer.block_id, picture, getEnvelope());
      setSnap((s) => (s ? mergeChanges(s, keepNewerTyping(res.changes, -1)) : s));
    },
    [api, getEnvelope, snap, setSnap, keepNewerTyping, onDecision],
  );
  return api.choosePicture ? { isOpen, choose } : undefined;
}
