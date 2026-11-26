import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Thread } from '@edw/shared';
import { mockLogger, testThread, THREAD_ID } from '../test-utils';
import { useAutoName } from './useAutoName';

const envelope = { client_ts: '2026-11-12T09:00:00.000Z', focus_pane: 'chat' as const, doc_id: null, thread_id: null };

function setup(first: Thread, nameThread: (id: string, env: unknown, opts?: { auto?: boolean }) => Promise<Thread>) {
  const logger = mockLogger();
  const hook = renderHook(() => {
    const [threads, setThreads] = useState<Thread[]>([first]);
    const afterTurn = useAutoName({ api: { nameThread }, getEnvelope: () => envelope, threads, setThreads, logger });
    return { threads, setThreads, afterTurn };
  });
  return { hook, logger };
}

describe('useAutoName', () => {
  it('asks the server to name an Untitled chat after a turn, and shows the name', async () => {
    const nameThread = vi.fn(async () => testThread({ id: THREAD_ID, title: 'Similes homework (P7)' }));
    const { hook } = setup(testThread({ id: THREAD_ID, title: 'Untitled' }), nameThread);
    await act(async () => hook.result.current.afterTurn(THREAD_ID));
    expect(nameThread).toHaveBeenCalledWith(THREAD_ID, envelope, { auto: true });
    expect(hook.result.current.threads[0]!.title).toBe('Similes homework (P7)');
  });

  it('does not ask for a chat that already has a name', async () => {
    const nameThread = vi.fn(async () => testThread({ id: THREAD_ID, title: 'x' }));
    const { hook } = setup(testThread({ id: THREAD_ID, title: 'My similes' }), nameThread);
    await act(async () => hook.result.current.afterTurn(THREAD_ID));
    expect(nameThread).not.toHaveBeenCalled();
  });

  it('keeps a name the teacher typed while the server was answering', async () => {
    let answer!: (t: Thread) => void;
    const nameThread = vi.fn(() => new Promise<Thread>((r) => (answer = r)));
    const { hook } = setup(testThread({ id: THREAD_ID, title: 'Untitled' }), nameThread);
    let done!: Promise<void>;
    act(() => {
      done = hook.result.current.afterTurn(THREAD_ID);
    });
    act(() => hook.result.current.setThreads([testThread({ id: THREAD_ID, title: 'My similes' })]));
    await act(async () => {
      answer(testThread({ id: THREAD_ID, title: 'Similes homework (P7)' }));
      await done;
    });
    expect(hook.result.current.threads[0]!.title).toBe('My similes');
  });

  it('asks once at a time for a chat, and fails quietly (logged, no notice)', async () => {
    const nameThread = vi.fn(() => Promise.reject(new Error('offline')));
    const { hook, logger } = setup(testThread({ id: THREAD_ID, title: 'Untitled' }), nameThread);
    await act(async () => {
      await Promise.all([hook.result.current.afterTurn(THREAD_ID), hook.result.current.afterTurn(THREAD_ID)]);
    });
    expect(nameThread).toHaveBeenCalledTimes(1);
    expect(hook.result.current.threads[0]!.title).toBe('Untitled');
    expect(logger.log).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.stringContaining('offline') }));
  });
});
