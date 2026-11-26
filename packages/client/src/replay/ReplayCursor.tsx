/**
 * The pointer and clicks over the replayed window. Each is drawn where it was logged, shifted by
 * its region's offset (calibration.ts); then, once the frame is laid out, kept on what it was
 * over (anchor.ts): a click on the control it names, a point on the block or card it was over.
 * The pointer follows a click it made, so it is seen to press the button.
 */
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { MousePointer2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { targetBox } from './anchor';
import { clampInto, controlName, regionAt, shifted, type Offset } from './calibration';
import { CLICK_MS, type ShownClick, type Snapshot } from './snapshot';

/** A pointer this near a click, this soon after it, moves with the click. */
const WITH_CLICK_PX = 30;
const WITH_CLICK_MS = 400;

export function ReplayCursor({ snap, offsets, root }: { snap: Snapshot; offsets: Record<string, Offset>; root: RefObject<HTMLElement> }) {
  const vp = snap.viewport;
  const at = (x: number, y: number) => shifted(offsets, vp, x, y);
  const pointerRef = useRef<SVGSVGElement>(null);
  const clickRefs = useRef<(HTMLSpanElement | null)[]>([]);
  // Where each click's control was, seen as playback came up to it: an Accept is gone once clicked.
  const seen = useRef(new Map<number, { dx: number; dy: number }>());

  useLayoutEffect(() => {
    const r = root.current;
    if (!r) return;
    const delta = (c: ShownClick) => {
      // Once clicked, what the teacher saw just before is the truth; the click may have changed it.
      const known = seen.current.get(c.t);
      if (known && c.ageMs >= 0) return known;
      const p = at(c.x, c.y);
      const box = targetBox(r, { block_id: c.block_id, item: c.item, name: c.label ? controlName(c.label) : null, region: regionAt(vp, c.x, c.y) }, p);
      if (!box) return known ?? { dx: 0, dy: 0 };
      const q = clampInto(p, box);
      const d = { dx: q.x - p.x, dy: q.y - p.y };
      seen.current.set(c.t, d);
      return d;
    };
    const moved = [...snap.upcoming, ...snap.clicks].map((c) => ({ c, ...delta(c) }));
    snap.clicks.forEach((c, i) => {
      const el = clickRefs.current[i];
      const m = moved.find((x) => x.c === c);
      if (el && m) el.style.transform = `translate(${m.dx}px, ${m.dy}px)`;
    });
    const el = pointerRef.current;
    const ptr = snap.pointer;
    if (!el || !ptr) return;
    const p = at(ptr.x, ptr.y);
    const click = moved.find((m) => Math.abs(m.c.ageMs) < WITH_CLICK_MS && Math.hypot(m.c.x - ptr.x, m.c.y - ptr.y) < WITH_CLICK_PX);
    let q = p;
    if (click) q = { x: p.x + click.dx, y: p.y + click.dy };
    else if (ptr.idleMs < 3000) {
      const box = targetBox(r, { block_id: ptr.block_id, item: ptr.item, region: regionAt(vp, ptr.x, ptr.y) });
      if (box) q = clampInto(p, box);
    }
    el.style.transform = `translate(${q.x - p.x}px, ${q.y - p.y}px)`;
  });

  const pointer = snap.pointer ? { ...snap.pointer, ...at(snap.pointer.x, snap.pointer.y) } : null;
  return (
    <>
      {snap.clicks.map((c, i) => {
        const p = at(c.x, c.y);
        return (
          <span key={i} ref={(el) => void (clickRefs.current[i] = el)} data-click="" className="absolute top-0 left-0 z-50">
            <Click x={p.x} y={p.y} ageMs={c.ageMs} label={c.label} />
          </span>
        );
      })}
      {pointer && (
        <MousePointer2
          ref={pointerRef}
          aria-label="Pointer"
          className={cn('absolute z-50 size-7 fill-foreground stroke-card transition-opacity', pointer.idleMs > 3000 && 'opacity-40')}
          style={{ left: pointer.x - 4, top: pointer.y - 3 }}
        />
      )}
    </>
  );
}

function Click({ x, y, ageMs, label }: { x: number; y: number; ageMs: number; label: string | null }) {
  const f = ageMs / CLICK_MS;
  const size = 16 + 40 * f;
  return (
    <>
      <span
        data-click-at=""
        className="pointer-events-none absolute rounded-full border-4 border-mark bg-mark-soft"
        style={{ left: x - size / 2, top: y - size / 2, width: size, height: size, opacity: 1 - f }}
      />
      {label && (
        <span className="absolute rounded-sm bg-foreground px-2 py-0.5 text-md whitespace-nowrap text-background" style={{ left: x + 18, top: y + 16, opacity: 1 - f * f }}>
          {label}
        </span>
      )}
    </>
  );
}
