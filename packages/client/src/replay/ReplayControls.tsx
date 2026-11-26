/** Play, rewind and fast-forward (×2, ×5), and a scrub bar marked with the sitting's moments. */
import { FastForward, Pause, Play, Rewind } from 'lucide-react';
import { Button } from '../components/ui/button';
import type { Moment, MomentTone } from './feed';
import type { ReplayClock } from './useReplayClock';

export const TONE_CLASS: Record<MomentTone, string> = {
  chat: 'bg-primary',
  accept: 'bg-success-solid',
  reject: 'bg-danger-solid',
  doc: 'bg-model',
  away: 'bg-warning-solid',
  other: 'bg-border-strong',
};

export const clockTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export function duration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

interface Props {
  clock: ReplayClock;
  start: number;
  end: number;
  moments: readonly Moment[];
  skipIdle: boolean;
  onSkipIdle: (on: boolean) => void;
  /** Draw a tall window as a landscape one. */
  landscape: boolean;
  onLandscape: (on: boolean) => void;
}

export function ReplayControls({ clock, start, end, moments, skipIdle, onSkipIdle, landscape, onLandscape }: Props) {
  const span = Math.max(1, end - start);
  const back = clock.playing && clock.rate < 0;
  const fast = clock.playing && clock.rate > 1;
  const pct = (t: number) => `${((t - start) / span) * 100}%`;
  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-8">
        <div className="absolute inset-x-0 top-1 h-2.5" aria-hidden>
          {moments.map((m, i) => (
            <span key={i} title={m.label} className={`absolute top-0 h-2.5 w-0.5 rounded-xs ${TONE_CLASS[m.tone]}`} style={{ left: pct(m.t) }} />
          ))}
        </div>
        <input
          type="range"
          aria-label="Position in the replay"
          className="absolute inset-x-0 bottom-0 w-full cursor-pointer accent-primary"
          min={start}
          max={end}
          step="any"
          value={clock.t}
          onChange={(e) => clock.seek(Number(e.target.value))}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={back ? 'primary' : 'default'} size="sm" onClick={clock.back} aria-label="Rewind" title="Rewind: press again for ×5">
          <Rewind className="size-4" />
          {back ? `×${-clock.rate}` : ''}
        </Button>
        <Button variant="primary" size="sm" onClick={clock.toggle} aria-label={clock.playing && clock.rate === 1 ? 'Pause' : 'Play'} className="min-w-20">
          {clock.playing && clock.rate === 1 ? <Pause className="size-4" /> : <Play className="size-4" />}
          {clock.playing && clock.rate === 1 ? 'Pause' : 'Play'}
        </Button>
        <Button variant={fast ? 'primary' : 'default'} size="sm" onClick={clock.forward} aria-label="Fast forward" title="Fast forward: press again for ×5">
          <FastForward className="size-4" />
          {fast ? `×${clock.rate}` : ''}
        </Button>
        <span className="ml-2 font-mono text-md tabular-nums" aria-label="Time">
          {duration(clock.t - start)} / {duration(span)}
        </span>
        <span className="text-md text-muted-foreground tabular-nums">{clockTime(clock.t)}</span>
        <label className="ml-auto flex items-center gap-1.5 text-md text-foreground-2">
          <input type="checkbox" checked={skipIdle} onChange={(e) => onSkipIdle(e.target.checked)} />
          Skip quiet stretches
        </label>
        <label className="flex items-center gap-1.5 text-md text-foreground-2" title="A window taller than it is wide is drawn 16:10, its headers and chat box where they were">
          <input type="checkbox" checked={landscape} onChange={(e) => onLandscape(e.target.checked)} />
          Landscape window
        </label>
      </div>
    </div>
  );
}
