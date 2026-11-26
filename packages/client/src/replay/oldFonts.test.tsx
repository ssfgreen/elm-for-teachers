/**
 * Sessions recorded before 12 Nov 2026: a doc could be set in Comic Sans (no longer offered), and
 * a doc with no font was in Word's Aptos (now Calibri). Their bundles must still draw, in a font
 * the app has: the machine's own, or the free twin bundled with the app (styles/index.css).
 *
 * The page's font passes for any font value in the bundle, because the replay does not read a
 * doc's style at all (snapshot.ts builds docs without it) and draws every page in the default.
 * These tests hold that outcome, and would catch a font that cannot be drawn if the replay comes
 * to follow the style. Only the text set in Comic Sans is drawn from the stored font today.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReplayBundle } from './bundle';
import { ReplayPlayer } from './ReplayPlayer';
import { bundle, ev, T0, text } from './replayTestKit';

afterEach(cleanup);

/** The fonts bundled with the app that a page or a run of text can fall back on. */
const BUNDLED = /Carlito|Comic Neue/;

/** Two docs as docs.json had them then: d1 set in Comic Sans (Word's "Comic Sans MS"), d2 with no font. */
function oldBundle(): ReplayBundle {
  const b = bundle(
    [
      ev(0, 'thread_create', { thread_id: 'th1' }),
      ev(0, 'doc_create', { doc_id: 'd1', thread_id: 'th1', name: 'In Comic Sans', style: { font: 'comic_sans' } }),
      ev(1000, 'doc_style', { doc_id: 'd1', style: { font: 'comic_sans' } }),
      ev(3000, 'doc_create', { doc_id: 'd2', thread_id: 'th1', name: 'No font' }, { doc_id: 'd2' }),
      ev(3000, 'doc_open', { doc_id: 'd2' }, { doc_id: 'd2' }),
      ev(5000, 'click', { x: 5, y: 5, control: null }, { doc_id: 'd2' }),
    ],
    [
      text(1, 2000, 'b1', [{ insert: 'A simile is <span data-font="comic_sans">like silk</span>' }]),
      { ...text(2, 4000, 'b3', [{ insert: 'Plain words' }]), doc_id: 'd2' },
    ],
  );
  return {
    ...b,
    blocks: [...b.blocks, { id: 'b3', doc_id: 'd2', type: 'paragraph', order: 0 }],
    docs: [
      { id: 'd1', name: 'In Comic Sans', thread_id: 'th1', style: { font: 'comic_sans' } } as ReplayBundle['docs'][number],
      { id: 'd2', name: 'No font', thread_id: 'th1' },
    ],
  };
}

function seek(ms: number) {
  const bar = screen.getByLabelText('Position in the replay');
  act(() => {
    fireEvent.change(bar, { target: { value: String(T0 + ms) } });
  });
}
const page = () => document.querySelector<HTMLElement>('.replay-stage .canvas')!;

describe('replaying a session from before 12 Nov 2026', () => {
  it('draws a doc set in Comic Sans, and its text set in Comic Sans, in fonts the app has', () => {
    render(<ReplayPlayer bundle={oldBundle()} />);
    seek(2500);
    expect(page().dataset.docId).toBe('d1');
    expect(page().style.fontFamily).toMatch(BUNDLED);
    const run = screen.getByText('like silk');
    expect(run.style.fontFamily).toMatch(BUNDLED);
    expect(page().textContent).toContain('A simile is like silk');
  });

  it('draws a doc with no font in the default the app has now', () => {
    render(<ReplayPlayer bundle={oldBundle()} />);
    seek(4500);
    expect(page().dataset.docId).toBe('d2');
    expect(page().style.fontFamily).toMatch(BUNDLED);
    expect(page().textContent).toContain('Plain words');
  });
});
