/**
 * Keystroke batching (dev spec §7, PLAN.md Stage E telemetry). Every editor
 * transaction that changes a block's content becomes one timestamped edit: a
 * CoAuthor-style delta over the block's markdown (`retain`/`insert`/`delete`, see
 * shared text.ts). Edits are accumulated per block and flushed as one
 * `keystroke_batch` at most every `batchMs`, carrying the block's content after
 * the batch, which the server records as the revision and which replaying the
 * edits must reproduce. A batch typed inside a suggestion that stays says so
 * (`in_suggestion`, and `live_after` for a suggested edit).
 */
import type { Node } from "@tiptap/pm/model";
import { diffText, textOpCounts, type BlockContent, type TextEdit } from "@edw/shared";
import type { EventLogger } from "../events/logger.js";
import { nodeToContent } from "./markdown.js";
import type { InSuggestion } from "./types.js";

export interface BatcherOptions {
  logger: Pick<EventLogger, "log">;
  batchMs: number;
  onFlush: (blockId: string, content: BlockContent, inSuggestion?: InSuggestion) => void;
  now?: () => Date;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}

interface Batch {
  blockId: string;
  edits: TextEdit[];
  chars: number;
  start: string;
  end: string;
  node: Node;
}

export interface Batcher {
  /** The block changed from `before` to what `node` now holds. */
  record(blockId: string, before: BlockContent, node: Node): void;
  flush(): void;
  /** Block ids with unflushed edits. */
  dirty(): ReadonlySet<string>;
  stop(): void;
}

/**
 * Whether a block's node still holds one of the assistant's suggestions after the teacher's edit
 * (extensions/blockAttrs.ts keeps it, as Word does), and for a suggested edit its live text.
 */
export function inSuggestionOf(node: Node): InSuggestion | null {
  const pending = node.attrs.pending as { op: string } | null;
  if (node.attrs.status === "proposed" || pending?.op === "move") return {};
  if (pending?.op === "replace" && typeof node.attrs.original === "string") return { live: { content: node.attrs.original } };
  return null;
}

/** The edit that takes `before` to `after`, or null when nothing changed. */
export function editBetween(before: BlockContent, after: BlockContent, t: number): TextEdit | null {
  const ops = diffText(before.content, after.content);
  return ops.length ? { t, ops } : null;
}

export function createBatcher(opts: BatcherOptions): Batcher {
  const now = opts.now ?? (() => new Date());
  const setT = opts.setTimer ?? setTimeout;
  const clearT = opts.clearTimer ?? clearTimeout;
  let current: Batch | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const dirtySet = new Set<string>();

  function flush(): void {
    if (timer) {
      clearT(timer);
      timer = null;
    }
    const b = current;
    current = null;
    if (!b) return;
    const content = nodeToContent(b.node);
    const kept = inSuggestionOf(b.node);
    opts.logger.log("keystroke_batch", {
      target: { kind: "block", block_id: b.blockId },
      edits: b.edits,
      char_count: b.chars,
      batch_start_ts: b.start,
      batch_end_ts: b.end,
      content_after: content,
      ...(kept ? { in_suggestion: true as const, ...(kept.live ? { live_after: kept.live } : {}) } : {}),
    });
    dirtySet.delete(b.blockId);
    if (kept) opts.onFlush(b.blockId, content, kept);
    else opts.onFlush(b.blockId, content);
  }

  return {
    record(blockId, before, node) {
      const d = now();
      const edit = editBetween(before, nodeToContent(node), d.getTime());
      if (!edit) return;
      if (current && current.blockId !== blockId) flush();
      const ts = d.toISOString();
      if (!current) {
        current = { blockId, edits: [], chars: 0, start: ts, end: ts, node };
        timer = setT(flush, opts.batchMs);
      }
      current.node = node;
      current.end = ts;
      current.edits.push(edit);
      current.chars += textOpCounts(edit.ops).inserted;
      dirtySet.add(blockId);
    },
    flush,
    dirty: () => dirtySet,
    stop() {
      if (timer) clearT(timer);
      timer = null;
      current = null;
      dirtySet.clear();
    },
  };
}
