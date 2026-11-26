/**
 * Pure client-side reducers over the canvas snapshot. They mirror the server's
 * canvas model (packages/shared/src/canvas.ts) closely enough that the screen can
 * update optimistically; the server applies the same decision from the logged event.
 */
import { acceptAllOrder, hasWaitingSuggestion, type BlockContent, type DecisionPart, type Doc } from '@edw/shared';
import type { CanvasSnapshot, Decision, InSuggestion, PublicBlock } from '../editor/types.js';

export interface SnapshotChanges {
  blocks?: PublicBlock[];
  docs?: Doc[];
}

function upsert<T extends { id: string }>(list: T[], updates: T[] | undefined): T[] {
  if (!updates || updates.length === 0) return list;
  const byId = new Map(updates.map((u) => [u.id, u]));
  const out = list.map((x) => {
    const u = byId.get(x.id);
    if (u) byId.delete(x.id);
    return u ?? x;
  });
  return [...out, ...byId.values()];
}

/** Upsert blocks and docs by id. */
export function mergeChanges(snap: CanvasSnapshot, changes: SnapshotChanges): CanvasSnapshot {
  return { blocks: upsert(snap.blocks, changes?.blocks), docs: upsert(snap.docs, changes?.docs) };
}

const isVisible = (b: PublicBlock) => b.status === 'live' || b.status === 'proposed';
/** Working copy: blocks are cloned on first write so inputs are never mutated. */
class Draft {
  blocks: PublicBlock[];
  constructor(private readonly snap: CanvasSnapshot) {
    this.blocks = snap.blocks.slice();
  }
  block(id: string): PublicBlock | undefined {
    return this.blocks.find((b) => b.id === id);
  }
  update(id: string, patch: Partial<PublicBlock>): PublicBlock {
    const i = this.blocks.findIndex((b) => b.id === id);
    const next = { ...this.blocks[i]!, ...patch };
    this.blocks[i] = next;
    return next;
  }
  visible(docId: string): PublicBlock[] {
    return this.blocks.filter((b) => b.doc_id === docId && isVisible(b)).sort((a, b) => a.order - b.order);
  }
  renumber(docId: string, ordered: PublicBlock[] = this.visible(docId)): void {
    ordered.forEach((b, i) => {
      if (b.order !== i) this.update(b.id, { order: i });
    });
  }
  snapshot(): CanvasSnapshot {
    return { blocks: this.blocks, docs: this.snap.docs };
  }
}

function acceptBlock(d: Draft, id: string): void {
  const b = d.block(id);
  if (!b) return;
  if (b.status === 'proposed') {
    d.update(id, { status: 'live' });
    return;
  }
  if (b.status !== 'live' || !b.pending) return;
  const p = b.pending;
  switch (p.op) {
    case 'replace':
      d.update(id, { content: p.content, pending: null, version: b.version + 1 });
      return;
    case 'delete':
      d.update(id, { status: 'deleted', pending: null });
      d.renumber(b.doc_id);
      return;
    case 'move': {
      const moved = d.update(id, { pending: null });
      const ordered = d.visible(b.doc_id).filter((x) => x.id !== id);
      const anchor = ordered.findIndex((x) => x.id === p.after);
      const index = p.after === 'start' || anchor < 0 ? 0 : anchor + 1;
      ordered.splice(index, 0, moved);
      d.renumber(b.doc_id, ordered);
      return;
    }
  }
}

/** One change of a suggested edit decided: the block's texts after it, as the decision carries them. */
function decidePart(d: Draft, id: string, part: DecisionPart): void {
  const b = d.block(id);
  if (!b || b.status !== 'live' || b.pending?.op !== 'replace') return;
  const live = part.live_after.content;
  const suggested = part.suggested_after.content;
  d.update(id, { content: live, version: live === b.content ? b.version : b.version + 1, pending: live === suggested ? null : { ...b.pending, content: suggested } });
}

function rejectBlock(d: Draft, id: string): void {
  const b = d.block(id);
  if (!b) return;
  if (b.status === 'proposed') {
    d.update(id, { status: 'rejected', pending: null });
    d.renumber(b.doc_id);
    return;
  }
  if (b.status === 'live' && b.pending) d.update(id, { pending: null });
}

