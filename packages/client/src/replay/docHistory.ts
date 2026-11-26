/**
 * Each block's text over time, from text_events.jsonl: replaying a block's lines in order gives
 * its stored text (the export checks this), and each line has its time, so the document can be
 * shown as it was at any moment, keystroke by keystroke.
 */
import { applyText, type TextOp } from '@edw/shared';
import type { BundleBlock, TextEvent } from './bundle';

interface Step {
  t: number;
  /** Null once the block is deleted or merged into another. */
  content: string | null;
}

interface BlockHistory {
  id: string;
  doc_id: string;
  /** Where it sits in its doc: the export's final order, then first appearance. */
  order: number;
  firstSeen: number;
  steps: Step[];
}

export interface DocHistory {
  byDoc: Map<string, BlockHistory[]>;
}

export interface ShownBlock {
  id: string;
  content: string;
}

export function buildDocHistory(textEvents: readonly TextEvent[], blocks: readonly BundleBlock[]): DocHistory {
  const order = new Map(blocks.map((b) => [b.id, b.order]));
  const byBlock = new Map<string, BlockHistory>();
  for (const e of textEvents) {
    let h = byBlock.get(e.block_id);
    if (!h) {
      h = { id: e.block_id, doc_id: e.doc_id, order: order.get(e.block_id) ?? Number.MAX_SAFE_INTEGER, firstSeen: e.eventNum, steps: [] };
      byBlock.set(e.block_id, h);
    }
    const prev = h.steps.at(-1)?.content ?? '';
    if (e.eventName === 'block-delete' || e.eventName === 'block-merge') {
      h.steps.push({ t: e.eventTimestamp, content: null });
    } else if (e.eventName.startsWith('text-')) {
      h.steps.push({ t: e.eventTimestamp, content: apply(prev, e.textDelta?.ops ?? []) });
    }
  }
  const byDoc = new Map<string, BlockHistory[]>();
  for (const h of byBlock.values()) {
    if (h.steps.length === 0) continue;
    const list = byDoc.get(h.doc_id) ?? [];
    list.push(h);
    byDoc.set(h.doc_id, list);
  }
  for (const list of byDoc.values()) list.sort((a, b) => a.order - b.order || a.firstSeen - b.firstSeen);
  return { byDoc };
}

function apply(text: string, ops: unknown[]): string {
  try {
    return applyText(text, ops as TextOp[]);
  } catch {
    // A line that does not fit (the export reports these as resyncs) keeps the text as it was.
    return text;
  }
}

/** The doc's blocks as they stood at `t`, in order. */
export function docAt(history: DocHistory, docId: string, t: number): ShownBlock[] {
  const out: ShownBlock[] = [];
  for (const h of history.byDoc.get(docId) ?? []) {
    let content: string | null | undefined;
    for (const s of h.steps) if (s.t <= t) content = s.content;
    if (content !== undefined && content !== null) out.push({ id: h.id, content });
  }
  return out;
}
