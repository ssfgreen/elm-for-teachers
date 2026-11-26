/** The sitting's moments as a list beside the screen; the latest one played is marked, and any can be jumped to. */
import { useEffect, useRef } from 'react';
import type { Moment } from './feed';
import { clockTime, TONE_CLASS } from './ReplayControls';
import { lastAtOrBefore } from './timeline';

export function ReplayFeed({ moments, t, onSeek }: { moments: readonly Moment[]; t: number; onSeek: (t: number) => void }) {
  const current = lastAtOrBefore(moments, t);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>('[data-current=true]');
    if (el && list.current) list.current.scrollTop = el.offsetTop - list.current.clientHeight / 2;
  }, [current]);
  return (
    <ol ref={list} aria-label="What happened" className="relative flex h-full flex-col overflow-y-auto rounded-md border border-border bg-card py-1">
      {moments.map((m, i) => (
        <li key={i}>
          <button
            type="button"
            data-current={i === current}
            data-past={i <= current}
            onClick={() => onSeek(m.t - 500)}
            className="flex w-full items-baseline gap-2 px-3 py-1 text-left text-md text-muted-foreground hover:bg-hover data-[current=true]:bg-primary-soft data-[past=true]:text-foreground"
          >
            <span className={`size-2 shrink-0 rounded-full ${TONE_CLASS[m.tone]}`} />
            <span className="shrink-0 font-mono text-sm tabular-nums">{clockTime(m.t)}</span>
            <span className="min-w-0">{m.label}</span>
          </button>
        </li>
      ))}
      {moments.length === 0 && <li className="px-3 py-2 text-muted-foreground">Nothing to list in this session.</li>}
    </ol>
  );
}
