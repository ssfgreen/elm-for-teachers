/** One workspace's replay: choose a session (a sitting), then watch, scrub and skim it. */
import { useEffect, useMemo, useState } from 'react';
import type { ReplayBundle } from './bundle';
import type { Bounds } from './clock';
import { moments as momentsOf } from './feed';
import { ReplayControls, clockTime, duration } from './ReplayControls';
import { ReplayFeed } from './ReplayFeed';
import { ReplayStage } from './ReplayStage';
import { busiestSitting, splitSittings } from './sittings';
import { snapshotAt } from './snapshot';
import { buildTimeline } from './timeline';
import { useReplayClock } from './useReplayClock';
import { namedClicks } from './useCalibration';

export function ReplayPlayer({ bundle }: { bundle: ReplayBundle }) {
  const tl = useMemo(() => buildTimeline(bundle), [bundle]);
  const sittings = useMemo(() => splitSittings(bundle.events), [bundle]);
  const [index, setIndex] = useState(() => busiestSitting(sittings)?.index ?? 0);
  const [skipIdle, setSkipIdle] = useState(true);
  const [landscape, setLandscape] = useState(true);
  const sitting = sittings[index];

  const times = useMemo(() => {
    if (!sitting) return [];
    const inside = (t: number) => t >= sitting.start && t <= sitting.end;
    const all = bundle.events.slice(sitting.first, sitting.last + 1).map((e) => e.t);
    for (const p of tl.pointer) if (inside(p.t)) all.push(p.t);
    for (const te of bundle.textEvents) if (inside(te.eventTimestamp)) all.push(te.eventTimestamp);
    return all.sort((a, b) => a - b);
  }, [bundle, tl, sitting]);
  const bounds = useMemo<Bounds>(() => ({ start: sitting?.start ?? 0, end: sitting?.end ?? 0, times, skipIdle }), [sitting, times, skipIdle]);
  const clock = useReplayClock(bounds);
  const snap = useMemo(() => snapshotAt(tl, clock.t), [tl, clock.t]);
  const moments = useMemo(() => (sitting ? momentsOf(bundle.events, sitting.first, sitting.last) : []), [bundle, sitting]);
  const named = useMemo(() => (sitting ? namedClicks(bundle.events, sitting.first, sitting.last, landscape) : []), [bundle, sitting, landscape]);

  const { toggle, seek, t } = clock;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
      if (e.key === ' ') {
        e.preventDefault();
        toggle();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        seek(t + (e.key === 'ArrowLeft' ? -5000 : 5000));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, seek, t]);

  if (!sitting) return <p className="text-muted-foreground">This bundle has no events to replay.</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="mb-0">{bundle.label}</h1>
        <label className="flex items-center gap-2 text-md text-foreground-2">
          Session
          <select className="rounded-sm border border-border-strong bg-card px-2 py-1 text-md text-foreground" value={index} onChange={(e) => setIndex(Number(e.target.value))}>
            {sittings.map((s) => (
              <option key={s.index} value={s.index}>
                {`${s.index + 1}: ${new Date(s.start).toLocaleDateString()} ${clockTime(s.start)}, ${duration(s.end - s.start)}, ${s.actions} actions`}
              </option>
            ))}
          </select>
        </label>
        <span className="text-sm text-muted-foreground">A new session starts after 10 minutes with nothing logged. Space plays and pauses; arrow keys move 5 seconds.</span>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <div className="flex flex-col gap-3 lg:col-span-3">
          <ReplayStage snap={snap} label={bundle.label} clicks={named} landscape={landscape} />
          <ReplayControls clock={clock} start={sitting.start} end={sitting.end} moments={moments} skipIdle={skipIdle} onSkipIdle={setSkipIdle} landscape={landscape} onLandscape={setLandscape} />
        </div>
        {/* As tall as the player beside it, scrolling inside. */}
        <div className="relative h-96 lg:h-auto">
          <div className="absolute inset-0">
            <ReplayFeed moments={moments} t={clock.t} onSeek={seek} />
          </div>
        </div>
      </div>
    </div>
  );
}
