import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setFetch } from '../api/http';
import { useReading } from './useReading';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const reading = (id: string) => ({ id, name: id, class_name: '8B', blocks: [], prompts: [], follow_ups_max: 3 });

afterEach(() => setFetch(null));

describe('useReading', () => {
  it('drops a save that answers after the page moved to another reading', async () => {
    let answer: (r: Response) => void = () => {};
    setFetch(
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') return new Promise<Response>((resolve) => (answer = resolve));
        if (url.endsWith('/highlights')) return json({ highlights: [] });
        return json({ reading: reading(url.split('/').at(-1)!) });
      }) as unknown as typeof fetch,
    );
    const { result, rerender } = renderHook(({ id }) => useReading(id), { initialProps: { id: 'r1' } });
    await waitFor(() => expect(result.current.load.status).toBe('ready'));
    let saving: Promise<boolean> = Promise.resolve(false);
    act(() => {
      saving = result.current.add({ block_id: 'b', start: 0, end: 1, category: null });
    });
    rerender({ id: 'r2' });
    await waitFor(() => expect(result.current.load).toMatchObject({ status: 'ready', reading: { id: 'r2' } }));
    await act(async () => {
      answer(json({ highlight: { id: 'h1', block_id: 'b', start: 0, end: 1, category: null, created_at: 'x' } }, 201));
      await saving;
    });
    expect(result.current.highlights).toEqual([]);
  });
});