/** Apply an accept or reject to the snapshot: one block, or every proposal in one doc. */
export function applyDecision(snap: CanvasSnapshot, decision: Decision): CanvasSnapshot {
  const d = new Draft(snap);
  const accept = decision.decision === 'accept';
  if (decision.mode === 'accept_all' || decision.mode === 'reject_all') {
    const awaiting = d.blocks.filter((b) => b.doc_id === decision.doc_id && hasWaitingSuggestion(b)).sort((a, b) => a.order - b.order);
    // Accepting applies chained moves in chain order, as the server does.
    const targets = (decision.mode === 'accept_all' ? acceptAllOrder(awaiting) : awaiting).map((b) => b.id);
    for (const id of targets) (decision.mode === 'accept_all' ? acceptBlock : rejectBlock)(d, id);
    return d.snapshot();
  }
  if (decision.block_id && decision.part) decidePart(d, decision.block_id, decision.part);
  else if (decision.block_id) (accept ? acceptBlock : rejectBlock)(d, decision.block_id);
  return d.snapshot();
}

/**
 * The teacher typed into a block. Inside a suggestion that stays (`inSuggestion`, as in Word) the
 * suggestion keeps waiting: a new block keeps its status, a suggested edit takes the shown text
 * as its suggestion and `live` as the block's text. Otherwise a suggestion becomes the teacher's
 * (edit-then-accept), as before 7 Nov 2026.
 */
export function applyLocalEdit(snap: CanvasSnapshot, blockId: string, content: BlockContent | string, inSuggestion?: InSuggestion): CanvasSnapshot {
  const d = new Draft(snap);
  const b = d.block(blockId);
  if (!b) return snap;
  const c = typeof content === 'string' ? { content } : content;
  if (inSuggestion && (b.status === 'proposed' || b.pending?.op === 'move')) {
    d.update(blockId, c);
  } else if (inSuggestion?.live && b.pending?.op === 'replace') {
    const live = inSuggestion.live.content;
    d.update(blockId, { content: live, pending: live === c.content ? null : { ...b.pending, content: c.content } });
  } else {
    d.update(blockId, { ...c, status: b.status === 'proposed' ? 'live' : b.status, pending: null });
  }
  return d.snapshot();
}

/** Whether any visible block in the doc awaits a decision. */
export function hasProposals(snap: CanvasSnapshot, docId: string): boolean {
  return snap.blocks.some((b) => b.doc_id === docId && hasWaitingSuggestion(b));
}

/** A thread's docs, oldest first (the order the model sees and the docs menu lists). */
/** The snapshot without a deleted doc and its blocks. */
export function withoutDoc(snap: CanvasSnapshot, docId: string): CanvasSnapshot {
  return { ...snap, docs: snap.docs.filter((d) => d.id !== docId), blocks: snap.blocks.filter((b) => b.doc_id !== docId) };
}

export function docsInThread(snap: CanvasSnapshot, threadId: string): Doc[] {
  return snap.docs.filter((d) => d.thread_id === threadId).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

/**
 * The name an "Untitled" doc takes: the text of its first heading (the teacher's, or one the
 * assistant suggested), without the `#` and inline marks. Null when it has no heading with text.
 */
export function headingName(snap: CanvasSnapshot, docId: string): string | null {
  const first = snap.blocks
    .filter((b) => b.doc_id === docId && (b.status === 'live' || b.status === 'proposed'))
    .sort((a, b) => a.order - b.order)
    .find((b) => b.type === 'heading');
  if (!first) return null;
  const text = first.content
    .split('\n')[0]!
    .replace(/^#{1,6}\s*/, '')
    .replace(/\[([^\]]*)\]\((?:https?:\/\/|mailto:)[^)\s]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\*\*|__|[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, 200) : null;
}

/** The name a new doc starts with, until the teacher (or its first heading) names it. */
export const UNTITLED = 'Untitled';

/**
 * Whether a doc is still as "Create new" made it: named Untitled, default look, and nothing in
 * it but empty paragraphs (no text, pictures, page breaks, suggestions or deleted blocks). An
 * upload replaces such a doc rather than sitting beside it.
 */
export function isBlankUntitled(snap: CanvasSnapshot, docId: string): boolean {
  const doc = snap.docs.find((d) => d.id === docId);
  if (!doc || doc.name !== UNTITLED || (doc.style && Object.keys(doc.style).length > 0)) return false;
  return snap.blocks
    .filter((b) => b.doc_id === docId)
    .every((b) => b.status === 'live' && b.pending === null && b.type === 'paragraph' && b.content.trim() === '');
}
