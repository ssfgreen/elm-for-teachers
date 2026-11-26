/**
 * Live edits: the assistant's changes show in the document as it writes them. ChatPane hands up
 * the raw reply while it streams (`setDraft`); `preview` is the snapshot with its edits so far, or
 * null when there are none. Display only: nothing here is saved.
 *
 * The edits go where the server will put them: the chat and doc the turn was sent from. Only that
 * doc shows them (and is locked while they arrive); another doc opened meanwhile stays as it is.
 */
import { useMemo, useState } from 'react';
import type { TurnDraft } from '../components/ChatPane';
import type { CanvasSnapshot } from '../editor/types';
import { previewReply } from '../state/preview';

export function useTurnPreview(snap: CanvasSnapshot | null, open: { threadId: string; docId: string } | null) {
  /** The model's raw reply while it streams, and where it was sent from. */
  const [draft, setDraft] = useState<TurnDraft | null>(null);
  const preview = useMemo(
    () => (draft?.raw && snap && open?.docId === draft.docId ? previewReply(snap, draft.raw, draft.threadId, draft.docId) : null),
    [draft, snap, open],
  );
  return { preview, setDraft };
}
