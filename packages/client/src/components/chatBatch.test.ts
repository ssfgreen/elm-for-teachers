import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatBatcher, textDiff } from './chatBatch';

describe('textDiff', () => {
  it('describes insertions, deletions and replacements as one range', () => {
    expect(textDiff('abc', 'abXc')).toEqual({ from: 2, to: 2, text: 'X' });
    expect(textDiff('abcd', 'ad')).toEqual({ from: 1, to: 3, text: '' });
    expect(textDiff('hello', 'help')).toEqual({ from: 3, to: 5, text: 'p' });
    expect(textDiff('aaa', 'aaaa')).toEqual({ from: 3, to: 3, text: 'a' });
    expect(textDiff('x', 'x')).toBeNull();
  });
});

describe('createChatBatcher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('logs one batch per window with the steps and inserted character count', () => {
    const log = vi.fn();
    const b = createChatBatcher({ log }, 500);
    b.change('', 'h');
    b.change('h', 'hi');
    expect(log).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(log).toHaveBeenCalledTimes(1);
    const [kind, payload] = log.mock.calls[0]!;
    expect(kind).toBe('keystroke_batch');
    expect(payload).toMatchObject({
      target: { kind: 'chat' },
      steps: [
        { from: 0, to: 0, text: 'h' },
        { from: 1, to: 1, text: 'i' },
      ],
      char_count: 2,
    });
    b.flush();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('flushes early on demand', () => {
    const log = vi.fn();
    const b = createChatBatcher({ log }, 500);
    b.change('', 'x');
    b.flush();
    expect(log).toHaveBeenCalledTimes(1);
  });
});
