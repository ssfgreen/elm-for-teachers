import { z } from "zod";

/**
 * Plain-text deltas for keystroke-level replay (PLAN.md, Stage E telemetry), in the
 * shape CoAuthor (Lee et al., CHI 2022) uses: a list of `retain n`, `insert s`,
 * `delete n` applied left to right. Counts are Unicode code points, not UTF-16
 * units, so Python (`len(str)`) replays the same ops identically. A trailing
 * retain is never written.
 */
export const TextOp = z.union([
  z.object({ retain: z.number().int().positive() }).strict(),
  z.object({ insert: z.string().min(1) }).strict(),
  z.object({ delete: z.number().int().positive() }).strict(),
]);
export type TextOp = z.infer<typeof TextOp>;
export const TextOps = z.array(TextOp);

const points = (s: string): string[] => Array.from(s);

/** Smallest single-hunk delta from `before` to `after` (common prefix and suffix kept). */
export function diffText(before: string, after: string): TextOp[] {
  if (before === after) return [];
  const a = points(before);
  const b = points(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const ops: TextOp[] = [];
  if (start > 0) ops.push({ retain: start });
  if (endA > start) ops.push({ delete: endA - start });
  if (endB > start) ops.push({ insert: b.slice(start, endB).join("") });
  return ops;
}

export class TextOpError extends Error {}

/** Apply a delta. Throws when it reaches past the end of the text. */
export function applyText(text: string, ops: readonly TextOp[]): string {
  const src = points(text);
  const out: string[] = [];
  let i = 0;
  for (const op of ops) {
    if ("retain" in op) {
      if (i + op.retain > src.length) throw new TextOpError(`retain ${op.retain} past end at ${i} of ${src.length}`);
      out.push(...src.slice(i, i + op.retain));
      i += op.retain;
    } else if ("delete" in op) {
      if (i + op.delete > src.length) throw new TextOpError(`delete ${op.delete} past end at ${i} of ${src.length}`);
      i += op.delete;
    } else {
      out.push(op.insert);
    }
  }
  out.push(...src.slice(i));
  return out.join("");
}

/** Code points inserted and deleted by a delta. */
export function textOpCounts(ops: readonly TextOp[]): { inserted: number; deleted: number } {
  let inserted = 0;
  let deleted = 0;
  for (const op of ops) {
    if ("insert" in op) inserted += points(op.insert).length;
    else if ("delete" in op) deleted += op.delete;
  }
  return { inserted, deleted };
}

/** CoAuthor-style event name for a delta. */
export function textEventName(ops: readonly TextOp[]): "text-insert" | "text-delete" | "text-replace" | "text-none" {
  const { inserted, deleted } = textOpCounts(ops);
  if (inserted && deleted) return "text-replace";
  if (inserted) return "text-insert";
  if (deleted) return "text-delete";
  return "text-none";
}
