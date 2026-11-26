/**
 * Each block's type and waiting suggestion over time, so the replay can hand the editor's own
 * rendering real blocks (`PublicBlock`) and the tracked changes look as they did on screen.
 *
 * A turn's `proposal_shown` lists the blocks it touched in the order of the reply's operations:
 * an insert is a proposed block, a replace, delete or move a pending change to a live one. A
 * decision ends it; a part accepted leaves the rest waiting; typing into a suggestion changes it.
 */
import type { BlockType, PendingOp } from '@edw/shared';
import type { PublicBlock } from '../editor/types';
import type { ReplayBundle } from './bundle';
import { docAt, type DocHistory } from './docHistory';

interface Suggestion {
  t: number;
  status: 'live' | 'proposed' | 'rejected';
  pending: PendingOp | null;
}

export interface BlockStates {
  /** Type changes; the first entry is the type the block started with. */
  types: Map<string, { t: number; type: BlockType }[]>;
  suggestions: Map<string, Suggestion[]>;
}

type P = Record<string, unknown>;
type Op = { op: string; id?: string; type?: BlockType; content?: string; after?: string };

export function buildBlockStates(bundle: ReplayBundle, blockDoc: ReadonlyMap<string, string>): BlockStates {
  const types = new Map<string, { t: number; type: BlockType }[]>();
  const suggestions = new Map<string, Suggestion[]>();
  const opsByTurn = new Map<string, Op[]>();
  for (const e of bundle.events) if (e.kind === 'chat_response') opsByTurn.set(String(e.payload.turn_id), (e.payload.operations ?? []) as Op[]);

  const insertedAs = new Map<string, BlockType>();
  const current = (id: string) => suggestions.get(id)?.at(-1);
  const set = (id: string, s: Suggestion) => suggestions.set(id, [...(suggestions.get(id) ?? []), s]);
  const settle = (id: string, t: number, accept: boolean) => {
    const cur = current(id);
    if (!cur || (cur.status === 'live' && !cur.pending)) return;
    set(id, { t, status: !accept && cur.status === 'proposed' ? 'rejected' : 'live', pending: null });
  };

  for (const e of bundle.events) {
    const p = e.payload;
    if (e.kind === 'proposal_shown') {
      const turn = String(p.turn_id);
      const ops = opsByTurn.get(turn) ?? [];
      ((p.block_ids ?? []) as string[]).forEach((id, i) => {
        const op = ops[i];
        if (!op) return;
        if (op.op === 'insert') {
          if (op.type) insertedAs.set(id, op.type);
          set(id, { t: e.t, status: 'proposed', pending: null });
        } else if (op.op === 'replace') set(id, { t: e.t, status: 'live', pending: { op: 'replace', turn_id: turn, content: op.content ?? '' } });
        else if (op.op === 'delete') set(id, { t: e.t, status: 'live', pending: { op: 'delete', turn_id: turn } });
        else if (op.op === 'move') set(id, { t: e.t, status: 'live', pending: { op: 'move', turn_id: turn, after: op.after ?? '' } });
      });
    } else if (e.kind === 'proposal_accept' || e.kind === 'proposal_reject') {
      const accept = e.kind === 'proposal_accept';
      const id = typeof p.block_id === 'string' ? p.block_id : null;
      if (!id) {
        for (const b of suggestions.keys()) if (blockDoc.get(b) === p.doc_id) settle(b, e.t, accept);
        continue;
      }
      const part = p.part as { live_after?: { content: string }; suggested_after?: { content: string } } | undefined;
      const cur = current(id);
      if (accept && part?.suggested_after && part.live_after && cur?.pending?.op === 'replace' && part.suggested_after.content !== part.live_after.content) {
        set(id, { t: e.t, status: cur.status, pending: { ...cur.pending, content: part.suggested_after.content } });
      } else settle(id, e.t, accept);
    } else if (e.kind === 'keystroke_batch' && p.in_suggestion) {
      const id = (p.target as P | undefined)?.block_id as string | undefined;
      const cur = id ? current(id) : undefined;
      const after = (p.content_after as { content?: string } | undefined)?.content;
      if (id && cur?.pending?.op === 'replace' && after !== undefined) set(id, { t: e.t, status: cur.status, pending: { ...cur.pending, content: after } });
    }
  }

  // Types: the final type, unless the block was retyped, when it started as inserted (or a paragraph).
  const finalType = new Map(bundle.blocks.map((b) => [b.id, b.type]));
  const retypes = new Map<string, { t: number; type: BlockType }[]>();
  for (const te of bundle.textEvents) {
    if (te.eventName !== 'block-retype') continue;
    const type = te.detail?.type as BlockType | undefined;
    if (type) retypes.set(te.block_id, [...(retypes.get(te.block_id) ?? []), { t: te.eventTimestamp, type }]);
  }
  for (const id of new Set([...finalType.keys(), ...insertedAs.keys(), ...retypes.keys()])) {
    const changes = retypes.get(id) ?? [];
    const first: BlockType = changes.length ? (insertedAs.get(id) ?? 'paragraph') : (finalType.get(id) ?? insertedAs.get(id) ?? 'paragraph');
    types.set(id, [{ t: -Infinity, type: first }, ...changes]);
  }
  return { types, suggestions };
}

function lastBy<T extends { t: number }>(steps: readonly T[] | undefined, t: number): T | undefined {
  let found: T | undefined;
  for (const s of steps ?? []) if (s.t <= t) found = s;
  return found;
}

/** The doc's blocks at `t`, as the editor takes them. */
export function blocksAt(docs: DocHistory, states: BlockStates, docId: string, t: number): PublicBlock[] {
  return docAt(docs, docId, t).flatMap((b, order) => {
    const s = lastBy(states.suggestions.get(b.id), t);
    if (s?.status === 'rejected') return [];
    return [
      {
        id: b.id,
        session_id: '',
        doc_id: docId,
        type: lastBy(states.types.get(b.id), t)?.type ?? 'paragraph',
        content: b.content,
        status: s?.status ?? 'live',
        version: 0,
        derived_from: null,
        order,
        pending: s?.pending ?? null,
        created_at: '',
        updated_at: '',
      },
    ];
  });
}
