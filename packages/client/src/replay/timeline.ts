/** What the replay precomputes once per bundle: events, pointer samples and each doc's history. */
import type { ReplayBundle, ReplayEvent } from './bundle';
import { buildBlockStates, type BlockStates } from './blockStates';
import { buildDocHistory, type DocHistory } from './docHistory';
import { momentsOf, type Moments } from './workspaceAt';

export interface PointerPoint {
  t: number;
  x: number;
  y: number;
  pane: string;
  block_id: string | null;
  item: string | null;
}

export interface Timeline {
  bundle: ReplayBundle;
  events: ReplayEvent[];
  pointer: PointerPoint[];
  docs: DocHistory;
  /** Each block's type and waiting suggestion over time. */
  states: BlockStates;
  /** When each turn's prompt, reply and flags, and each comment, appeared. */
  moments: Moments;
  /** Which doc each block belongs to. */
  blockDoc: Map<string, string>;
}

export function buildTimeline(bundle: ReplayBundle): Timeline {
  const pointer: PointerPoint[] = [];
  for (const e of bundle.events) {
    if (e.kind !== 'pointer') continue;
    for (const s of (e.payload.samples ?? []) as PointerPoint[]) pointer.push(s);
  }
  pointer.sort((a, b) => a.t - b.t);
  const blockDoc = new Map<string, string>(bundle.blocks.map((b) => [b.id, b.doc_id]));
  for (const te of bundle.textEvents) if (!blockDoc.has(te.block_id)) blockDoc.set(te.block_id, te.doc_id);
  const docs = buildDocHistory(bundle.textEvents, bundle.blocks);
  return { bundle, events: bundle.events, pointer, docs, states: buildBlockStates(bundle, blockDoc), moments: momentsOf(bundle.events), blockDoc };
}

/** Index of the last item with `t <= at`, or -1. Items must be sorted by `t`. */
export function lastAtOrBefore(items: readonly { t: number }[], at: number): number {
  let lo = 0;
  let hi = items.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid]!.t <= at) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Where the pointer was at `at`: between two close samples it moves in a straight line. */
export function pointerAt(points: readonly PointerPoint[], at: number): (PointerPoint & { idleMs: number }) | null {
  const i = lastAtOrBefore(points, at);
  if (i < 0) return null;
  const a = points[i]!;
  const b = points[i + 1];
  if (b && b.t - a.t <= 1000 && b.t > a.t) {
    const f = (at - a.t) / (b.t - a.t);
    return { ...a, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, idleMs: 0 };
  }
  return { ...a, idleMs: at - a.t };
}
