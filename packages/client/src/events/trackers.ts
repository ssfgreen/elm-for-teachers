/**
 * Interaction trackers. Every listener is attached to an element inside the tool
 * (a pane or the tool root), never to window or document keys (dev spec section 11).
 * Each tracker has a plain `attach*` function (testable, returns a detach function)
 * and a React hook wrapper.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { FocusPane } from '@edw/shared';
import type { EventLogger } from './logger';

/* ------------------------------------------------------------------ throttle */

export interface Throttled<T> {
  (value: T): void;
  /** Emit any pending trailing value now. */
  flush(): void;
  cancel(): void;
}

/**
 * Leading edge plus trailing call: the first call fires immediately; calls inside
 * the window are collapsed to the latest value, which fires when the window ends,
 * so the last value is never lost.
 */
export function createThrottle<T>(
  ms: number,
  fn: (value: T) => void,
  now: () => number = () => Date.now(),
): Throttled<T> {
  let lastFire = -Infinity;
  let pending: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fire = (value: T) => {
    lastFire = now();
    fn(value);
  };
  const throttled = ((value: T) => {
    const elapsed = now() - lastFire;
    if (elapsed >= ms && timer === null) {
      fire(value);
      return;
    }
    pending = { value };
    if (timer === null) {
      timer = setTimeout(() => {
        timer = null;
        throttled.flush();
      }, Math.max(0, ms - elapsed));
    }
  }) as Throttled<T>;
  throttled.flush = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (pending) {
      const { value } = pending;
      pending = null;
      fire(value);
    }
  };
  throttled.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending = null;
  };
  return throttled;
}

/* ---------------------------------------------------------------- focus pane */

export interface PaneElements {
  threads: HTMLElement | null;
  canvas: HTMLElement | null;
  chat: HTMLElement | null;
}
export type PaneRefs = { threads: RefObject<HTMLElement>; canvas: RefObject<HTMLElement>; chat: RefObject<HTMLElement> };

/** Mutable holder for the current pane; pass `get` as the logger's `getFocusPane`. */
export interface FocusPaneState {
  get: () => FocusPane;
  set: (pane: FocusPane) => void;
}
export function createFocusPaneState(initial: FocusPane = 'none'): FocusPaneState {
  let current = initial;
  return { get: () => current, set: (p) => (current = p) };
}

export function closestBlockId(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  return target.closest('[data-block-id]')?.getAttribute('data-block-id') ?? null;
}

function paneOf(target: EventTarget | null, panes: PaneElements): FocusPane {
  if (!(target instanceof Node)) return 'none';
  for (const name of ['threads', 'canvas', 'chat'] as const) {
    if (panes[name]?.contains(target)) return name;
  }
  return 'none';
}

/**
 * Logs `focus` whenever the pane or the focused block changes. Listens to `focusin`
 * and `pointerdown` on each pane element. Moving focus to something outside all
 * panes (relatedTarget set) records `none`; a focusout with no relatedTarget is
 * ignored because clicking non-focusable text inside a pane would otherwise flicker.
 */
export function attachFocusTracking(
  logger: Pick<EventLogger, 'log'>,
  panes: PaneElements,
  state: FocusPaneState,
): () => void {
  let lastBlock: string | null = null;
  let started = false;
  const change = (pane: FocusPane, blockId: string | null) => {
    if (started && pane === state.get() && blockId === lastBlock) return;
    started = true;
    // Log with the new pane already in effect so the envelope's focus_pane matches the payload.
    state.set(pane);
    lastBlock = blockId;
    logger.log('focus', { pane, block_id: blockId });
  };
  const onIn = (e: Event) => change(paneOf(e.target, panes), closestBlockId(e.target));
  const onOut = (e: FocusEvent) => {
    if (e.relatedTarget instanceof Node && paneOf(e.relatedTarget, panes) === 'none') change('none', null);
  };
  const els = [panes.threads, panes.canvas, panes.chat].filter((x): x is HTMLElement => x !== null);
  for (const el of els) {
    el.addEventListener('focusin', onIn);
    el.addEventListener('pointerdown', onIn);
    el.addEventListener('focusout', onOut);
  }
  return () => {
    for (const el of els) {
      el.removeEventListener('focusin', onIn);
      el.removeEventListener('pointerdown', onIn);
      el.removeEventListener('focusout', onOut);
    }
  };
}

/** Returns the pane state; create the logger with `getFocusPane: state.get`. */
export function useFocusPaneTracking(
  logger: Pick<EventLogger, 'log'>,
  panes: PaneRefs,
  state: FocusPaneState,
): () => FocusPane {
  useEffect(
    () =>
      attachFocusTracking(
        logger,
        { threads: panes.threads.current, canvas: panes.canvas.current, chat: panes.chat.current },
        state,
      ),
    [logger, panes.threads, panes.canvas, panes.chat, state],
  );
  return state.get;
}

/* -------------------------------------------------------------------- scroll */

export function attachScrollTracking(
  logger: Pick<EventLogger, 'log'>,
  pane: FocusPane,
  el: HTMLElement,
  throttleMs = 500,
  now?: () => number,
): () => void {
  const t = createThrottle<number>(throttleMs, (position) => logger.log('scroll', { pane, position }), now);
  // Scroll events do not bubble, so listen in the capture phase: the pane itself, or an
  // inner element marked `data-scroll-root` (the canvas scrolls inside a fixed header).
  // Other inner scrollers (a wide table, a menu list) are not page position and are ignored.
  const onScroll = (e: Event) => {
    const target = e.target;
    if (target === el) t(el.scrollTop);
    else if (target instanceof HTMLElement && target.hasAttribute('data-scroll-root') && el.contains(target)) t(target.scrollTop);
  };
  el.addEventListener('scroll', onScroll, { passive: true, capture: true });
  return () => {
    el.removeEventListener('scroll', onScroll, { capture: true });
    t.flush();
  };
}

