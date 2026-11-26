import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionInfo } from '../api/types';
import { ComposerBar } from '../components/ComposerBar';
import { useComposerBar } from './useComposerBar';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const session = (spyglass?: SessionInfo['config']['spyglass']): SessionInfo => ({
  session_id: 'S1',
  label: 'Test',
  config: { thresholds: { selection_throttle_ms: 100, scroll_throttle_ms: 100, event_batch_ms: 500 }, ...(spyglass ? { spyglass } : {}) },
});
const api = () => ({ setTurnModel: vi.fn(), setEditMode: vi.fn(), setSpyglass: vi.fn() });

describe('the Spyglass toggle under the chat box', () => {
  it('is on to start, sends that with each turn, and when switched is logged, sent and remembered', () => {
    const a = api();
    const logger = { log: vi.fn() };
    const { result, unmount } = renderHook(() => useComposerBar({ session: session('shown_and_model'), api: a, logger }));
    expect(result.current.spyglass).toBe(true);
    expect(a.setSpyglass).toHaveBeenLastCalledWith(true);
    act(() => result.current.onSpyglassChange!(false));
    expect(logger.log).toHaveBeenCalledWith('spyglass_toggle', { on: false });
    expect(a.setSpyglass).toHaveBeenLastCalledWith(false);
    unmount();
    // Kept after a reload.
    const again = renderHook(() => useComposerBar({ session: session('shown'), api: api(), logger }));
    expect(again.result.current.spyglass).toBe(false);
  });

  it('is not offered when the deployment has Spyglass off, or the server does not say', () => {
    for (const s of [session('off'), session()]) {
      const { result, unmount } = renderHook(() => useComposerBar({ session: s, api: api() }));
      expect(result.current.onSpyglassChange).toBeUndefined();
      unmount();
    }
  });

  it('shows as a pressed icon, named on hover, and switches with a click', () => {
    const onSpyglassChange = vi.fn();
    render(<ComposerBar spyglass onSpyglassChange={onSpyglassChange} />);
    const toggle = screen.getByRole('button', { name: 'Spyglass' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.textContent).toBe('');
    expect(toggle.getAttribute('data-tip')).toBe('Spyglass: points out changes you might have missed (on)');
    fireEvent.click(toggle);
    expect(onSpyglassChange).toHaveBeenCalledWith(false);
  });
});

describe('the assistant mode under the chat box', () => {
  it('is Suggesting to start; each mode sends Suggesting or Editing, with the look, and is remembered', () => {
    const a = api();
    const { result, unmount } = renderHook(() => useComposerBar({ session: session(), api: a }));
    expect(result.current).toMatchObject({ editMode: 'suggest', suggestView: 'inline' });
    expect(a.setEditMode).toHaveBeenLastCalledWith('suggest', 'inline');
    act(() => result.current.onEditModeChange('track'));
    expect(result.current).toMatchObject({ editMode: 'track', suggestView: 'track' });
    // Track changes is Suggesting on the server: only the look differs.
    expect(a.setEditMode).toHaveBeenLastCalledWith('suggest', 'track');
    act(() => result.current.onEditModeChange('edit'));
    expect(a.setEditMode).toHaveBeenLastCalledWith('edit', 'inline');
    act(() => result.current.onEditModeChange('track'));
    unmount();
    expect(renderHook(() => useComposerBar({ session: session(), api: api() })).result.current.editMode).toBe('track');
  });
});
