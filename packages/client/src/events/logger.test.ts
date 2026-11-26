import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEventLogger } from './logger';

type Call = { url: string; init: RequestInit; resolve: () => void; reject: (e: Error) => void };

function harness(overrides: Partial<Parameters<typeof createEventLogger>[0]> = {}) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn((url: string, init: RequestInit) => {
    return new Promise<Response>((resolve, reject) => {
      calls.push({
        url,
        init,
        resolve: () => resolve(new Response(JSON.stringify({ accepted: 1, last_seq: 1 }), { status: 200 })),
        reject,
      });
    });
  }) as unknown as typeof fetch;
  const logger = createEventLogger({
    sessionId: 's1',
    participantToken: 'tok',
    batchMs: 500,
    maxBatch: 100,
    getContext: () => ({ doc_id: 'D1', thread_id: 'T1' }),
    getFocusPane: () => 'canvas',
    fetchImpl,
    ...overrides,
  });
  return { logger, calls, fetchImpl };
}
const bodyOf = (c: Call) => JSON.parse(c.init.body as string) as { session_id: string; events: { kind: string; payload: { text?: string } }[] };
const chat = (i: number) => ({ turn_id: 't', text: `m${i}` });
const texts = (c: Call) => bodyOf(c).events.map((e) => e.payload.text);

describe('event logger', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('passes on what the server says about interaction logging, when it says it', async () => {
    const answers = [{ accepted: 1, last_seq: 1, interactions: true }, { accepted: 1, last_seq: 2 }, { accepted: 1, last_seq: 3, interactions: false }];
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(answers.shift()), { status: 200 })) as unknown as typeof fetch;
    const acks: boolean[] = [];
    const { logger } = harness({ fetchImpl, onAck: (a) => acks.push(a.interactions) });
    for (let i = 0; i < 3; i++) {
      logger.log('chat_prompt', chat(i));
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(acks).toEqual([true, false]);
  });

  it('sends queued events in order after batchMs, with auth and envelope', async () => {
    const { logger, calls } = harness();
    const id = logger.log('chat_prompt', chat(1));
    logger.log('chat_prompt', chat(2));
    expect(id).toMatch(/^[0-9A-Z]{26}$/);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(499);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/api/sessions/s1/events');
    expect((calls[0]!.init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
    expect(texts(calls[0]!)).toEqual(['m1', 'm2']);
    const ev = bodyOf(calls[0]!).events[0] as unknown as Record<string, unknown>;
    expect(ev).toMatchObject({ event_id: id, doc_id: 'D1', thread_id: 'T1', focus_pane: 'canvas', kind: 'chat_prompt' });
    expect(ev).not.toHaveProperty('phase');
    calls[0]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(logger.pending()).toBe(0);
    logger.stop();
  });

  it('holds events logged during an in-flight request for the next batch', async () => {
    const { logger, calls } = harness();
    logger.log('chat_prompt', chat(1));
    await vi.advanceTimersByTimeAsync(500);
    logger.log('chat_prompt', chat(2));
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toHaveLength(1);
    calls[0]!.resolve();
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toHaveLength(2);
    expect(texts(calls[1]!)).toEqual(['m2']);
    logger.stop();
  });

  it('sends immediately when maxBatch is reached', async () => {
    const { logger, calls } = harness({ maxBatch: 3 });
    logger.log('chat_prompt', chat(1));
    logger.log('chat_prompt', chat(2));
    expect(calls).toHaveLength(0);
    logger.log('chat_prompt', chat(3));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    expect(texts(calls[0]!)).toEqual(['m1', 'm2', 'm3']);
    logger.stop();
  });

  it('retries with backoff, keeps order, and reports after three failures', async () => {
    const { logger, calls } = harness();
    const errors: number[] = [];
    logger.onError((_e, n) => errors.push(n));
    logger.log('chat_prompt', chat(1));
    await vi.advanceTimersByTimeAsync(500);
    calls[0]!.reject(new Error('down'));
    logger.log('chat_prompt', chat(2));
    await vi.advanceTimersByTimeAsync(499);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1); // retry 1 at +500
    expect(calls).toHaveLength(2);
    calls[1]!.reject(new Error('down'));
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1); // +1000
    expect(calls).toHaveLength(3);
    expect(errors).toEqual([]);
    calls[2]!.reject(new Error('down'));
    await vi.advanceTimersByTimeAsync(0);
    expect(errors).toEqual([3]);
    await vi.advanceTimersByTimeAsync(2000); // +2000
    expect(calls).toHaveLength(4);
    for (const c of calls.slice(1)) expect(texts(c)).toEqual(['m1', 'm2']);
    calls[3]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(logger.pending()).toBe(0);
    logger.stop();
  });

  it('caps backoff at 10 seconds', async () => {
    const { logger, calls } = harness();
    logger.log('chat_prompt', chat(1));
    await vi.advanceTimersByTimeAsync(500);
    for (const wait of [500, 1000, 2000, 4000, 8000, 10000, 10000]) {
      const n = calls.length;
      calls[n - 1]!.reject(new Error('x'));
      await vi.advanceTimersByTimeAsync(wait - 1);
      expect(calls).toHaveLength(n);
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toHaveLength(n + 1);
    }
    logger.stop();
  });

  it('flush resolves only after the server acknowledges', async () => {
    const { logger, calls } = harness();
    logger.log('chat_prompt', chat(1));
    let done = false;
    const p = logger.flush().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1); // immediate, not after 500 ms
    expect(done).toBe(false);
    calls[0]!.resolve();
    await p;
    expect(done).toBe(true);
    logger.stop();
  });

  it('uses sendBeacon on page hide and drops beaconed events from the queue', async () => {
    const RealBlob = Blob;
    vi.stubGlobal(
      'Blob',
      class extends RealBlob {
        parts: unknown[];
        constructor(parts: BlobPart[], o?: BlobPropertyBag) {
          super(parts, o);
          this.parts = parts;
        }
      },
    );
    const beacon = vi.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
    const { logger, calls } = harness();
    logger.log('chat_prompt', chat(1));
    window.dispatchEvent(new Event('pagehide'));
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, blob] = beacon.mock.calls[0] as unknown as [string, Blob & { parts: unknown[] }];
    expect(url).toContain('/api/sessions/s1/events');
    expect(blob.type).toBe('application/json');
    expect(JSON.parse(blob.parts[0] as string).events).toHaveLength(1);
    expect(logger.pending()).toBe(0);
    expect(calls).toHaveLength(0);
    logger.stop();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'sendBeacon');
  });

  it('falls back to keepalive fetch when sendBeacon is missing', async () => {
    const { logger, fetchImpl } = harness();
    logger.log('chat_prompt', chat(1));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Reflect.deleteProperty(document, 'visibilityState');
    const mock = fetchImpl as unknown as ReturnType<typeof vi.fn>;
    expect(mock).toHaveBeenCalledTimes(1);
    expect((mock.mock.calls[0] as [string, RequestInit])[1].keepalive).toBe(true);
    logger.stop();
  });
});
