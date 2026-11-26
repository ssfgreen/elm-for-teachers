/**
 * What one assistant turn did to the chat's docs (docs/spyglass.md, Part 2). Pure: code finds the
 * facts here, and the judge (later) decides which a teacher would want to know about.
 *
 * - **Before** is the docs at commit, before the turn is applied (the teacher's typing during the
 *   turn is already in, and is not the turn's doing).
 * - **After** is before with the turn's operations applied and only this turn's suggestions
 *   taken in, as Editing mode does (`takeTurnIn`). A change `takeTurnIn` holds back (a block
 *   with an earlier turn's suggestion waiting) still counts as this turn's.
 * - In both, a block shows its waiting suggested text, and an earlier turn's suggested block is
 *   there: earlier turns' suggestions look the same before and after, so they are not counted.
 * - The operations are those the commit applies, after `expandListOps`.
 * - Docs opened from a reference file during the turn (`exclude_doc_ids`) are left out.
 *
 * Lineage (`derived_from`) is followed only through blocks this turn made: it is already set by
 * Duplicate, Enter and the list split, which are the teacher's.
 */
import type { Block, Doc } from "./blocks.js";
import type { Operation } from "./operations.js";
import { applyOperations, takeTurnIn } from "./canvas/apply.js";
import type { CopyChoice } from "./canvas/copies.js";
import { createState, visibleBlocks, type CanvasState } from "./canvas/state.js";

/** A table row that changed, was taken out or was added, matched by its number cell, then by text. */
export type RowChange =
  | { change: "changed"; number: string | null; before: string; after: string }
  | { change: "removed"; number: string | null; before: string }
  | { change: "added"; number: string | null; after: string };

export type EffectItem =
  /** A block with no descendant left (in place), or none in a copy it was copied into (`from_copy`). */
  | { kind: "removed"; block_id: string; doc_id: string; text: string; from_copy?: true }
  /** A descendant (`to`) whose text differs from its block's after normalising; a table by row. */
  | { kind: "changed"; block_id: string; to: string; doc_id: string; before: string; after: string; rows?: RowChange[] }
  /** A descendant in another doc (a copy) or another position. */
  | { kind: "moved"; block_id: string; to: string; doc_id: string; copy: boolean }
  /** A new block with no lineage. */
  | { kind: "added"; block_id: string; doc_id: string; text: string }
  /** Blocks with the same text, at least one added by the turn (or two from one block). */
  | { kind: "duplicated"; block_ids: string[]; doc_id: string; text: string }
  /** An added block whose text is a suggestion still waiting in a doc the turn copied or read. */
  | { kind: "built_on_suggestion"; block_id: string; doc_id: string; text: string; suggestion_id: string }
  /** A change only to what does not change content (emphasis, quotes, spacing, column widths), or an empty block added or taken out (a page break, space for an answer). */
  | { kind: "formatting"; block_id: string; to: string; doc_id: string };

export interface TurnEffect {
  /** In document order: docs as given, then those the turn made; within a doc, by position. */
  items: EffectItem[];
  created_doc_ids: string[];
}

export interface TurnEffectInput {
  /** The chat's docs and their blocks at commit, before the turn. Not changed. */
  blocks: readonly Block[];
  docs: readonly Doc[];
  /** The operations the commit applies (validated, after `expandListOps`). */
  operations: readonly Operation[];
  turn_id: string;
  thread_id: string;
  default_doc_id: string;
  copy_choices?: Readonly<Record<string, CopyChoice>>;
  /** Docs opened from a reference file during the turn: the teacher's own copies. */
  exclude_doc_ids?: readonly string[];
  /** Docs the model read this turn, where a suggestion it typed out again would come from. */
  read_doc_ids?: readonly string[];
  /** The ids the commit made, in order (`applyTurn`'s `new_ids`), so the effect names the real blocks and docs. */
  new_ids?: readonly string[];
}

/* ------------------------------------------------------------- normalising */

const COMMENT_LINE = /^<!--\s*(colwidths|header):.*-->$/;

