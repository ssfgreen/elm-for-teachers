import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReplayPlayer } from './ReplayPlayer';
import { bundle, ev, text, turn } from './replayTestKit';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const testBundle = () =>
  bundle(
    [
      ev(0, 'doc_create', { doc_id: 'd1', thread_id: 'th1', name: 'Poems' }),
      ev(0, 'thread_create', { thread_id: 'th1' }),
      ev(1000, 'chat_prompt', { turn_id: 't1', text: 'Add a title' }),
      ev(4000, 'chat_response', { turn_id: 't1', text: 'Added.', operations: [{}] }),
      ev(9000, 'click', { x: 5, y: 5, control: null }),
    ],
    [text(1, 6000, 'b1', [{ insert: 'A poem' }])],
    [turn('t1', 'Add a title', 'Added.')],
  );

describe('ReplayPlayer', () => {
  it('cycles rewind and fast-forward through ×2 and ×5, and Play goes back to normal speed', () => {
    render(<ReplayPlayer bundle={testBundle()} />);
    const ff = screen.getByRole('button', { name: 'Fast forward' });
    fireEvent.click(ff);
    expect(ff.textContent).toBe('×2');
    fireEvent.click(ff);
    expect(ff.textContent).toBe('×5');
    const rw = screen.getByRole('button', { name: 'Rewind' });
    fireEvent.click(rw);
    expect(rw.textContent).toBe('×2');
    expect(ff.textContent).toBe('');
    fireEvent.click(rw);
    expect(rw.textContent).toBe('×5');
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    expect(rw.textContent).toBe('');
  });

  it('fast-forwards from the start even when the first frame is stamped before the press', () => {
    // A frame's time is when the frame began, which can be before the click it draws.
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    render(<ReplayPlayer bundle={testBundle()} />);
    const ff = screen.getByRole('button', { name: 'Fast forward' });
    fireEvent.click(ff);
    const stamp = performance.now() - 5;
    act(() => frames.splice(0).forEach((frame) => frame(stamp)));
    expect(ff.textContent).toBe('×2');
  });

  it('scrubs to a moment, showing the chat and the document as they were then', () => {
    render(<ReplayPlayer bundle={testBundle()} />);
    expect(screen.queryByText('Add a title')).toBeNull();
    const bar = screen.getByLabelText('Position in the replay') as HTMLInputElement;
    act(() => {
      fireEvent.change(bar, { target: { value: String(Number(bar.min) + 5000) } });
    });
    expect(screen.getAllByText('Add a title').length).toBeGreaterThan(0);
    expect(screen.getByText('Added.')).toBeTruthy();
    expect(screen.queryByText('A poem')).toBeNull();
    act(() => {
      fireEvent.change(bar, { target: { value: String(Number(bar.min) + 7000) } });
    });
    expect(screen.getByText('A poem')).toBeTruthy();
  });

  it('jumps to just before a moment chosen in the list, so it can be seen happening', () => {
    render(<ReplayPlayer bundle={testBundle()} />);
    fireEvent.click(screen.getByRole('button', { name: /Assistant replied/ }));
    expect(screen.getByLabelText('Time').textContent).toBe('0:03 / 0:09');
    expect(screen.queryByText('Added.')).toBeNull();
  });
});
