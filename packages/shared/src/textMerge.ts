/**
 * Three-way merge of a block's text, word by word: the teacher's edits (`base` to `mine`) and the
 * assistant's (`base` to `theirs`) both go in, as long as they touch different words. Used in
 * Editing mode when the teacher typed in a block while the assistant was changing it.
 */
import { diffWords } from "./wordDiff.js";

/** One change to `base`: the text from `start` to `end` becomes `text` (an insertion when start = end). */
interface Hunk {
  start: number;
  end: number;
  text: string;
}

function hunks(base: string, changed: string): Hunk[] {
  const out: Hunk[] = [];
  let pos = 0;
  let open: Hunk | null = null;
  for (const part of diffWords(base, changed)) {
    if (part.kind === "same") {
      if (open) out.push(open);
      open = null;
      pos += part.text.length;
    } else if (part.kind === "del") {
      open ??= { start: pos, end: pos, text: "" };
      pos += part.text.length;
      open.end = pos;
    } else {
      open ??= { start: pos, end: pos, text: "" };
      open.text += part.text;
    }
  }
  if (open) out.push(open);
  return out;
}

const same = (a: Hunk, b: Hunk) => a.start === b.start && a.end === b.end && a.text === b.text;

/** Two changes that cannot both go in: they start together, overlap, or one is inserted inside the other. */
function clash(a: Hunk, b: Hunk): boolean {
  if (a.start === b.start) return true;
  if (a.start === a.end) return b.start < a.start && a.start < b.end;
  if (b.start === b.end) return a.start < b.start && b.start < a.end;
  return Math.max(a.start, b.start) < Math.min(a.end, b.end);
}

/** `base` with both sides' changes, or null when they touch the same words. */
export function mergeText(base: string, mine: string, theirs: string): string | null {
  if (mine === base || mine === theirs) return theirs;
  if (theirs === base) return mine;
  const ours = hunks(base, mine);
  const others = hunks(base, theirs).filter((t) => !ours.some((m) => same(m, t)));
  for (const m of ours) for (const t of others) if (clash(m, t)) return null;
  let text = base;
  for (const h of [...ours, ...others].sort((a, b) => b.start - a.start)) text = text.slice(0, h.start) + h.text + text.slice(h.end);
  return text;
}
