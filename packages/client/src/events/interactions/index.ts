/**
 * Interaction logging (shared/src/events/interactions.ts): pointer, clicks, layout, dialogs
 * and menus, the page in front or not, selections outside the editor. On only while the admin
 * has it on for the workspace: the server says so in the session's config and in each answer
 * to a batch of events, and drops these events while it is off.
 *
 * Most listeners are on the document, not the workspace: menus and dialogs render in portals
 * outside it. No key presses are listened for.
 */
import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { EventLogger } from '../logger';
import { attachClickTracking } from './click';
import { attachPageState } from './pageState';
import { attachPointerSampling } from './pointer';
import { attachTextSelect } from './textSelect';
import { attachUiStateTracking } from './uiState';
import { attachViewportTracking } from './viewport';

export interface InteractionOptions {
  selectionThrottleMs?: number;
}

export function attachInteractionTracking(logger: Pick<EventLogger, 'log'>, root: HTMLElement, opts: InteractionOptions = {}): () => void {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  if (!win) return () => undefined;
  const detach = [
    attachPageState(logger, win),
    attachViewportTracking(logger, win, root),
    attachUiStateTracking(logger, doc),
    attachPointerSampling(logger, doc),
    attachClickTracking(logger, doc),
    attachTextSelect(logger, doc, opts.selectionThrottleMs),
  ];
  return () => detach.forEach((off) => off());
}

/** Tracks while `enabled`; turning it off stops at once (pointer samples waiting are sent, and dropped by the server if it is off). */
export function useInteractionTracking(logger: Pick<EventLogger, 'log'>, rootRef: RefObject<HTMLElement | null>, enabled: boolean, opts: InteractionOptions = {}): void {
  const { selectionThrottleMs } = opts;
  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) return;
    return attachInteractionTracking(logger, root, { selectionThrottleMs });
  }, [logger, rootRef, enabled, selectionThrottleMs]);
}
