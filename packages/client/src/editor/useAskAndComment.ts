/**
 * Asking the model and commenting from the canvas: the inline @model prompt opened from the
 * "@" menu, and the selection toolbar's ask and comment buttons. Each waits for the block to
 * reach the server before it goes out.
 */
import { useCallback, useState, type MutableRefObject, type RefObject } from "react";
import type { Editor } from "@tiptap/core";
import type { CommentAnchor } from "@edw/shared";
import type { CanvasProps } from "./types.js";
import type { Machine } from "./useSyncMachine.js";

/** The longest quote the server takes with an anchor (CommentAnchor in @edw/shared). */
const QUOTE_MAX = 2000;

interface AskAndCommentArgs {
  editor: Editor | null;
  frameRef: RefObject<HTMLDivElement>;
  machineRef: MutableRefObject<Machine | null>;
  propsRef: MutableRefObject<CanvasProps>;
  /** Owned by the canvas: the editor's extensions call it before this hook runs. */
  openAskRef: MutableRefObject<() => void>;
}

export function useAskAndComment({ editor, frameRef, machineRef, propsRef, openAskRef }: AskAndCommentArgs) {
  /** The inline @model prompt: where it sits and which block it is about. */
  const [ask, setAsk] = useState<{ top: number; left: number; blockId: string } | null>(null);

  // Opened by the "@" menu once the "@model" text is removed: sits just under the cursor.
  openAskRef.current = () => {
    const frame = frameRef.current;
    if (!editor || !frame) return;
    const { $from, from } = editor.state.selection;
    const id = $from.depth >= 1 ? ($from.node(1).attrs.id as string | null) : null;
    if (!id) return;
    const caret = editor.view.coordsAtPos(from);
    const box = frame.getBoundingClientRect();
    setAsk({ top: caret.bottom - box.top + 6, left: Math.max(8, caret.left - box.left), blockId: id });
  };

  const closeAsk = useCallback(() => {
    setAsk(null);
    editor?.commands.focus();
  }, [editor]);

  const submitAsk = useCallback(
    (text: string) => {
      const target = ask;
      closeAsk();
      const m = machineRef.current;
      if (!target || !m) return;
      // The block may still be on its way to the server (just typed): send once it is there.
      void m.queue.whenIdle().then(() => propsRef.current.onSendComment?.({ block_id: target.blockId, from: null, to: null, quote: null }, text));
    },
    [ask, closeAsk, machineRef, propsRef],
  );

  /** The selection as an anchor: its block and the text selected in it (up to the block's end). */
  const selectionAnchor = useCallback((): CommentAnchor | null => {
    if (!editor) return null;
    const { $from, from, to } = editor.state.selection;
    if ($from.depth < 1) return null;
    const id = $from.node(1).attrs.id as string | null;
    if (!id) return null;
    const start = $from.start(1);
    const end = Math.min(to, $from.end(1));
    // Line breaks stay line breaks; a long passage is cut to what the server takes (the range still says where it is).
    const text = editor.state.doc.textBetween(from, end, "\n", "\n").trim();
    const quote = text.length > QUOTE_MAX ? `${text.slice(0, QUOTE_MAX - 1)}…` : text;
    return { block_id: id, from: from - start, to: end - start, quote: quote || null };
  }, [editor]);

  const askModel = useCallback(() => {
    const a = selectionAnchor();
    const m = machineRef.current;
    if (!a || !m) return;
    // As for a comment: the block may still be on its way to the server.
    void m.queue.whenIdle().then(() => propsRef.current.onAskModel?.(a));
  }, [selectionAnchor, machineRef, propsRef]);

  const commentOnSelection = useCallback(() => {
    const a = selectionAnchor();
    const m = machineRef.current;
    if (!a || !m) return;
    // The block may still be on its way to the server (just typed): start the thread once it is there.
    void m.queue.whenIdle().then(() => propsRef.current.onComment?.(a));
  }, [selectionAnchor, machineRef, propsRef]);

  return { ask, closeAsk, submitAsk, askModel, commentOnSelection };
}