/**
 * The text with what does not change content taken out: emphasis marks, inline formatting tags,
 * a table's column widths and header colour lines, quote styles and runs of white space. Lines
 * stay lines (a table's rows); answer blanks (`____`) stay.
 */
export function normalise(text: string): string {
  return text
    .replace(/<\/?(u|mark|span|strong|em|b|i)\b[^>]*>/g, "")
    .replace(/\*+/g, "")
    .replace(/~~/g, "")
    .replace(/(^|[^\w_])__?([A-Za-z0-9](?:[^_\n]*[A-Za-z0-9])?)__?(?=[^\w_]|$)/g, "$1$2")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l && !COMMENT_LINE.test(l))
    .map((l) => (l.startsWith("|") ? l.replace(/\s*\|\s*/g, "|").replace(/\|:?-{3,}:?(?=\|)/g, "|---") : l))
    .join("\n");
}

/* --------------------------------------------------------------- the views */

interface Shown {
  block: Block;
  doc_id: string;
  /** What the doc shows: a waiting replacement's text, else the block's. */
  text: string;
  at: number;
}

/** The blocks a doc shows, in order. A delete this turn suggested counts as done. */
function shownIn(state: CanvasState, docId: string, turnId: string): Shown[] {
  return visibleBlocks(state, docId)
    .filter((b) => !(b.pending?.op === "delete" && b.pending.turn_id === turnId))
    .map((b, at) => ({ block: b, doc_id: docId, text: b.pending?.op === "replace" ? b.pending.content : b.content, at }));
}

/** Ids for what the turn makes: `replay` first (the commit's own, in order), then made up. */
function fixedCtx(replay: readonly string[] = []) {
  let n = 0;
  return { now: () => "1970-01-01T00:00:00.000Z", newId: () => replay[n++] ?? `EFFECT${String(n).padStart(20, "0")}` };
}

/* ------------------------------------------------------------------ tables */

interface Row {
  line: string;
  norm: string;
  number: string | null;
}

function rowsOf(text: string): Row[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|") && !/^\|?(\s*:?-{3,}:?\s*\|)+\s*$/.test(l))
    .map((line) => {
      const cells = line.split("|").slice(1, -1).map((c) => normalise(c));
      const num = cells.find((c) => /^\d+[.)]?$/.test(c));
      return { line, norm: normalise(line), number: num ? num.replace(/[.)]$/, "") : null };
    });
}

/** Each row of `before` matched among `after`'s rows: by number cell first, then by text. */
function compareRows(before: Row[], after: Row[]): RowChange[] {
  const used = new Set<number>();
  const matched = new Map<number, number>();
  const match = (i: number, j: number) => {
    used.add(j);
    matched.set(i, j);
  };
  before.forEach((r, i) => {
    if (r.number === null) return;
    const j = after.findIndex((a, k) => !used.has(k) && a.number === r.number);
    if (j >= 0) match(i, j);
  });
  before.forEach((r, i) => {
    if (matched.has(i)) return;
    const j = after.findIndex((a, k) => !used.has(k) && a.norm === r.norm);
    if (j >= 0) match(i, j);
  });
  const out: RowChange[] = [];
  before.forEach((r, i) => {
    const j = matched.get(i);
    if (j === undefined) out.push({ change: "removed", number: r.number, before: r.line });
    else if (after[j]!.norm !== r.norm) out.push({ change: "changed", number: r.number, before: r.line, after: after[j]!.line });
  });
  // A row repeated from the table (its header, on each page) is not new.
  const known = new Set(before.map((r) => r.norm));
  after.forEach((a, k) => {
    if (!used.has(k) && !known.has(a.norm)) out.push({ change: "added", number: a.number, after: a.line });
  });
  return out;
}

/* ------------------------------------------------------------------ effect */

