import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PupilPrompt } from '@edw/shared';
import { setFetch } from '../api/http';
import { useAsk } from './useAsk';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const EXPLAIN: PupilPrompt = { id: 'p1', label: 'Explain', after_highlight: true, follow_up: false };
const MORE: PupilPrompt = { id: 'p2', label: "I don't understand", after_highlight: false, follow_up: true };

/** A server that answers each ask in turn with `left` follow-ups left; `hold` keeps the answers until `release`. */
function server(opts: { left?: number[]; refuse?: string; hold?: boolean } = {}) {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const waiting: (() => void)[] = [];
  let n = 0;
  setFetch(
    vi.fn(async (url: string, init?: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      const i = ++n;
      const answer = () => (opts.refuse ? json({ error: 'no', code: opts.refuse }, 409) : json({ ask: { id: `a${i}`, reply: `Reply ${i}`, follow_ups_left: opts.left?.[i - 1] ?? 1 } }));
      if (!opts.hold) return answer();
      return new Promise<Response>((resolve) => waiting.push(() => resolve(answer())));
    }) as unknown as typeof fetch,
  );
  return { sent, release: () => waiting.splice(0).forEach((f) => f()) };
}

const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));

afterEach(() => setFetch(null));

describe('useAsk', () => {
  it('sends a first ask with the prompt and passage only, then a follow-up with the newest ask as its parent', async () => {
    const { sent } = server({ left: [2, 1] });
    const { result } = renderHook(() => useAsk('r1'));
    act(() => result.current.ask(EXPLAIN, 'Rain'));
    await settle();
    expect(sent[0]).toEqual({ url: '/api/pupil/readings/r1/asks', body: { prompt_id: 'p1', highlighted_text: 'Rain' } });
    expect(result.current.chain).toEqual({ passage: 'Rain', steps: [{ id: 'a1', label: 'Explain', reply: 'Reply 1' }], follow_ups_left: 2 });

    act(() => result.current.followUp(MORE));
    await settle();
    expect(sent[1]!.body).toEqual({ prompt_id: 'p2', highlighted_text: 'Rain', parent_ask_id: 'a1' });
    act(() => result.current.followUp(MORE));
    await settle();
    expect(sent[2]!.body).toMatchObject({ parent_ask_id: 'a2' });
    expect(result.current.chain?.steps.map((s) => s.reply)).toEqual(['Reply 1', 'Reply 2', 'Reply 3']);
  });

  it('sends no follow-up once none are left', async () => {
    const { sent } = server({ left: [0] });
    const { result } = renderHook(() => useAsk('r1'));
    act(() => result.current.ask(EXPLAIN, 'Rain'));
    await settle();
    act(() => result.current.followUp(MORE));
    await settle();
    expect(sent).toHaveLength(1);
  });

  it('does nothing on a second press while one is out', async () => {
    const { sent, release } = server({ hold: true });
    const { result } = renderHook(() => useAsk('r1'));
    act(() => result.current.ask(EXPLAIN, 'Rain'));
    act(() => result.current.ask(EXPLAIN, 'Rain'));
    expect(result.current.asking).toBe(true);
    await act(async () => release());
    await settle();
    expect(sent).toHaveLength(1);
    expect(result.current.asking).toBe(false);
  });

  it('keeps the chain when an ask is refused, and says why', async () => {
    server({ left: [1] });
    const { result } = renderHook(() => useAsk('r1'));
    act(() => result.current.ask(EXPLAIN, 'Rain'));
    await settle();
    const before = result.current.chain;
    server({ refuse: 'pupil_budget_spent' });
    act(() => result.current.followUp(MORE));
    await settle();
    expect(result.current.chain).toBe(before);
    expect(result.current.refused).toBe('pupil_budget_spent');
    act(() => result.current.close());
    expect(result.current.chain).toBeNull();
    expect(result.current.refused).toBeNull();
  });

  it('drops the chain on a new reading and ignores an answer for the old one', async () => {
    server({ left: [1] });
    const { result, rerender } = renderHook(({ id }) => useAsk(id), { initialProps: { id: 'r1' } });
    act(() => result.current.ask(EXPLAIN, 'Rain'));
    await settle();
    expect(result.current.chain).not.toBeNull();

    const { release } = server({ hold: true });
    act(() => result.current.ask(EXPLAIN, 'Clouds'));
    rerender({ id: 'r2' });
    expect(result.current.chain).toBeNull();
    expect(result.current.asking).toBe(false);
    await act(async () => release());
    await settle();
    expect(result.current.chain).toBeNull();
    expect(result.current.refused).toBeNull();
  });

  it('Close while a request is out hides the answer and drops the late reply', async () => {
    server({ left: [2] });
    const { result } = renderHook(() => useAsk('r1'));
    act(() => result.current.ask(EXPLAIN, 'Rain'));
    await settle();
    const { release } = server({ hold: true });
    act(() => result.current.followUp(MORE));
    expect(result.current.asking).toBe(true);
    act(() => result.current.close());
    expect(result.current.chain).toBeNull();
    expect(result.current.asking).toBe(false);
    await act(async () => release());
    await settle();
    expect(result.current.chain).toBeNull();
    expect(result.current.asking).toBe(false);

    // A new ask works straight away.
    server({ left: [1] });
    act(() => result.current.ask(EXPLAIN, 'Clouds'));
    await settle();
    expect(result.current.chain?.passage).toBe('Clouds');
  });

  it('takes the follow-ups away when the server says they are used', async () => {
    server({ left: [2] });
    const { result } = renderHook(() => useAsk('r1'));
    act(() => result.current.ask(EXPLAIN, 'Rain'));
    await settle();
    server({ refuse: 'follow_ups_used' });
    act(() => result.current.followUp(MORE));
    await settle();
    expect(result.current.refused).toBe('follow_ups_used');
    expect(result.current.chain).toMatchObject({ passage: 'Rain', follow_ups_left: 0 });
    expect(result.current.chain?.steps).toHaveLength(1);
  });
});
