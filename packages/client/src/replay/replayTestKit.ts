/** Small hand-built bundles for the replay's tests. */
import type { BundleTurn, ReplayBundle, ReplayEvent, TextEvent } from './bundle';

export const T0 = Date.parse('2026-11-12T12:00:00.000Z');

let seq = 0;
export function ev(atMs: number, kind: string, payload: Record<string, unknown> = {}, extra: Partial<ReplayEvent> = {}): ReplayEvent {
  seq += 1;
  return { t: T0 + atMs, seq, kind, thread_id: 'th1', doc_id: 'd1', focus_pane: 'canvas', payload, ...extra };
}

export function text(num: number, atMs: number, block_id: string, ops: unknown[], eventName = 'text-insert'): TextEvent {
  return { eventNum: num, eventName, eventTimestamp: T0 + atMs, block_id, doc_id: 'd1', textDelta: { ops } };
}

/** A chat turn as chat_turns.jsonl has it, in chat th1 on doc d1. */
export function turn(turn_id: string, prompt: string, response_text: string | null): BundleTurn {
  return { turn_id, thread_id: 'th1', doc_id: 'd1', prompt, anchor: null, response_text, at: new Date(T0).toISOString() };
}

export function bundle(events: ReplayEvent[], textEvents: TextEvent[] = [], turns: BundleTurn[] = []): ReplayBundle {
  return {
    label: 'Test',
    events: [...events].sort((a, b) => a.t - b.t),
    textEvents,
    blocks: [
      { id: 'b1', doc_id: 'd1', type: 'paragraph', order: 0 },
      { id: 'b2', doc_id: 'd1', type: 'paragraph', order: 1 },
    ],
    docs: [{ id: 'd1', name: 'Doc', thread_id: 'th1' }],
    threads: [{ id: 'th1', title: 'Chat' }],
    turns,
    comments: [],
  };
}
