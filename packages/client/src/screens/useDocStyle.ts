import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Doc, DocStyle } from '@edw/shared';
import type { CanvasSnapshot, StructuralCommand, StructuralResponse } from '../editor/types.js';

/** A doc with its font and page colour set (both unset: no style). */
export const withStyle = (d: Doc, style: DocStyle): Doc => {
  const { style: _old, ...rest } = d;
  void _old;
  return style.font || style.background ? { ...rest, style } : rest;
};

export interface DocStyleDeps {
  open: { threadId: string; docId: string } | null;
  setSnap: Dispatch<SetStateAction<CanvasSnapshot | null>>;
  structural: (cmd: StructuralCommand) => Promise<StructuralResponse>;
  onSyncError: (err: unknown) => void;
}

/** The doc as it is once the teacher decides on its suggested style (an accept sets what it names). */
export function decidedStyle(d: Doc, accept: boolean): Doc {
  const { proposed_style: proposed, ...rest } = d;
  return accept && proposed ? withStyle(rest, { ...d.style, ...proposed.style }) : rest;
}

/**
 * The open doc's font and page colour: `setDocStyle` from the toolbar, and `decideStyle` on the
 * assistant's suggestion. Each is shown at once, then saved.
 */
export function useDocStyle({ open, setSnap, structural, onSyncError }: DocStyleDeps) {
  const setDocStyle = useCallback(
    (style: DocStyle) => {
      if (!open) return;
      const docId = open.docId;
      setSnap((s) => (s ? { ...s, docs: s.docs.map((d) => (d.id === docId ? withStyle(d, style) : d)) } : s));
      void structural({ command: 'doc_style', doc_id: docId, style }).catch((err: unknown) => onSyncError(err));
    },
    [open, setSnap, structural, onSyncError],
  );
  const decideStyle = useCallback(
    async (accept: boolean) => {
      if (!open) return;
      const docId = open.docId;
      setSnap((s) => (s ? { ...s, docs: s.docs.map((d) => (d.id === docId ? decidedStyle(d, accept) : d)) } : s));
      await structural({ command: 'doc_style_decision', doc_id: docId, accept }).catch((err: unknown) => onSyncError(err));
    },
    [open, setSnap, structural, onSyncError],
  );
  return { setDocStyle, decideStyle };
}
