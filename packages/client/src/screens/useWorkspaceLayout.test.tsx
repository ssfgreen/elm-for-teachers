import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clampShare, CHAT_SHARE, useWorkspaceLayout } from './useWorkspaceLayout';
import { setWindowWidth } from '../test-utils';

beforeEach(() => localStorage.clear());
afterEach(() => setWindowWidth(null));

describe('clampShare', () => {
  it('keeps the chat between a fifth and four fifths of the height, a third when unknown', () => {
    expect(clampShare(0.05)).toBe(CHAT_SHARE.min);
    expect(clampShare(0.95)).toBe(CHAT_SHARE.max);
    expect(clampShare(0.5)).toBe(0.5);
    expect(clampShare(Number.NaN)).toBeCloseTo(1 / 3);
  });
});

describe('useWorkspaceLayout', () => {
  it('from 1000px: side by side, sidebar open and remembered', () => {
    setWindowWidth(1200);
    const { result } = renderHook(() => useWorkspaceLayout());
    expect(result.current.docked).toBe(true);
    expect(result.current.stacked).toBe(false);
    expect(result.current.sidebar.open).toBe(true);
    act(() => result.current.sidebar.toggle());
    expect(result.current.sidebar.open).toBe(false);
    expect(localStorage.getItem('edw.threadsOpen')).toBe('closed');
  });

  it('from 820 to 999px: side by side, with the sidebar a drawer that starts closed and is not remembered', () => {
    localStorage.setItem('edw.threadsOpen', 'open');
    setWindowWidth(900);
    const { result } = renderHook(() => useWorkspaceLayout());
    expect(result.current.docked).toBe(false);
    expect(result.current.stacked).toBe(false);
    expect(result.current.sidebar.open).toBe(false);
    act(() => result.current.sidebar.toggle());
    expect(result.current.sidebar.open).toBe(true);
    expect(result.current.drawerOpen).toBe(true);
    // Picking something in it closes it.
    act(() => result.current.sidebar.picked());
    expect(result.current.sidebar.open).toBe(false);
    expect(localStorage.getItem('edw.threadsOpen')).toBe('open');
  });

  it('below 1000px the comments are a drawer: opened on request, never by the model', () => {
    setWindowWidth(900);
    const { result } = renderHook(() => useWorkspaceLayout());
    expect(result.current.comments.open).toBe(false);
    act(() => result.current.comments.show());
    expect(result.current.comments.open).toBe(false);
    act(() => result.current.comments.setOpen(true));
    expect(result.current.comments.open).toBe(true);
    // One drawer at a time.
    act(() => result.current.sidebar.toggle());
    expect(result.current.sidebar.open).toBe(true);
    expect(result.current.comments.open).toBe(false);
    expect(localStorage.getItem('edw.commentsOpen')).toBeNull();
  });

  it('below 820px: stacked, with the chat a third of the height to start, its share remembered', () => {
    setWindowWidth(400);
    const { result } = renderHook(() => useWorkspaceLayout());
    expect(result.current.stacked).toBe(true);
    expect(result.current.chat.share).toBeCloseTo(1 / 3);
    act(() => result.current.chat.setShare(0.9));
    expect(result.current.chat.share).toBe(CHAT_SHARE.max);
    expect(localStorage.getItem('edw.chatShare')).toBe('0.800');
  });
});
