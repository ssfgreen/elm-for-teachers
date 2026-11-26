import { useCallback, useRef, useState } from 'react';
import { cn } from '../lib/utils';

const STEP = 24;

function load(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: number): void {
  try {
    localStorage.setItem(key, String(Math.round(v)));
  } catch {
    /* per-browser convenience only */
  }
}

/** Width in px of the pane before a splitter, clamped and remembered per browser. */
export function useSplitWidth(key: string, initial: number, min: number, max: () => number) {
  const [width, setWidth] = useState(() => load(key, initial));
  const clamp = useCallback((w: number) => Math.min(Math.max(w, min), Math.max(min, max())), [min, max]);
  const set = useCallback(
    (w: number) => {
      const next = clamp(w);
      setWidth(next);
      save(key, next);
    },
    [clamp, key],
  );
  return { width: clamp(width), setWidth: set };
}

export interface SplitterProps {
  label: string;
  /** Which side of the handle the resized pane is on; dragging towards it shrinks it. */
  side?: 'before' | 'after';
  /** `x` (default): a vertical line between panes side by side. `y`: a horizontal line between stacked panes. */
  axis?: 'x' | 'y';
  /** The pane's size in px along the axis: its width, or its height for `y`. */
  width: number;
  min: number;
  max: number;
  onResize: (width: number) => void;
  /** Where it is hidden (a breakpoint utility, such as `max-split:hidden`). */
  className?: string;
}

/**
 * A drag handle between two panes (pointer, touch or arrow keys): a 1px line, easy to grab
 * through a wider invisible strip (its `before:`), wider still on touch screens. While it is
 * dragged, the body has `resizing` (see splitter.css).
 */
export function Splitter({ label, side = 'before', axis = 'x', width, min, max, onResize, className }: SplitterProps) {
  const start = useRef<{ at: number; w: number } | null>(null);
  const dir = side === 'before' ? 1 : -1;
  const rows = axis === 'y';
  const at = (e: { clientX: number; clientY: number }) => (rows ? e.clientY : e.clientX);
  const done = () => document.body.classList.remove('resizing', 'resizing-rows');
  return (
    <div
      // `splitter` is a hook for splitter.css, which keeps it lit while it is dragged.
      className={cn(
        'splitter',
        'relative z-3 flex-none touch-none bg-border outline-none transition-colors duration-120 before:absolute hover:bg-primary focus-visible:bg-primary',
        rows
          ? 'h-px w-full cursor-row-resize before:inset-x-0 before:-inset-y-1.25 pointer-coarse:before:-inset-y-3'
          : 'w-px cursor-col-resize before:inset-y-0 before:-inset-x-1.25 pointer-coarse:before:-inset-x-3',
        className,
      )}
      role="separator"
      aria-orientation={rows ? 'horizontal' : 'vertical'}
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      tabIndex={0}
      onPointerDown={(e) => {
        start.current = { at: at(e), w: width };
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        document.body.classList.add('resizing', ...(rows ? ['resizing-rows'] : []));
      }}
      onPointerMove={(e) => {
        if (start.current) onResize(start.current.w + dir * (at(e) - start.current.at));
      }}
      onPointerUp={(e) => {
        start.current = null;
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
        done();
      }}
      onPointerCancel={() => {
        start.current = null;
        done();
      }}
      onKeyDown={(e) => {
        const [less, more] = rows ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
        if (e.key === less) onResize(width - dir * STEP);
        else if (e.key === more) onResize(width + dir * STEP);
        else return;
        e.preventDefault();
      }}
    />
  );
}
