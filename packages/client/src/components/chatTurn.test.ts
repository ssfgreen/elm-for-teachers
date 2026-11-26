import { describe, expect, it, vi } from 'vitest';
import { chatReducer, createChatStore, EMPTY, IDLE, shownText, turnReducer, type ChatTurn, type QueuedMessage } from './chatTurn';

const start = (controller = new AbortController()) => ({ type: 'start' as const, threadId: 'T1', docId: 'D1', controller });

describe('turnReducer', () => {
  it('starts thinking, for the chat and doc it was sent from', () => {
    const t = turnReducer(IDLE, start());
    expect(t).toMatchObject({ phase: 'running', threadId: 'T1', docId: 'D1', turnId: null, raw: '', status: null, steps: [] });
  });

  it('refuses a second start while a turn is running or stopping', () => {
    const running = turnReducer(IDLE, start());
    expect(turnReducer(running, start())).toBe(running);
    const stopping = turnReducer(running, { type: 'stop' });
    expect(turnReducer(stopping, start())).toBe(stopping);
  });

  it('takes the turn id, the text and what the model is doing while running', () => {
    let t: ChatTurn = turnReducer(IDLE, start());
    t = turnReducer(t, { type: 'named', turnId: 'turn_1' });
    t = turnReducer(t, { type: 'text', raw: 'Here is' });
    t = turnReducer(t, { type: 'agent', raw: 'Here is a title', status: 'Reading “Similes”', steps: [] });
    expect(t).toMatchObject({ phase: 'running', turnId: 'turn_1', raw: 'Here is a title', status: 'Reading “Similes”' });
  });

  it('keeps the reply where the teacher saw it once stopped', () => {
    let t: ChatTurn = turnReducer(turnReducer(IDLE, start()), { type: 'text', raw: 'Once upon\n\n```json\n[{"op":' });
    t = turnReducer(t, { type: 'stop' });
    expect(t.phase).toBe('stopping');
    expect(turnReducer(t, { type: 'text', raw: 'Once upon a time' })).toBe(t);
    expect(shownText(t)).toBe('Once upon');
  });

  it('ignores what does not fit: text, a name or a Stop with no turn, and a second Stop', () => {
    expect(turnReducer(IDLE, { type: 'text', raw: 'late' })).toBe(IDLE);
    expect(turnReducer(IDLE, { type: 'named', turnId: 'x' })).toBe(IDLE);
    expect(turnReducer(IDLE, { type: 'stop' })).toBe(IDLE);
    const stopping = turnReducer(turnReducer(IDLE, start()), { type: 'stop' });
    expect(turnReducer(stopping, { type: 'stop' })).toBe(stopping);
  });

  it('ends to idle from running or stopping', () => {
    const running = turnReducer(IDLE, start());
    expect(turnReducer(running, { type: 'end' })).toBe(IDLE);
    expect(turnReducer(turnReducer(running, { type: 'stop' }), { type: 'end' })).toBe(IDLE);
  });
});

const queued = (key: string): QueuedMessage => ({ key, prompt: `message ${key}`, docId: 'D1', about: null, attached: [], onFail: () => undefined });

describe('chatReducer', () => {
  it('queues messages in order, and cancels or takes out one by its key', () => {
    let s = chatReducer(EMPTY, start());
    s = chatReducer(s, { type: 'queue', message: queued('a') });
    s = chatReducer(s, { type: 'queue', message: queued('b') });
    expect(s.queue.map((m) => m.key)).toEqual(['a', 'b']);
    expect(chatReducer(s, { type: 'cancel', key: 'a' }).queue.map((m) => m.key)).toEqual(['b']);
    expect(chatReducer(s, { type: 'dequeue', key: 'b' }).queue.map((m) => m.key)).toEqual(['a']);
    expect(chatReducer(s, { type: 'cancel', key: 'gone' })).toBe(s);
  });

  it('leaves the queue alone as the turn moves on', () => {
    let s = chatReducer(chatReducer(EMPTY, start()), { type: 'queue', message: queued('a') });
    s = chatReducer(s, { type: 'end' });
    expect(s.turn).toBe(IDLE);
    expect(s.queue.map((m) => m.key)).toEqual(['a']);
  });
});

describe('createChatStore', () => {
  it('tells its listeners of a change, and not of an action that changes nothing', () => {
    const store = createChatStore();
    const heard = vi.fn();
    const off = store.subscribe(heard);
    store.dispatch({ type: 'text', raw: 'nothing under way' });
    expect(heard).not.toHaveBeenCalled();
    expect(store.dispatch(start()).turn.phase).toBe('running');
    expect(heard).toHaveBeenCalledTimes(1);
    off();
    store.dispatch({ type: 'end' });
    expect(heard).toHaveBeenCalledTimes(1);
    expect(store.get().turn).toBe(IDLE);
  });
});
