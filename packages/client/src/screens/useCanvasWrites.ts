import { useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { BlockContent } from '@edw/shared';
import type { SessionApi } from '../api/participant';
import type { CanvasChanges, Envelope } from '../api/types';
import type { CanvasSnapshot, InSuggestion, StructuralCommand, StructuralResponse } from '../editor/types.js';
import { applyLocalEdit, mergeChanges } from '../state/canvasState';

export interface CanvasWritesDeps {
  api: Pick<SessionApi, 'structural'>;
  getEnvelope: () => Envelope;
  setSnap: Dispatch<SetStateAction<CanvasSnapshot | null>>;
}

/**
 * The teacher's writes to the canvas: structural commands, and typing shown at once. The
 * teacher's latest text per block is kept, numbered in the order it was typed: a server answer
 * to a command sent before that typing carries older text, and must not replace it
 * (`keepNewerTyping`). A turn's reply is checked against `typingMark` taken when it was sent;
 * -1 (keep all typing) only when there is no mark.
 */
export function useCanvasWrites({ api, getEnvelope, setSnap }: CanvasWritesDeps) {
  const localEdits = useRef(new Map<string, { content: string; seq: number }>());
  const editSeq = useRef(0);
  /** `serverWins`: blocks whose server text already holds the teacher's typing (merged into a turn's change). */
  const keepNewerTyping = useCallback((changes: CanvasChanges, sentAt: number, serverWins?: ReadonlySet<string>): CanvasChanges => {
    const blocks = changes.blocks.map((b) => {
      const local = localEdits.current.get(b.id);
      return local && local.seq > sentAt && b.status === 'live' && !b.pending && !serverWins?.has(b.id) ? { ...b, content: local.content } : b;
    });
    return { ...changes, blocks };
  }, []);

  const structural = useCallback(
    async (cmd: StructuralCommand): Promise<StructuralResponse> => {
      const sentAt = editSeq.current;
      const res = await api.structural(cmd, getEnvelope());
      setSnap((s) => (s ? mergeChanges(s, keepNewerTyping(res.changes, sentAt)) : s));
      return res;
    },
    [api, getEnvelope, keepNewerTyping, setSnap],
  );

  const onLocalEdit = useCallback(
    (blockId: string, content: BlockContent, inSuggestion?: InSuggestion) => {
      localEdits.current.set(blockId, { content: content.content, seq: (editSeq.current += 1) });
      setSnap((s) => (s ? applyLocalEdit(s, blockId, content, inSuggestion) : s));
    },
    [setSnap],
  );

  /** The server's canvas is taken as truth again (after a refused command). */
  const forgetTyping = useCallback(() => localEdits.current.clear(), []);

  /**
   * Where the typing has got to. Taken once the editor is flushed before a turn: the server has
   * every edit up to here, so the turn's reply wins over them, and only later typing is kept.
   */
  const typingMark = useCallback(() => editSeq.current, []);

  return { keepNewerTyping, structural, onLocalEdit, forgetTyping, typingMark };
}
