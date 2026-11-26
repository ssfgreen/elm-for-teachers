/**
 * Editing mode, when the teacher typed in a block while the assistant worked on it (its text now
 * differs from when the turn began): the assistant's change is made on top of the teacher's typing
 * (merged word by word, shared/src/textMerge.ts). When both touched the same words, or the
 * assistant would delete the block, the teacher's text stays and the change waits beside it as a
 * suggestion (`hold`). Asked for on 9 Nov 2026: "I didn't touch your text", and both are kept.
 */
import { mergeText, type Block, type Operation } from '@edw/shared';

export interface TypedDuring {
  /** The operations to apply: replaces carry the merged text. The model's own are logged as written. */
  applied: Operation[];
  /** Blocks the teacher typed in during the turn that the turn changed. */
  typed: string[];
  /** Of those, the ones whose change stays a suggestion. */
  hold: string[];
}

export function carryTyping(operations: Operation[], atStart: readonly Block[], now: readonly Block[]): TypedDuring {
  const start = new Map(atStart.map((b) => [b.id, b]));
  const current = new Map(now.map((b) => [b.id, b]));
  const typed: string[] = [];
  const hold: string[] = [];
  const applied = operations.map((op): Operation => {
    if (op.op !== 'replace' && op.op !== 'delete') return op;
    const before = start.get(op.id);
    const b = current.get(op.id);
    if (!before || !b || b.status !== 'live' || b.pending || b.content === before.content) return op;
    if (!typed.includes(op.id)) typed.push(op.id);
    const merged = op.op === 'replace' ? mergeText(before.content, b.content, op.content) : null;
    if (op.op === 'replace' && merged !== null) return { ...op, content: merged };
    if (!hold.includes(op.id)) hold.push(op.id);
    return op;
  });
  return { applied, typed, hold };
}
