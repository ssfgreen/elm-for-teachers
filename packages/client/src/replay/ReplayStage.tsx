/**
 * The teacher's window at one moment, drawn at its logged size and scaled to fit a fixed frame
 * (letterboxed: frame.ts), so a resized window changes shape inside a steady frame: each region
 * where `viewport` put it, the pointer and clicks at their logged positions, and what covered
 * the screen (a dialog, another tab).
 */
import { useLayoutEffect, useRef, useState } from 'react';
import type { Offset } from './calibration';
import { fitInFrame, FRAME_ASPECT } from './frame';
import { drawnSnapshot, windowKey } from './landscape';
import { ReplayCursor } from './ReplayCursor';
import type { Snapshot, Viewport } from './snapshot';
import { useCalibration, type NamedClick } from './useCalibration';
import { ReplayChat, ReplayDoc, ReplaySidebar } from './ReplayPanes';

/** Before the first `viewport` event (or with interaction logging off): the default layout. */
const FALLBACK: Viewport = {
  width: 1440,
  height: 800,
  regions: {
    threads: { left: 0, top: 0, width: 260, height: 800 },
    chat: { left: 261, top: 0, width: 400, height: 800 },
    canvas: { left: 662, top: 0, width: 778, height: 800 },
  },
};

export function ReplayStage({
  snap: logged,
  label,
  clicks,
  landscape,
}: {
  snap: Snapshot;
  label: string;
  clicks: readonly NamedClick[];
  /** Draw a tall window as a landscape one (landscape.ts). */
  landscape: boolean;
}) {
  const snap = landscape ? drawnSnapshot(logged) : logged;
  const vp = snap.viewport ?? FALLBACK;
  const outer = useRef<HTMLDivElement>(null);
  // A picture of the screen: nothing in it can be clicked, typed into or focused.
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => inner.current?.setAttribute('inert', ''), []);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const frameHeight = width * FRAME_ASPECT;
  const { scale, left, top } = fitInFrame(width, frameHeight, vp.width, vp.height);
  const { offsets, samples } = useCalibration(inner, clicks, snap.viewport, windowKey(logged.viewport), snap.t);

  return (
    <>
      <div
        ref={outer}
        className="replay-stage relative w-full overflow-hidden rounded-md border border-border-strong bg-panel shadow-card"
        style={{ height: frameHeight }}
      >
        <div
          ref={inner}
          className="absolute top-0 left-0 origin-top-left bg-background shadow-raised"
          style={{ width: vp.width, height: vp.height, transform: `translate(${left}px, ${top}px) scale(${scale})` }}
        >
          {/* The comments column is drawn inside the document's region, as in the app. */}
          {Object.entries(vp.regions)
            .filter(([name]) => name !== 'comments')
            .map(([name, r]) => (
              <div
                key={name}
                data-region={name}
                className="absolute overflow-hidden"
                style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
              >
                <Pane name={name} snap={snap} label={label} width={r.width} />
              </div>
            ))}
          {snap.dialog && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-overlay">
              <div className="rounded-md bg-popover px-8 py-6 text-lg shadow-pop">
                <span className="text-muted-foreground">Dialog open: </span>
                {snap.dialog}
              </div>
            </div>
          )}
          {snap.away && (
            <div className="absolute inset-0 z-40 flex items-start justify-center bg-overlay pt-10">
              <div className="rounded-md border border-warning-border bg-warning-soft px-6 py-3 text-lg text-warning">
                {snap.away === 'hidden'
                  ? 'The teacher is on another tab or app'
                  : 'The window is showing but not in use'}
              </div>
            </div>
          )}
          <ReplayCursor snap={snap} offsets={offsets} root={inner} />
        </div>
      </div>
      <p
        className="replay-alignment text-sm text-muted-foreground"
        data-offsets={JSON.stringify(offsets)}
      >
        {windowLine(logged.viewport, snap.viewport)} {alignment(offsets, samples)}
      </p>
    </>
  );
}

/** The window's size, as logged, or that none has been yet. */
function windowLine(vp: Viewport | null, drawn: Viewport | null): string {
  if (!vp) return `No window size logged yet: drawn at ${FALLBACK.width} × ${FALLBACK.height}.`;
  return drawn && drawn.height !== vp.height ? `Window ${vp.width} × ${vp.height}, drawn landscape at ${drawn.width} × ${drawn.height}.` : `Window ${vp.width} × ${vp.height}.`;
}

const REGION_NAMES: Record<string, string> = {
  threads: 'sidebar',
  chat: 'chat',
  canvas: 'document',
};

/** What the pointer was lined up by, in words. */
function alignment(offsets: Record<string, Offset>, samples: number): string {
  const parts = Object.entries(offsets)
    .filter(([, o]) => Math.round(o.dx) || Math.round(o.dy))
    .map(([r, o]) => `${REGION_NAMES[r] ?? r} ${Math.round(-o.dx)}, ${Math.round(-o.dy)} px`);
  if (samples === 0)
    return 'The pointer is drawn where it was logged; it is lined up with the drawing as clicks on named controls are played.';
  return `Pointer lined up using ${samples} click${samples === 1 ? '' : 's'} on named controls${parts.length ? `: moved ${parts.join('; ')}` : ': no change needed'}.`;
}

function Pane({
  name,
  snap,
  label,
  width,
}: {
  name: string;
  snap: Snapshot;
  label: string;
  width: number;
}) {
  switch (name) {
    case 'threads':
      return <ReplaySidebar snap={snap} label={label} width={width} />;
    case 'chat':
      return <ReplayChat snap={snap} />;
    case 'canvas':
      return <ReplayDoc snap={snap} />;
    default:
      return <p className="p-4 text-muted-foreground">{name}</p>;
  }
}
