/**
 * The playback clock, as pure steps the player's hook drives each frame. Rates are 1, 2 or 5
 * forward and 2 or 5 back. Long quiet stretches are skipped unless asked not to.
 */
export const FORWARD_RATES = [1, 2, 5] as const;
export const BACK_RATES = [-2, -5] as const;
export type Rate = (typeof FORWARD_RATES)[number] | (typeof BACK_RATES)[number];

/** A stretch with no events longer than this is jumped over, landing `IDLE_LEAD_MS` before the next. */
export const IDLE_MS = 4_000;
export const IDLE_LEAD_MS = 800;

export interface ClockState {
  t: number;
  rate: Rate;
  playing: boolean;
}

export interface Bounds {
  start: number;
  end: number;
  /** Event times in the sitting, sorted. */
  times: readonly number[];
  skipIdle: boolean;
}

/** Fast-forward: 1 → 2 → 5 → 2 → 5 …; from going back, 2. */
export const nextForward = (rate: Rate): Rate => (rate === 2 ? 5 : 2);
/** Rewind: −2 → −5 → −2 …; from going forward, −2. */
export const nextBack = (rate: Rate): Rate => (rate === -2 ? -5 : -2);

/**
 * The clock after `dtMs` of real time. Stops at either end. A step of no time or less changes
 * nothing: the first frame after a press can be stamped before it, and stepping back from the
 * start (or on from the end, in rewind) would count as arriving there and stop the play.
 */
export function advance(state: ClockState, dtMs: number, b: Bounds): ClockState {
  if (!state.playing || dtMs <= 0) return state;
  let t = state.t + dtMs * state.rate;
  if (b.skipIdle) t = skipQuiet(state.t, t, state.rate > 0, b.times);
  if (t >= b.end) return { ...state, t: b.end, playing: false, rate: 1 };
  if (t <= b.start) return { ...state, t: b.start, playing: false, rate: 1 };
  return { ...state, t };
}

function skipQuiet(from: number, to: number, forward: boolean, times: readonly number[]): number {
  // The first index with times[i] > from.
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! > from) hi = mid;
    else lo = mid + 1;
  }
  if (forward) {
    const next = times[lo];
    if (next !== undefined && next - from > IDLE_MS) return Math.max(to, next - IDLE_LEAD_MS);
  } else {
    let i = lo - 1;
    while (i >= 0 && times[i]! >= from) i--;
    const prev = times[i];
    if (prev !== undefined && from - prev > IDLE_MS) return Math.min(to, prev + IDLE_LEAD_MS);
  }
  return to;
}
