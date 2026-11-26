/**
 * Local-first structural sync (PLAN.md, "Canvas write path, local-first").
 *
 * The editor edits freely. After each transaction the top-level blocks are
 * compared with the previous snapshot and turned into the server's structural
 * commands, which a sequential queue posts in the background. Content changes
 * on blocks that survive are not commands: they go out as keystroke batches.
 *
 * Command order matters because every `after` must name a block the server
 * already has: merges and deletes first, then one pass over the new order that
 * inserts (or splits) new blocks and moves displaced ones right after their new
 * predecessor, then retypes. Processing the new order left to right makes each
 * predecessor either an unmoved block or one already placed, so the server ends
 * in exactly the editor's order.
 */
import type { Node } from "@tiptap/pm/model";
import type { BlockContent, BlockType } from "@edw/shared";
import { blockTypeOf, nodeToContent } from "./markdown.js";
import type { StructuralCommand } from "./types.js";

export interface BlockSnap {
  id: string;
  type: BlockType;
  content: BlockContent;
}

export interface Diff {
  commands: StructuralCommand[];
  /** Surviving blocks whose content changed and is not already carried by a command. */
  contentChanged: string[];
}

const sameContent = (a: BlockContent, b: BlockContent) => a.content === b.content;

/** Snapshot the top-level blocks of a document. Nodes without an id (not yet named) are skipped. */
export function snapshotDoc(doc: Node): BlockSnap[] {
  const out: BlockSnap[] = [];
  doc.forEach((node) => {
    const id = node.attrs.id as string | null;
    if (!id) return;
    out.push({ id, type: blockTypeOf(node), content: nodeToContent(node) });
  });
  return out;
}

/** Longest common subsequence of two id lists, as a set of ids that keep their relative order. */
function lcs(a: string[], b: string[]): Set<string> {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const keep = new Set<string>();
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      keep.add(a[i]!);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else j++;
  }
  return keep;
}

export function diffBlocks(prev: BlockSnap[], next: BlockSnap[], docId: string): Diff {
  const prevById = new Map(prev.map((b) => [b.id, b]));
  const nextById = new Map(next.map((b) => [b.id, b]));
  const commands: StructuralCommand[] = [];
  const handled = new Set<string>();

  // 1. Blocks that disappeared: merged into the nearest surviving predecessor whose
  //    content changed (Backspace at a boundary, or a selection deleted across blocks),
  //    otherwise deleted. Only the first absorbed block per target is a merge.
  const mergedInto = new Set<string>();
  prev.forEach((b, i) => {
    if (nextById.has(b.id)) return;
    let target: BlockSnap | null = null;
    for (let k = i - 1; k >= 0; k--) {
      const cand = nextById.get(prev[k]!.id);
      if (cand) {
        target = cand;
        break;
      }
    }
    const prevTarget = target ? prevById.get(target.id)! : null;
    if (target && prevTarget && !sameContent(prevTarget.content, target.content) && !mergedInto.has(target.id)) {
      mergedInto.add(target.id);
      handled.add(target.id);
      commands.push({ command: "merge", block_id: b.id, merged_into: target.id, after: target.content });
    } else {
      commands.push({ command: "delete", block_id: b.id });
    }
  });

  // 2. One pass over the new order: new blocks are inserted (or split off their
  //    predecessor), displaced blocks are moved, each right after its new predecessor.
  const keptPrevOrder = prev.filter((b) => nextById.has(b.id)).map((b) => b.id);
  const keptNextOrder = next.filter((b) => prevById.has(b.id)).map((b) => b.id);
  const stable = lcs(keptPrevOrder, keptNextOrder);
  const splitFrom = new Set<string>();
  next.forEach((b, i) => {
    const after = i === 0 ? "start" : next[i - 1]!.id;
    const old = prevById.get(b.id);
    if (!old) {
      const pred = i > 0 ? next[i - 1]! : null;
      const predOld = pred ? prevById.get(pred.id) : undefined;
      const isSplit =
        pred !== null &&
        predOld !== undefined &&
        !sameContent(predOld.content, pred.content) &&
        !splitFrom.has(pred.id) &&
        !mergedInto.has(pred.id);
      if (isSplit) {
        splitFrom.add(pred.id);
        handled.add(pred.id);
        commands.push({ command: "split", block_id: pred.id, first: pred.content, second: b.content, second_type: b.type, second_id: b.id });
      } else {
        commands.push({ command: "insert", id: b.id, doc_id: docId, after, type: b.type, content: b.content.content });
      }
      return;
    }
    if (!stable.has(b.id)) commands.push({ command: "move", block_id: b.id, after });
  });

  // 3. Type changes carry the restructured content with them.
  const contentChanged: string[] = [];
  for (const b of next) {
    const old = prevById.get(b.id);
    if (!old) continue;
    if (old.type !== b.type) {
      handled.add(b.id);
      commands.push({ command: "retype", block_id: b.id, type: b.type, after: b.content });
    } else if (!sameContent(old.content, b.content) && !handled.has(b.id)) {
      contentChanged.push(b.id);
    }
  }
  return { commands, contentChanged };
}

/* ------------------------------------------------------------------ queue */

export interface QueueOptions {
  send: (cmd: StructuralCommand) => Promise<unknown>;
  /** Awaited before each command: flush keystroke batches so revisions stay in order. */
  beforeSend?: () => Promise<void>;
  /** A command was refused or failed. The queue is emptied; the caller reloads the canvas. */
  onReject: (err: unknown, cmd: StructuralCommand) => void;
  onIdle?: () => void;
}

export interface StructuralQueue {
  push(cmds: StructuralCommand[]): void;
  idle(): boolean;
  /** Resolves when the queue next drains (immediately if idle). */
  whenIdle(): Promise<void>;
  stop(): void;
}

export function createStructuralQueue(opts: QueueOptions): StructuralQueue {
  const pending: StructuralCommand[] = [];
  let running = false;
  let stopped = false;
  let waiters: Array<() => void> = [];

  const settle = () => {
    const w = waiters;
    waiters = [];
    w.forEach((r) => r());
    opts.onIdle?.();
  };

  async function run(): Promise<void> {
    if (running) return;
    running = true;
    try {
      while (pending.length && !stopped) {
        const cmd = pending[0]!;
        try {
          await opts.beforeSend?.();
          await opts.send(cmd);
          pending.shift();
        } catch (err) {
          pending.length = 0;
          opts.onReject(err, cmd);
        }
      }
    } finally {
      running = false;
      settle();
    }
  }

  return {
    push(cmds) {
      if (stopped || cmds.length === 0) return;
      pending.push(...cmds);
      void run();
    },
    idle: () => !running && pending.length === 0,
    whenIdle() {
      if (!running && pending.length === 0) return Promise.resolve();
      return new Promise((resolve) => waiters.push(resolve));
    },
    stop() {
      stopped = true;
      pending.length = 0;
    },
  };
}
