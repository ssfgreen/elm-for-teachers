/**
 * The canvas's sync machine: everything that lives for one editor instance and carries the
 * teacher's edits to the server (see Canvas.tsx and docs/client-state.md).
 *
 * After each transaction the top-level blocks are diffed against the last snapshot (sync.ts):
 * structural commands go to the server through a queue, content edits go out as keystroke
 * batches (batcher.ts). Blocks coming back from the server are reconciled into the document
 * once no command is in flight.
 */
import { useCallback, useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import { createGatedLogger, type GatedLogger } from "../events/gatedLogger.js";
import { attachClipboardMarker, createThrottle, type ClipboardMarker, type Throttled } from "../events/trackers.js";
import { createBatcher, type Batcher } from "./batcher.js";
import { META_EXTERNAL } from "./blockTypes.js";
import { isPlain, reconcileDoc, topNodesById } from "./reconcile.js";
import { createStructuralQueue, diffBlocks, snapshotDoc, type BlockSnap, type StructuralQueue } from "./sync.js";
import type { CanvasProps, StructuralCommand } from "./types.js";

const BATCH_MS = 500;
const SELECTION_THROTTLE_MS = 250;

/** Everything that lives for one editor instance. */
export interface Machine {
  batcher: Batcher;
  queue: StructuralQueue;
  prevSnap: BlockSnap[];
  logSelection: Throttled<{ block_id: string; from: number; to: number }>;
  marker: ClipboardMarker;
  /**
   * Blocks with a queued or in-flight command that carries their content (insert, split,
   * merge, retype), counted per command. Their keystroke events wait until the server has
   * applied the command; otherwise the command's older content would overwrite the newer
   * typing on the server.
   */
  gate: GatedLogger;
  /** Suggestions the teacher typed into: theirs now, even while the server still calls them proposals. */
  takenOver: Set<string>;
  /** Blocks this editor made (insert, split) that the screen's blocks do not have yet. */
  made: Set<string>;
  reconcilePending: boolean;
  stop(): void;
}

/** Blocks whose content a command carries. */
function contentIdsOf(cmd: StructuralCommand): string[] {
  switch (cmd.command) {
    case "insert":
      return cmd.id ? [cmd.id] : [];
    case "split":
      return cmd.second_id ? [cmd.block_id, cmd.second_id] : [cmd.block_id];
    case "merge":
      return [cmd.merged_into];
    case "retype":
      return [cmd.block_id];
    default:
      return [];
  }
}

/**
 * Feeds one editor transaction to the machine: commands to the queue, typing to the batcher,
 * the selection to the throttled logger. Called from the editor's onTransaction.
 */
export function syncTransaction(m: Machine, editor: Editor, transaction: Transaction, props: Pick<CanvasProps, "readOnly" | "docId">): void {
  const { state } = editor;
  if (transaction.docChanged) {
    if (transaction.getMeta(META_EXTERNAL)) {
      m.prevSnap = snapshotDoc(state.doc);
    } else if (!props.readOnly) {
      const now = topNodesById(state.doc);
      transaction.before.forEach((n) => {
        const id = n.attrs.id as string | null;
        if (id && !isPlain(n) && now.get(id) && isPlain(now.get(id)!)) m.takenOver.add(id);
      });
      const prevById = new Map(m.prevSnap.map((b) => [b.id, b.content]));
      const next = snapshotDoc(state.doc);
      const diff = diffBlocks(m.prevSnap, next, props.docId);
      m.prevSnap = next;
      if (diff.commands.length) {
        m.batcher.flush();
        for (const c of diff.commands) {
          m.gate.begin(contentIdsOf(c));
          if (c.command === "insert" && c.id) m.made.add(c.id);
          if (c.command === "split" && c.second_id) m.made.add(c.second_id);
        }
        m.queue.push(diff.commands);
      }
      if (diff.contentChanged.length) {
        const nodes = topNodesById(state.doc);
        // Each delta is taken against the last snapshot, so the logged chain never skips a state.
        for (const id of diff.contentChanged) m.batcher.record(id, prevById.get(id)!, nodes.get(id)!);
      }
    }
  }
  if (transaction.selectionSet || transaction.docChanged) {
    const { $from, $to } = state.selection;
    if ($from.depth >= 1) {
      const block = $from.node(1);
      const start = $from.start(1);
      if (block.attrs.id) m.logSelection({ block_id: block.attrs.id as string, from: $from.pos - start, to: $to.pos - start });
    }
  }
}

interface SyncMachineArgs {
  editor: Editor | null;
  /** Owned by the canvas: the editor's transaction and paste handlers read it before this hook runs. */
  machineRef: MutableRefObject<Machine | null>;
  propsRef: MutableRefObject<CanvasProps>;
  frameRef: RefObject<HTMLDivElement>;
  blocks: CanvasProps["blocks"];
  docId: string;
}

/**
 * Builds the machine for each editor, wires the screen's flushRef to it, and reconciles the
 * screen's blocks into the editor (deferred while a command is in flight).
 */
export function useSyncMachine({ editor, machineRef, propsRef, frameRef, blocks, docId }: SyncMachineArgs): void {
  const reconcileRef = useRef<(ed: Editor, m: Machine) => void>(() => undefined);

  /* ------------------------------------------------------------ machine */
  useEffect(() => {
    if (!editor) return;
    const root = frameRef.current;
    const logger = propsRef.current.logger;
    const m: Machine = {
      prevSnap: snapshotDoc(editor.state.doc),
      gate: createGatedLogger(logger),
      takenOver: new Set(),
      made: new Set(),
      reconcilePending: false,
      marker: attachClipboardMarker(root ?? editor.view.dom),
      logSelection: createThrottle(SELECTION_THROTTLE_MS, (p) => propsRef.current.logger.log("selection", p)),
      batcher: null as unknown as Batcher,
      queue: null as unknown as StructuralQueue,
      stop: () => undefined,
    };
    // Events for a block with a content-carrying command in flight wait until the server has applied it.
    m.batcher = createBatcher({ logger: m.gate, batchMs: BATCH_MS, onFlush: (...edit) => propsRef.current.onLocalEdit(...edit) });
    m.queue = createStructuralQueue({
      send: async (cmd) => {
        await propsRef.current.structural(cmd);
        m.gate.end(contentIdsOf(cmd));
      },
      beforeSend: async () => {
        m.batcher.flush();
        await propsRef.current.logger.flush();
      },
      onReject: (err, cmd) => {
        console.error("canvas command refused", cmd, err);
        m.gate.reset();
        propsRef.current.onSyncError?.(err, cmd);
      },
      onIdle: () => {
        if (m.reconcilePending) {
          m.reconcilePending = false;
          reconcileRef.current(editor, m);
        }
      },
    });
    m.stop = () => {
      m.batcher.flush();
      m.batcher.stop();
      m.logSelection.flush();
      m.marker.detach();
      // The queue is left to drain: switching docs must not drop commands typed into the last one.
    };
    machineRef.current = m;
    const flushRef = propsRef.current.flushRef;
    if (flushRef)
      flushRef.current = async () => {
        m.batcher.flush();
        await m.queue.whenIdle();
        await propsRef.current.logger.flush();
      };
    propsRef.current.onEditorReady?.(editor);
    return () => {
      m.stop();
      if (machineRef.current === m) machineRef.current = null;
    };
  }, [editor, frameRef, machineRef, propsRef]);

  /* ---------------------------------------------------------- reconcile */
  const reconcile = useCallback(
    (ed: Editor, m: Machine) => {
      const { blocks, docId } = propsRef.current;
      // Waiting for the screen to have the editor's own new blocks: the next blocks it gets try again.
      if (!reconcileDoc(ed, { blocks, docId, dirty: m.batcher.dirty(), takenOver: m.takenOver, made: m.made })) m.reconcilePending = true;
    },
    [propsRef],
  );
  reconcileRef.current = reconcile;

  useEffect(() => {
    const m = machineRef.current;
    if (!editor || !m) return;
    if (!m.queue.idle()) {
      m.reconcilePending = true;
      return;
    }
    reconcile(editor, m);
  }, [editor, blocks, docId, reconcile, machineRef]);
}