export function turnEffect(input: TurnEffectInput): TurnEffect {
  const exclude = new Set(input.exclude_doc_ids ?? []);
  const docs = input.docs.filter((d) => !exclude.has(d.id));
  // Copies: the input is never changed.
  const beforeState = createState("effect", input.blocks.map((b) => ({ ...b })), input.docs.map((d) => ({ ...d })));
  const state = createState("effect", input.blocks.map((b) => ({ ...b, ...(b.pending ? { pending: { ...b.pending } } : {}) })), input.docs.map((d) => ({ ...d })));
  const ctx = fixedCtx(input.new_ids);
  const applied = applyOperations(state, ctx, { operations: [...input.operations], turn_id: input.turn_id, cause_event_id: "effect", thread_id: input.thread_id, default_doc_id: input.default_doc_id, ...(input.copy_choices ? { copy_choices: input.copy_choices } : {}) });
  takeTurnIn(state, ctx, applied, "effect");

  const docOrder = [...docs.map((d) => d.id), ...applied.created_doc_ids];
  const before = new Map(docs.map((d) => [d.id, shownIn(beforeState, d.id, input.turn_id)]));
  const after = new Map(docOrder.map((id) => [id, shownIn(state, id, input.turn_id)]));
  const beforeById = new Map([...before.values()].flat().map((s) => [s.block.id, s]));
  const afterAll = [...after.values()].flat();
  const old = new Set(input.blocks.map((b) => b.id));
  const isNew = (id: string) => !old.has(id);

  /**
   * The block from before a block comes from, through this turn's blocks only; null for none.
   * It may be in a doc left out (a copy of a reference doc): lineage, but nothing to report.
   */
  const rootOf = (b: Block): string | null => {
    let cur: Block | undefined = b;
    for (let guard = 0; cur && guard < 1000; guard++) {
      if (!isNew(cur.id)) return cur.id;
      if (!cur.derived_from) return null;
      cur = state.blocks.get(cur.derived_from);
    }
    return null;
  };
  const descendants = new Map<string, Shown[]>();
  const roots = new Map<string, string | null>();
  for (const s of afterAll) {
    const r = rootOf(s.block);
    roots.set(s.block.id, r);
    if (r) descendants.set(r, [...(descendants.get(r) ?? []), s]);
  }
  const movedIds = new Set(input.operations.flatMap((o) => (o.op === "move" ? [o.id] : [])));
  const items: { item: EffectItem; doc: number; at: number }[] = [];
  const push = (item: EffectItem, docId: string, at: number) => items.push({ item, doc: docOrder.indexOf(docId), at });

  // Each block from before: removed, or what became of it in each doc it now has descendants in.
  for (const [docId, shown] of before) {
    for (const b of shown) {
      const ds = descendants.get(b.block.id) ?? [];
      if (ds.length === 0) {
        // An empty block (space for an answer, a page break) taken out changes only the layout.
        push(normalise(b.text) ? { kind: "removed", block_id: b.block.id, doc_id: docId, text: b.text } : { kind: "formatting", block_id: b.block.id, to: b.block.id, doc_id: docId }, docId, b.at);
        continue;
      }
      for (const groupDoc of docOrder) {
        const group = ds.filter((d) => d.doc_id === groupDoc);
        if (group.length) describeGroup(b, group, groupDoc === docId);
      }
    }
  }

  function describeGroup(b: Shown, group: Shown[], own: boolean) {
    const docId = group[0]!.doc_id;
    for (const d of group) {
      if (!own || d.block.id !== b.block.id || movedIds.has(d.block.id)) push({ kind: "moved", block_id: b.block.id, to: d.block.id, doc_id: docId, copy: !own }, docId, d.at);
    }
    const first = group[0]!;
    if (b.block.type === "table" && group.every((d) => d.block.type === "table")) {
      const rows = compareRows(rowsOf(b.text), group.flatMap((d) => rowsOf(d.text)));
      if (rows.length) push({ kind: "changed", block_id: b.block.id, to: first.block.id, doc_id: docId, before: b.text, after: group.map((d) => d.text).join("\n"), rows }, docId, first.at);
      else if (group.length === 1 && first.text !== b.text) push({ kind: "formatting", block_id: b.block.id, to: first.block.id, doc_id: docId }, docId, first.at);
      return;
    }
    const was = normalise(b.text);
    // Split into several blocks with nothing changed: only moved.
    if (group.length > 1 && normalise(group.map((d) => d.text).join(" ")).replace(/\n/g, " ") === was.replace(/\n/g, " ")) return;
    for (const d of group) {
      if (normalise(d.text) !== was) push({ kind: "changed", block_id: b.block.id, to: d.block.id, doc_id: docId, before: b.text, after: d.text }, docId, d.at);
      else if (d.text !== b.text) push({ kind: "formatting", block_id: b.block.id, to: d.block.id, doc_id: docId }, docId, d.at);
    }
  }

  // A copied block left out of its copy (deleted from it this turn) is removed from that copy.
  for (const c of applied.copies) {
    const source = beforeById.get(c.from);
    if (!source || (descendants.get(c.from) ?? []).some((d) => d.doc_id === c.doc_id)) continue;
    push(normalise(source.text) ? { kind: "removed", block_id: c.from, doc_id: c.doc_id, text: source.text, from_copy: true } : { kind: "formatting", block_id: c.from, to: c.block_id, doc_id: c.doc_id }, c.doc_id, source.at);
  }

  // New blocks with no lineage.
  const added = afterAll.filter((s) => isNew(s.block.id) && roots.get(s.block.id) === null);
  for (const s of added) {
    if (!normalise(s.text)) push({ kind: "formatting", block_id: s.block.id, to: s.block.id, doc_id: s.doc_id }, s.doc_id, s.at);
    else push({ kind: "added", block_id: s.block.id, doc_id: s.doc_id, text: s.text }, s.doc_id, s.at);
  }

  // Duplicates: blocks of one doc with the same text, at least one added with no lineage, or two from one block.
  const seen = new Set<string>();
  for (const s of afterAll.filter((x) => isNew(x.block.id))) {
    const text = normalise(s.text);
    if (!text) continue;
    const group = (after.get(s.doc_id) ?? []).filter((x) => normalise(x.text) === text);
    const keys = group.map((x) => roots.get(x.block.id) ?? null);
    const counts = group.some((x, i) => isNew(x.block.id) && keys[i] === null) || new Set(keys.filter(Boolean)).size < keys.filter(Boolean).length;
    const id = `${s.doc_id}:${text}`;
    if (group.length < 2 || !counts || seen.has(id)) continue;
    seen.add(id);
    push({ kind: "duplicated", block_ids: group.map((x) => x.block.id), doc_id: s.doc_id, text: group[0]!.text }, s.doc_id, group[0]!.at);
  }

  // Suggestions still waiting in a doc the turn copied or read, typed out again.
  const sources = new Set([...input.operations.flatMap((o) => (o.op === "create_doc" && o.copy_of ? [o.copy_of] : [])), ...(input.read_doc_ids ?? [])]);
  const waiting = new Map<string, string>();
  for (const id of sources) {
    for (const b of before.get(id) ?? []) {
      if (b.block.status === "proposed") waiting.set(normalise(b.block.content), b.block.id);
      else if (b.block.pending?.op === "replace") waiting.set(normalise(b.block.pending.content), b.block.id);
    }
  }
  for (const s of added) {
    const from = waiting.get(normalise(s.text));
    if (from && normalise(s.text)) push({ kind: "built_on_suggestion", block_id: s.block.id, doc_id: s.doc_id, text: s.text, suggestion_id: from }, s.doc_id, s.at);
  }

  items.sort((x, y) => x.doc - y.doc || x.at - y.at);
  return { items: items.map((x) => x.item), created_doc_ids: applied.created_doc_ids };
}

/**
 * Whether the turn changed content: only then is the judge called. Formatting does not count, nor
 * does a move: a copy with nothing changed, or blocks put in another order, is shown by the step
 * cards and needs no judgement.
 */
export function contentChanged(effect: TurnEffect): boolean {
  return effect.items.some((i) => i.kind !== "formatting" && i.kind !== "moved");
}
