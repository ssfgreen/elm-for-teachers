import { describe, expect, it } from 'vitest';
import { enqueue, idle, type ReaderValue } from './useReaderSettings';

/** A send whose requests are settled by hand, in the order they were sent. */
function manual() {
  const sent: { value: ReaderValue; settle: (ok: boolean) => void }[] = [];
  const send = (value: ReaderValue) => new Promise<void>((resolve, reject) => sent.push({ value, settle: (ok) => (ok ? resolve() : reject(new Error('400'))) }));
  return { sent, send };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('enqueue', () => {
  it('sends one at a time, and only the newest value waiting', async () => {
    const q = idle();
    const { sent, send } = manual();
    const a = enqueue(q, 1, send);
    const b = enqueue(q, 2, send);
    const c = enqueue(q, 3, send);
    expect(sent.map((s) => s.value)).toEqual([1]);
    expect(await b).toBe('stale');
    sent[0]!.settle(true);
    expect(await a).toBe('stale');
    await tick();
    expect(sent.map((s) => s.value)).toEqual([1, 3]);
    sent[1]!.settle(true);
    expect(await c).toBe('saved');
    expect(q.busy).toBe(false);
  });

  it('says failed for a refused save with nothing behind it, and carries on with the next', async () => {
    const q = idle();
    const { sent, send } = manual();
    const a = enqueue(q, 1, send);
    sent[0]!.settle(false);
    expect(await a).toBe('failed');
    const b = enqueue(q, null, send);
    expect(sent.map((s) => s.value)).toEqual([1, null]);
    sent[1]!.settle(true);
    expect(await b).toBe('saved');
  });
});
