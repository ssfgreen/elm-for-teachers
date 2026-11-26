/** Drives the replay clock (clock.ts) with animation frames, and the buttons and keys around it. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { advance, nextBack, nextForward, type Bounds, type ClockState } from './clock';

export interface ReplayClock extends ClockState {
  toggle: () => void;
  forward: () => void;
  back: () => void;
  seek: (t: number) => void;
}

export function useReplayClock(bounds: Bounds): ReplayClock {
  const [state, setState] = useState<ClockState>({ t: bounds.start, rate: 1, playing: false });
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  // A new sitting starts paused at its beginning.
  useEffect(() => setState({ t: bounds.start, rate: 1, playing: false }), [bounds.start, bounds.end]);

  useEffect(() => {
    if (!state.playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // The first frame can be stamped before `last`: `advance` takes a step of less than no time as none.
      const dt = Math.min(now - last, 250);
      last = now;
      setState((s) => advance(s, dt, boundsRef.current));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state.playing]);

  const clamp = (t: number) => Math.min(boundsRef.current.end, Math.max(boundsRef.current.start, t));
  const toggle = useCallback(
    () =>
      setState((s) => {
        if (s.playing && s.rate === 1) return { ...s, playing: false };
        // Play from the start again once at the end; a fast or backward play drops back to normal.
        const t = !s.playing && s.t >= boundsRef.current.end ? boundsRef.current.start : s.t;
        return { t, rate: 1, playing: true };
      }),
    [],
  );
  const forward = useCallback(() => setState((s) => ({ ...s, rate: nextForward(s.rate), playing: true })), []);
  const back = useCallback(() => setState((s) => ({ ...s, rate: nextBack(s.rate), playing: true })), []);
  const seek = useCallback((t: number) => setState((s) => ({ ...s, t: clamp(t) })), []);

  return { ...state, toggle, forward, back, seek };
}
