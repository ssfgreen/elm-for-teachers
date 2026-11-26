/** A workspace's events split into sittings: runs of activity with no gap longer than `gapMs`. */
import type { ReplayEvent } from './bundle';

export const SITTING_GAP_MS = 10 * 60_000;

export interface Sitting {
  index: number;
  start: number;
  end: number;
  /** Indexes into the bundle's events, from `first` to `last` inclusive. */
  first: number;
  last: number;
  /** Events the teacher caused (not the browser noticing what is on screen). */
  actions: number;
}

/** Kinds the client logs on its own, or an admin's doing, without anything the teacher did. */
const PASSIVE = new Set(['block_visible', 'page_state', 'viewport', 'participant_open', 'interaction_logging_set', 'workspace_export', 'workspace_link', 'workspace_features_set', 'budget_update', 'project_open', 'doc_open']);

/** Events must be in time order, as `parseBundle` returns them. */
export function splitSittings(events: readonly ReplayEvent[], gapMs = SITTING_GAP_MS): Sitting[] {
  const out: Sitting[] = [];
  let cur: Sitting | null = null;
  events.forEach((e, i) => {
    if (!cur || e.t - cur.end > gapMs) {
      cur = { index: out.length, start: e.t, end: e.t, first: i, last: i, actions: 0 };
      out.push(cur);
    }
    cur.end = e.t;
    cur.last = i;
    if (!PASSIVE.has(e.kind)) cur.actions += 1;
  });
  return out;
}

/** The sitting to open first: the one with the most the teacher did. */
export function busiestSitting(sittings: readonly Sitting[]): Sitting | undefined {
  return sittings.reduce<Sitting | undefined>((best, s) => (!best || s.actions > best.actions ? s : best), undefined);
}
