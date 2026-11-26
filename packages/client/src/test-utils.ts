/** Shared test fixtures for the client. */
import type { Doc, Thread } from '@edw/shared';
import { vi } from 'vitest';
import type { SessionInfo } from './api/types';
import type { EventLogger } from './events/logger';
import type { PublicBlock } from './editor/types.js';

export const TEST_THRESHOLDS: SessionInfo['config']['thresholds'] = {
  selection_throttle_ms: 250,
  scroll_throttle_ms: 500,
  event_batch_ms: 500,
};

/** Fixed ids for the default thread and doc in tests. */
export const THREAD_ID = '01JTHREAD00000000000000000';
export const DOC_ID = '01JD0C00000000000000000000';

export function makeSession(p: Partial<SessionInfo> = {}): SessionInfo {
  return { session_id: 'S1', label: 'Year 7 English', config: { thresholds: TEST_THRESHOLDS }, ...p };
}

export function mockLogger(): EventLogger & { log: ReturnType<typeof vi.fn> } {
  return {
    log: vi.fn(() => 'EVT'),
    pending: () => 0,
    flush: () => Promise.resolve(),
    onError: () => () => undefined,
    stop: () => undefined,
  } as EventLogger & { log: ReturnType<typeof vi.fn> };
}

export function testBlock(p: Partial<PublicBlock> & { id: string }): PublicBlock {
  return {
    session_id: 'S1',
    doc_id: DOC_ID,
    type: 'paragraph',
    content: 'text',
    status: 'live',
    version: 1,
    derived_from: null,
    order: 0,
    pending: null,
    created_at: '2026-10-28T10:00:00.000Z',
    updated_at: '2026-10-28T10:00:00.000Z',
    ...p,
  };
}

export function testDoc(p: Partial<Doc> & { id: string }): Doc {
  return { session_id: 'S1', thread_id: THREAD_ID, name: 'Untitled', created_by: 'teacher', created_at: '2026-10-28T10:00:00.000Z', ...p };
}

export function testThread(p: Partial<Thread> & { id: string }): Thread {
  return { session_id: 'S1', title: 'Untitled', project_id: null, created_at: '2026-10-28T10:00:00.000Z', ...p };
}

/** jsdom has no IntersectionObserver; trackers need one. */
export function installIntersectionObserver(): void {
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
}

/**
 * Layout APIs ProseMirror and floating-ui touch that jsdom lacks. Positions all
 * come back as zero; tests assert on documents and events, not geometry.
 */
export function installEditorPolyfills(): void {
  const zeroRect = (): DOMRect => ({ x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect;
  const rangeProto = Range.prototype as unknown as Record<string, unknown>;
  if (typeof rangeProto.getClientRects !== 'function') {
    rangeProto.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} });
  }
  if (typeof rangeProto.getBoundingClientRect !== 'function') rangeProto.getBoundingClientRect = zeroRect;
  const elProto = Element.prototype as unknown as Record<string, unknown>;
  if (typeof elProto.getClientRects !== 'function') {
    elProto.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} });
  }
  const doc = document as unknown as Record<string, unknown>;
  if (typeof doc.elementFromPoint !== 'function') doc.elementFromPoint = () => null;
  if (typeof elProto.scrollIntoView !== 'function') elProto.scrollIntoView = () => undefined;
}

/**
 * Pretends the window is `width` px wide for min-width media queries in rem (16px each);
 * null takes matchMedia away again (jsdom has none), which the layout reads as a wide window.
 */
export function setWindowWidth(width: number | null): void {
  if (width === null) {
    delete (window as { matchMedia?: unknown }).matchMedia;
    return;
  }
  window.matchMedia = ((query: string) => {
    const rem = /min-width:\s*([\d.]+)rem/.exec(query);
    return {
      matches: rem ? width >= Number(rem[1]) * 16 : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}
