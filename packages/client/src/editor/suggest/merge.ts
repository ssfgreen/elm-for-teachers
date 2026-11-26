/**
 * A suggested change to a block, change by change, worked on two editor nodes: the block's own
 * (live) text and the assistant's suggested text. Pure (no view), so it is tested without an
 * editor. Positions are inside the node: 0 is the start of its content.
 *
 *  - `changesOf` lists the changes in reading order, each with where it sits in both texts (the
 *    same word diff the document and the cards show);
 *  - `acceptChange` gives the live text with one change taken in; `rejectChange` the suggested
 *    text with one change taken back;
 *  - `carryEdit` carries the teacher's edit of the suggested text over to the live text, as
 *    Word does with tracked changes: text typed straight after suggested words joins the
 *    suggestion (only the suggested text gets it); text typed anywhere else, and text deleted
 *    outside the suggested words, is the teacher's own and goes into both.
 */
import type { Mark, Node } from "@tiptap/pm/model";
import { Transform } from "@tiptap/pm/transform";
import { diffWords } from "@edw/shared";
import { flatText, type FlatText } from "./text.js";

export interface Change {
  index: number;
  ins: string;
  del: string;
  /** Where it is in the live text, and in the suggested text. */
  live: { from: number; to: number };
  suggested: { from: number; to: number };
}

/** Text as one string, positions inside the node. */
const flat = (n: Node) => flatText(n, -1);

/** Document positions of characters [a, b) of a flat text; an empty range is the gap before a. */
function range(t: FlatText, a: number, b: number): { from: number; to: number } {
  const from = a < t.text.length ? t.pos[a]! : t.end;
  return { from, to: b > a ? t.pos[b - 1]! + 1 : from };
}

export function changesOf(live: Node, suggested: Node): Change[] {
  const lt = flat(live);
  const st = flat(suggested);
  const out: Change[] = [];
  let li = 0;
  let si = 0;
  let cur: { ins: string; del: string; l: number; s: number } | null = null;
  const close = () => {
    if (!cur) return;
    out.push({ index: out.length, ins: cur.ins, del: cur.del, live: range(lt, cur.l, li), suggested: range(st, cur.s, si) });
    cur = null;
  };
  for (const p of diffWords(lt.text, st.text)) {
    if (p.kind === "same") {
      close();
      li += p.text.length;
      si += p.text.length;
      continue;
    }
    cur ??= { ins: "", del: "", l: li, s: si };
    if (p.kind === "ins") {
      cur.ins += p.text;
      si += p.text.length;
    } else {
      cur.del += p.text;
      li += p.text.length;
    }
  }
  close();
  return out;
}

/** The live text with change `index` taken in, or null if it cannot be applied. */
export function acceptChange(live: Node, suggested: Node, index: number): Node | null {
  const c = changesOf(live, suggested)[index];
  if (!c) return null;
  return replaced(live, c.live, suggested, c.suggested);
}

/** The suggested text with change `index` taken back, or null if it cannot be applied. */
export function rejectChange(live: Node, suggested: Node, index: number): Node | null {
  const c = changesOf(live, suggested)[index];
  if (!c) return null;
  return replaced(suggested, c.suggested, live, c.live);
}

function replaced(target: Node, at: { from: number; to: number }, source: Node, from: { from: number; to: number }): Node | null {
  try {
    const tr = new Transform(target);
    tr.replace(at.from, at.to, source.slice(from.from, from.to));
    return tr.doc;
  } catch {
    return null;
  }
}

/**
 * The live text after the teacher changed the suggested text from `before` to `after` (one
 * editor transaction: one run of text replaced, or marks changed). Null when it cannot be
 * worked out (the block changed type), and the caller treats the edit as accepting the suggestion.
 */
export function carryEdit(live: Node, before: Node, after: Node): Node | null {
  if (before.type !== after.type || live.type !== before.type) return null;
  const lt = flat(live);
  const bt = flat(before);
  const at = flat(after);
  // For each character of the suggested text: its index in the live text, or -1 if suggested.
  const toLive: number[] = [];
  let li = 0;
  for (const p of diffWords(lt.text, bt.text)) {
    if (p.kind === "del") li += p.text.length;
    else for (let k = 0; k < p.text.length; k++) toLive.push(p.kind === "same" ? li++ : -1);
  }
  try {
    const tr = new Transform(live);
    if (bt.text === at.text) carryMarks(tr, lt, bt, at, before, after, toLive);
    else carryText(tr, lt, bt, at, after, toLive);
    return tr.doc;
  } catch {
    return null;
  }
}

function carryText(tr: Transform, lt: FlatText, bt: FlatText, at: FlatText, after: Node, toLive: number[]) {
  let p = 0;
  while (p < bt.text.length && p < at.text.length && bt.text[p] === at.text[p]) p++;
  let e = bt.text.length;
  let f = at.text.length;
  while (e > p && f > p && bt.text[e - 1] === at.text[f - 1]) {
    e--;
    f--;
  }
  type Op = { kind: "del"; from: number; to: number } | { kind: "ins"; at: number };
  const ops: Op[] = [];
  // Deleted characters the live text shares go from it too, in runs.
  let run: [number, number] | null = null;
  const flush = () => {
    if (run) ops.push({ kind: "del", ...range(lt, run[0], run[1] + 1) });
    run = null;
  };
  for (let i = p; i < e; i++) {
    const l = toLive[i]!;
    if (l < 0) continue;
    if (run && l === run[1] + 1) run[1] = l;
    else {
      flush();
      run = [l, l];
    }
  }
  flush();
  // Typed text takes after the character before it (at the start, the one after it).
  if (f > p) {
    const inherits = p > 0 ? toLive[p - 1]! : e < toLive.length ? toLive[e]! : 0;
    if (inherits >= 0) {
      let next = e;
      while (next < toLive.length && toLive[next]! < 0) next++;
      ops.push({ kind: "ins", at: next < toLive.length ? toLive[next]! : lt.text.length });
    }
  }
  const slice = after.slice(range(at, p, f).from, range(at, p, f).to);
  const posOf = (op: Op) => (op.kind === "del" ? op.from : op.at < lt.text.length ? lt.pos[op.at]! : lt.end);
  // Back to front, a deletion before an insertion at the same place, so positions stay good.
  ops.sort((x, y) => posOf(y) - posOf(x) || (x.kind === "del" ? -1 : 1));
  for (const op of ops) {
    if (op.kind === "del") tr.delete(op.from, op.to);
    else tr.replace(posOf(op), posOf(op), slice);
  }
}

function carryMarks(tr: Transform, lt: FlatText, bt: FlatText, at: FlatText, before: Node, after: Node, toLive: number[]) {
  const marksAt = (n: Node, pos: number): readonly Mark[] | null => {
    const node = n.nodeAt(pos);
    return node?.isText ? node.marks : null;
  };
  for (let i = 0; i < bt.text.length; i++) {
    const l = toLive[i]!;
    if (l < 0) continue;
    const was = marksAt(before, bt.pos[i]!);
    const now = marksAt(after, at.pos[i]!);
    if (!was || !now || sameMarks(was, now)) continue;
    const from = lt.pos[l]!;
    tr.removeMark(from, from + 1);
    for (const m of now) tr.addMark(from, from + 1, m);
  }
}

const sameMarks = (a: readonly Mark[], b: readonly Mark[]) => a.length === b.length && a.every((m, i) => m.eq(b[i]!));
