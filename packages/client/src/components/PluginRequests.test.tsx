import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PluginInfo } from '@edw/shared';
import { PluginRequests } from './PluginRequests';
import { allowedMessage, pendingRequests, usePluginRequests } from './usePluginRequests';

const trails: PluginInfo = { id: 'trails', kind: 'library', name: 'TRAILS', publisher: 'TRAILS', description: 'AI literacy.', licence: 'x', tags: [], trust: 'ask', available: true, requested: true, allowed: false };
const envelope = { client_ts: '2026-11-08T09:00:00.000Z', focus_pane: 'chat' as const, doc_id: null, thread_id: null };

afterEach(cleanup);

describe('Ask first in a chat', () => {
  it('counts only plugins asked for, not allowed and not put off', () => {
    const others: PluginInfo[] = [{ ...trails, id: 'a', allowed: true }, { ...trails, id: 'b', requested: false }, { ...trails, id: 'c', trust: 'use' }];
    expect(pendingRequests([trails, ...others], new Set()).map((p) => p.id)).toEqual(['trails']);
    expect(pendingRequests([trails], new Set(['trails']))).toEqual([]);
  });

  it('checks again when a turn ends; Allow saves it and tells the assistant in the chat', async () => {
    const listPlugins = vi.fn(async (): Promise<PluginInfo[]> => [{ ...trails, requested: false }]);
    const allowPlugin = vi.fn(async () => ({ ...trails, allowed: true }));
    const send = vi.fn();
    const { result, rerender } = renderHook(({ sending }) => usePluginRequests({ api: { listPlugins, allowPlugin }, threadId: 'T1', getEnvelope: () => envelope, sending, send }), { initialProps: { sending: false } });
    await waitFor(() => expect(listPlugins).toHaveBeenCalledTimes(1));
    expect(result.current.pending).toEqual([]);
    listPlugins.mockResolvedValue([trails]);
    rerender({ sending: true });
    rerender({ sending: false });
    await waitFor(() => expect(result.current.pending.map((p) => p.id)).toEqual(['trails']));
    await act(() => result.current.allow(trails));
    expect(allowPlugin).toHaveBeenCalledWith('trails', 'T1', envelope);
    expect(send).toHaveBeenCalledWith(allowedMessage('TRAILS'));
    expect(result.current.pending).toEqual([]);
  });

  it('treats an answer that is not a list as no plugins, rather than failing the chat', async () => {
    const listPlugins = vi.fn(async () => undefined as unknown as PluginInfo[]);
    const { result } = renderHook(() => usePluginRequests({ api: { listPlugins }, threadId: 'T1', getEnvelope: () => envelope, sending: false, send: vi.fn() }));
    await waitFor(() => expect(listPlugins).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current.pending).toEqual([]);
  });

  it('shows each request with Allow and Not now', () => {
    const onAllow = vi.fn(async () => {});
    const onDismiss = vi.fn();
    render(<PluginRequests pending={[trails]} onAllow={onAllow} onDismiss={onDismiss} />);
    expect(screen.getByText(/would like to look in/).textContent).toContain('TRAILS');
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onDismiss).toHaveBeenCalledWith('trails');
    fireEvent.click(screen.getByRole('button', { name: 'Allow in this chat' }));
    expect(onAllow).toHaveBeenCalledWith(trails);
    // While it saves, neither button can be pressed again.
    expect(screen.getByRole('button', { name: 'Not now' })).toHaveProperty('disabled', true);
  });
});
