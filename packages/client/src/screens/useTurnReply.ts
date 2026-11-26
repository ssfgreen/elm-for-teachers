/**
 * A turn's reply, from the chat or an @model comment, taken into the workspace: its changes into
 * the snapshot (keeping only typing the server had not seen, see useCanvasWrites), the comments
 * it left on the open doc, the comments column opened for its suggestions, and a doc it created.
 */
import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { CanvasChanges, ChatReply } from '../api/types';
import type { TurnInfo } from '../components/ChatPane';
import type { CanvasSnapshot } from '../editor/types';
import type { EventContext } from '../events/logger';
import { mergeChanges } from '../state/canvasState';
import type { Comment } from '@edw/shared';

export interface TurnReplyDeps {
  setSnap: Dispatch<SetStateAction<CanvasSnapshot | null>>;
  keepNewerTyping: (changes: CanvasChanges, sentAt: number, serverWins?: ReadonlySet<string>) => CanvasChanges;
  addComments: (added: Comment[]) => void;
  revealComments: () => void;
  openDoc: (threadId: string, docId: string) => void;
  openRef: { current: { threadId: string; docId: string } | null };
  context: { current: EventContext };
}

export function useTurnReply({ setSnap, keepNewerTyping, addComments, revealComments, openDoc, openRef, context }: TurnReplyDeps) {
  return useCallback(
    (reply: Extract<ChatReply, { ok: true }>, turn?: Partial<TurnInfo>) => {
      // The server had the teacher's typing up to the mark when the turn was sent (in Editing mode
      // the model may rewrite such a block at once): only typing since then is kept over the reply.
      // Blocks the teacher typed in during an Editing-mode turn come back merged: the server's text has both.
      const merged = new Set((reply.typed_during ?? []).filter((id) => !reply.proposed_block_ids.includes(id)));
      setSnap((s) => (s ? mergeChanges(s, keepNewerTyping(reply.changes, turn?.typingMark ?? -1, merged)) : s));
      // Comments the model left (on the open doc): shown, with the column open to see them.
      const added = (reply.comments ?? []).filter((c) => c.doc_id === openRef.current?.docId);
      addComments(added);
      // Suggestions, and a suggested font or page colour, are decided on in the column too.
      const docId = openRef.current?.docId;
      const suggested = reply.changes.blocks.some((b) => b.doc_id === docId && (b.status === 'proposed' || b.pending));
      if (added.length || suggested || reply.changes.docs.some((d) => d.id === docId && d.proposed_style)) revealComments();
      // The teacher asked for a new document: show it, if they are still in the chat that asked.
      const threadId = turn?.threadId ?? context.current.thread_id;
      const created = reply.created_doc_ids[0];
      if (created && threadId && threadId === openRef.current?.threadId) openDoc(threadId, created);
    },
    [setSnap, context, openDoc, keepNewerTyping, revealComments, addComments, openRef],
  );
}