/**
 * The Word preview's scrolling (`el` is its scrolling body). The preview is a dialog outside the
 * panes, so it has its own event with how far the pages can scroll, and a doc rather than a pane.
 */
export function attachPreviewScrollTracking(
  logger: Pick<EventLogger, 'log'>,
  docId: string,
  el: HTMLElement,
  throttleMs = 500,
  now?: () => number,
): () => void {
  const t = createThrottle<{ position: number; max: number }>(throttleMs, (at) => logger.log('preview_scroll', { doc_id: docId, ...at }), now);
  // Only the body itself: a scroller inside the pages (a wide table) is not how far down they are.
  const onScroll = (e: Event) => {
    if (e.target === el) t({ position: Math.max(0, el.scrollTop), max: Math.max(0, el.scrollHeight - el.clientHeight) });
  };
  el.addEventListener('scroll', onScroll, { passive: true });
  return () => {
    el.removeEventListener('scroll', onScroll);
    t.flush();
  };
}

export function useScrollTracking(
  logger: Pick<EventLogger, 'log'>,
  pane: FocusPane,
  ref: RefObject<HTMLElement>,
  throttleMs = 500,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return attachScrollTracking(logger, pane, el, throttleMs);
  }, [logger, pane, ref, throttleMs]);
}

/* ------------------------------------------------------------ block visibility */

export interface BlockVisibility {
  /** Observe any `[data-block-id]` elements not yet observed; unobserve removed ones. */
  refresh(): void;
  detach(): void;
}

export function attachBlockVisibility(logger: Pick<EventLogger, 'log'>, root: HTMLElement): BlockVisibility {
  const observed = new Set<Element>();
  const visible = new Set<Element>();
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const id = entry.target.getAttribute('data-block-id');
      if (!id) continue;
      if (entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
      logger.log('block_visible', { block_id: id, visible: entry.isIntersecting });
    }
  });
  const refresh = () => {
    const present = new Set(root.querySelectorAll('[data-block-id]'));
    for (const el of present) {
      if (!observed.has(el)) {
        observed.add(el);
        io.observe(el);
      }
    }
    for (const el of [...observed]) {
      if (present.has(el)) continue;
      observed.delete(el);
      io.unobserve(el);
      const id = el.getAttribute('data-block-id');
      if (visible.delete(el) && id) logger.log('block_visible', { block_id: id, visible: false });
    }
  };
  const mo = new MutationObserver(refresh);
  mo.observe(root, { childList: true, subtree: true });
  refresh();
  return {
    refresh,
    detach() {
      mo.disconnect();
      io.disconnect();
    },
  };
}

/** Observes blocks, including ones added later. Returns `refresh` for explicit calls after a re-render. */
export function useBlockVisibility(logger: Pick<EventLogger, 'log'>, rootRef: RefObject<HTMLElement>): () => void {
  const handle = useRef<BlockVisibility | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    handle.current = attachBlockVisibility(logger, root);
    return () => {
      handle.current?.detach();
      handle.current = null;
    };
  }, [logger, rootRef]);
  return useCallback(() => handle.current?.refresh(), []);
}

/* --------------------------------------------------------------------- paste */

export type PasteSource = 'internal' | 'external' | 'inferred_external';
export type PasteTarget = { kind: 'block'; block_id: string } | { kind: 'chat' };

/** Insertions longer than this with no readable clipboard data are inferred to be external. */
export const INFERRED_EXTERNAL_MIN_LENGTH = 20;

export interface ClipboardMarker {
  /**
   * Rule for `source`:
   *  - internal: a copy/cut inside the tool root was seen and the pasted text equals what was copied.
   *  - external: clipboard text is readable and does not match the in-tool copy (no internal marker).
   *  - inferred_external: no clipboard data is readable and the insertion is over 20 characters.
   *  - null: no clipboard data readable and 20 characters or fewer; not logged as a paste.
   */
  classify(clipboardText: string | null | undefined, insertedLength: number): PasteSource | null;
  detach(): void;
}

/** Marks copies and cuts that originate inside the tool root. Only the root's own copy/cut events are heard. */
export function attachClipboardMarker(root: HTMLElement): ClipboardMarker {
  let marker: string | null = null;
  const onCopy = () => {
    marker = root.ownerDocument.getSelection()?.toString() ?? '';
  };
  root.addEventListener('copy', onCopy);
  root.addEventListener('cut', onCopy);
  return {
    classify(text, insertedLength) {
      if (text) return marker !== null && marker === text ? 'internal' : 'external';
      return insertedLength > INFERRED_EXTERNAL_MIN_LENGTH ? 'inferred_external' : null;
    },
    detach() {
      root.removeEventListener('copy', onCopy);
      root.removeEventListener('cut', onCopy);
    },
  };
}

export function logPaste(
  logger: Pick<EventLogger, 'log'>,
  target: PasteTarget,
  length: number,
  source: PasteSource,
): string {
  return logger.log('paste', { target, length, source });
}
