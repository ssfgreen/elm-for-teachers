/**
 * A copy made before `copy_of` existed (a `create_doc`, then every block inserted again from its
 * text) rewritten as a `copy_of` copy that ends with the same blocks: copied blocks the model left
 * out become deletes, ones it rewrote become replaces, and new ones inserts. So the effect sees
 * the copy as the plan does (docs/spyglass.md, Part 1), and the judge can be tried on what the
 * sessions' copies actually did.
 *
 * Blocks are lined up in order (the longest run of matches): a match is the same type with at
 * least half the words shared. The source is the doc the copy matches best.
 */
import { applyOperations, createState, hasWaitingSuggestion, normalise, visibleBlocks, type Block, type CopyChoice, type Ctx, type Doc, type Operation } from '@edw/shared';

export interface TurnStart {
  blocks: readonly Block[];
  docs: readonly Doc[];
  thread_id: string;
  open_doc_id: string;
}

const AT = '2026-11-01T00:00:00.000Z';
const fresh = (t: TurnStart) => createState('s', t.blocks.map((b) => structuredClone(b)), t.docs.map((d) => structuredClone(d)));
const ctx = (): Ctx => {
  let n = 0;
  return { now: () => AT, newId: () => `COPY${String((n += 1)).padStart(22, '0')}` };
};
const apply = (t: TurnStart, operations: Operation[], copyChoices?: Record<string, CopyChoice>) => {
  const state = fresh(t);
  const result = applyOperations(state, ctx(), { operations, turn_id: 't_rewrite', cause_event_id: 'rewrite', thread_id: t.thread_id, default_doc_id: t.open_doc_id, ...(copyChoices ? { copy_choices: copyChoices } : {}) });
  return { state, result };
};

const words = (text: string) => new Set(normalise(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);

/** 0 for no match; above 1 for a match, higher the closer (so exact copies win). */
function score(a: Block, b: Block): number {
  if (a.type !== b.type) return 0;
  const x = words(a.content);
  const y = words(b.content);
  if (x.size === 0 && y.size === 0) return 2;
  const shared = [...x].filter((w) => y.has(w)).length;
  const sim = shared / (x.size + y.size - shared);
  return sim >= 0.5 ? 1 + sim : 0;
}

/** Pairs (source index, copy index) of the best in-order alignment. */
export function align(source: readonly Block[], copy: readonly Block[]): Array<[number, number]> {
  const n = source.length;
  const m = copy.length;
  const best = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) {
      const s = score(source[i]!, copy[j]!);
      best[i]![j] = Math.max(best[i + 1]![j]!, best[i]![j + 1]!, s ? s + best[i + 1]![j + 1]! : 0);
    }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const s = score(source[i]!, copy[j]!);
    if (s && best[i]![j] === s + best[i + 1]![j + 1]!) pairs.push([i++, j++]);
    else if (best[i]![j] === best[i + 1]![j]) i++;
    else j++;
  }
  return pairs;
}

export interface Rewritten {
  operations: Operation[];
  copy_choices: Record<string, CopyChoice>;
  /** For each rewritten copy: its temp id and the doc it copies. */
  copies: Array<{ temp_id: string; source: string }>;
}

/** The turn's operations with each copy written as `copy_of`, or null when the turn made no copy. */
export function asCopy(t: TurnStart, operations: readonly Operation[]): Rewritten | null {
  if (!operations.some((o) => o.op === 'create_doc' && !o.copy_of)) return null;
  const recorded = apply(t, [...operations]);
  const out: Operation[] = [];
  const copyChoices: Record<string, CopyChoice> = {};
  const copies: Rewritten['copies'] = [];
  const rewritten = new Set<string>();
  for (const op of operations) {
    if (op.op !== 'create_doc' || op.copy_of) continue;
    const made = visibleBlocks(recorded.state, recorded.result.doc_ids[op.temp_id] ?? '');
    let pick: { source: string; blocks: Block[]; pairs: Array<[number, number]>; choice?: CopyChoice } | null = null;
    for (const d of t.docs) {
      const choice: CopyChoice | undefined = t.blocks.some((b) => b.doc_id === d.id && hasWaitingSuggestion(b)) ? 'all_and_leave' : undefined;
      const trial = apply(t, [{ op: 'create_doc', temp_id: op.temp_id, name: op.name, copy_of: d.id }], choice ? { [d.id]: choice } : undefined);
      const blocks = visibleBlocks(trial.state, trial.result.doc_ids[op.temp_id] ?? '');
      const pairs = align(blocks, made);
      if (!pick || pairs.length > pick.pairs.length) pick = { source: d.id, blocks, pairs, ...(choice ? { choice } : {}) };
    }
    if (!pick || pick.pairs.length < Math.max(3, made.length * 0.4)) continue;
    rewritten.add(op.temp_id);
    copies.push({ temp_id: op.temp_id, source: pick.source });
    if (pick.choice) copyChoices[pick.source] = pick.choice;
    out.push({ ...op, copy_of: pick.source });
    const name = (b: Block) => `${op.temp_id}/${b.derived_from}`;
    const toCopy = new Map(pick.pairs.map(([i, j]) => [j, i]));
    const kept = new Set(pick.pairs.map(([i]) => i));
    pick.blocks.forEach((b, i) => kept.has(i) || out.push({ op: 'delete', id: name(b) }));
    let after = 'start';
    made.forEach((b, j) => {
      const i = toCopy.get(j);
      if (i !== undefined) {
        const source = pick!.blocks[i]!;
        if (normalise(source.content) !== normalise(b.content)) out.push({ op: 'replace', id: name(source), content: b.content });
        after = name(source);
      } else {
        const temp = `${op.temp_id}_new${j}`;
        out.push({ op: 'insert', doc: op.temp_id, after, type: b.type, content: b.content, temp_id: temp });
        after = temp;
      }
    });
  }
  if (!rewritten.size) return null;
  // Everything else the turn did, as it was; inserts into a rewritten copy are replaced above.
  for (const op of operations) {
    if (op.op === 'create_doc' && rewritten.has(op.temp_id)) continue;
    if (op.op === 'insert' && op.doc && rewritten.has(op.doc)) continue;
    out.push(op);
  }
  return { operations: out, copy_choices: copyChoices, copies };
}
