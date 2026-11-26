/** One turn at a time (later messages queue), and a turn's draft belongs to the chat and doc it was sent from. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommentAnchor } from '@edw/shared';
import type { ChatReply, Envelope } from '../api/types';
import { DOC_ID, THREAD_ID, mockLogger } from '../test-utils';
import { ChatPane, FLUSH_LIMIT_MS } from './ChatPane';

afterEach(cleanup);

const envelope: Envelope = { client_ts: '2026-11-09T10:00:00.000Z', focus_pane: 'chat', doc_id: DOC_ID, thread_id: THREAD_ID };
const done = (turn_id: string, message: string): Extract<ChatReply, { ok: true }> => ({ ok: true, turn_id, message, changes: { blocks: [], docs: [] }, proposed_block_ids: [], created_doc_ids: [] });

describe('ChatPane: one turn at a time, the rest queued', () => {
  function pending() {
    const finishers: ((r: ChatReply) => void)[] = [];
    const api = { getChat: vi.fn(() => Promise.resolve([])), sendChat: vi.fn<(...args: unknown[]) => Promise<ChatReply>>(() => new Promise<ChatReply>((r) => finishers.push(r))) };
    return { api, finish: (i: number, r: ChatReply) => finishers[i]!(r) };
  }
  const sendRef = (): { current: ((text: string, anchor?: CommentAnchor) => void) | null } => ({ current: null });

  it('queues a message sent while a reply is on its way, and sends it when the reply ends', async () => {
    const p = pending();
    const ref = sendRef();
    render(<ChatPane api={p.api} threadId={THREAD_ID} docId={DOC_ID} logger={mockLogger()} getEnvelope={() => envelope} onReply={vi.fn()} sendRef={ref} batchMs={10_000} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Write a worksheet' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));

    // The editor's inline @model prompt, while the model is still thinking.
    const anchor = { block_id: 'B1', from: null, to: null, quote: null };
    await act(async () => ref.current!('Make this a metaphor', anchor));
    expect(p.api.sendChat).toHaveBeenCalledTimes(1);
    const queued = screen.getByRole('listitem', { name: /Queued/ });
    expect(queued.textContent).toContain('Make this a metaphor');
    expect(screen.getByRole('status').textContent).toBe('Thinking…');

    await act(async () => p.finish(0, done('t1', 'Here it is.')));
    expect(screen.getByText('Here it is.')).toBeTruthy();
    expect(p.api.sendChat).toHaveBeenCalledTimes(2);
    expect(p.api.sendChat.mock.calls[1]).toEqual([THREAD_ID, DOC_ID, 'Make this a metaphor', { client_ts: envelope.client_ts, focus_pane: 'chat' }, anchor]);
    expect(screen.queryByRole('listitem', { name: /Queued/ })).toBeNull();
    await act(async () => p.finish(1, done('t2', 'A metaphor now.')));
    expect(screen.getByText('A metaphor now.')).toBeTruthy();
  });

  it('lets the teacher type and queue in the chat box, and cancel a queued message', async () => {
    const p = pending();
    render(<ChatPane api={p.api} threadId={THREAD_ID} docId={DOC_ID} logger={mockLogger()} getEnvelope={() => envelope} onReply={vi.fn()} batchMs={10_000} />);
    const box = screen.getByLabelText('Message');
    fireEvent.change(box, { target: { value: 'Write a worksheet' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));
    fireEvent.change(box, { target: { value: 'Add an answer key' } });
    await act(async () => fireEvent.keyDown(box, { key: 'Enter' }));
    fireEvent.change(box, { target: { value: 'And a title' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));
    expect((box as HTMLTextAreaElement).value).toBe('');
    expect(screen.getAllByRole('listitem', { name: /Queued/ }).map((li) => li.textContent)).toEqual([expect.stringContaining('Add an answer key'), expect.stringContaining('And a title')]);

    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Cancel this queued message' })[0]!));
    expect(screen.getAllByRole('listitem', { name: /Queued/ })).toHaveLength(1);
    await act(async () => p.finish(0, done('t1', 'Here it is.')));
    expect(p.api.sendChat).toHaveBeenCalledTimes(2);
    expect(p.api.sendChat.mock.calls[1]![2]).toBe('And a title');
  });
});

describe('ChatPane: a turn belongs to its chat and doc', () => {
  function streaming() {
    let push!: (d: string) => void;
    let finish!: (r: ChatReply) => void;
    const api = {
      getChat: vi.fn(() => Promise.resolve([])),
      sendChat: vi.fn(),
      sendChatStream: vi.fn((_t: string, _d: string, _p: string, _e: unknown, _a: unknown, onText: (d: string) => void) => {
        push = onText;
        return new Promise<ChatReply>((r) => (finish = r));
      }),
    };
    return { api, push: (d: string) => push(d), finish: (r: ChatReply) => finish(r) };
  }

  it('hands up its draft and its reply with the chat and doc it was sent from', async () => {
    const s = streaming();
    const onDraft = vi.fn();
    const onReply = vi.fn();
    render(<ChatPane api={s.api} threadId={THREAD_ID} docId={DOC_ID} logger={mockLogger()} getEnvelope={() => envelope} onReply={onReply} onDraft={onDraft} batchMs={10_000} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Add a title' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));
    act(() => s.push('Here'));
    expect(onDraft).toHaveBeenLastCalledWith({ raw: 'Here', threadId: THREAD_ID, docId: DOC_ID });
    const reply = done('t1', 'Here it is.');
    await act(async () => s.finish(reply));
    expect(onReply).toHaveBeenCalledWith(reply, { threadId: THREAD_ID, docId: DOC_ID });
    expect(onDraft).toHaveBeenLastCalledWith(null);
  });

  it('once its chat is closed, takes its draft back and hands up nothing more of it but the reply', async () => {
    const s = streaming();
    const onDraft = vi.fn();
    const onReply = vi.fn();
    const view = render(<ChatPane api={s.api} threadId={THREAD_ID} docId={DOC_ID} logger={mockLogger()} getEnvelope={() => envelope} onReply={onReply} onDraft={onDraft} batchMs={10_000} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Add a title' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));
    act(() => s.push('Here'));
    // The teacher opens another chat: this pane goes.
    view.unmount();
    expect(onDraft).toHaveBeenLastCalledWith(null);
    onDraft.mockClear();
    act(() => s.push(' is more'));
    const reply = done('t1', 'Here it is.');
    await act(async () => s.finish(reply));
    expect(onDraft).not.toHaveBeenCalled();
    // The reply still goes up, so its suggestions are there when the teacher comes back.
    expect(onReply).toHaveBeenCalledWith(reply, { threadId: THREAD_ID, docId: DOC_ID });
  });
});

describe('ChatPane: the server has the teacher’s latest work before the model reads it', () => {
  it('waits for the editor to flush (typing, commands, decisions) before sending', async () => {
    let flushed!: () => void;
    const beforeSend = vi.fn(() => new Promise<void>((r) => (flushed = r)));
    const api = { getChat: vi.fn(() => Promise.resolve([])), sendChat: vi.fn(() => Promise.resolve(done('t1', 'Done.'))) };
    render(<ChatPane api={api} threadId={THREAD_ID} docId={DOC_ID} logger={mockLogger()} getEnvelope={() => envelope} onReply={vi.fn()} beforeSend={beforeSend} batchMs={10_000} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Simpler, please' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));
    expect(beforeSend).toHaveBeenCalledTimes(1);
    expect(api.sendChat).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('Thinking…');
    await act(async () => flushed());
    expect(api.sendChat).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Done.')).toBeTruthy();
  });

  it('sends anyway once the flush has taken too long', async () => {
    vi.useFakeTimers();
    try {
      const api = { getChat: vi.fn(() => Promise.resolve([])), sendChat: vi.fn(() => Promise.resolve(done('t1', 'Done.'))) };
      render(<ChatPane api={api} threadId={THREAD_ID} docId={DOC_ID} logger={mockLogger()} getEnvelope={() => envelope} onReply={vi.fn()} beforeSend={() => new Promise<void>(() => undefined)} batchMs={10_000} />);
      fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Simpler, please' } });
      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));
      expect(api.sendChat).not.toHaveBeenCalled();
      await act(async () => vi.advanceTimersByTime(FLUSH_LIMIT_MS));
      expect(api.sendChat).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ChatPane: Editing mode, the teacher typed in a block the reply changed', () => {
  it("says it kept the teacher's text", async () => {
    const reply = { ...done('t1', 'Made it shorter.'), typed_during: ['B1'] };
    const api = { getChat: vi.fn(() => Promise.resolve([])), sendChat: vi.fn(() => Promise.resolve(reply)) };
    render(<ChatPane api={api} threadId={THREAD_ID} docId={DOC_ID} logger={mockLogger()} getEnvelope={() => envelope} onReply={vi.fn()} batchMs={10_000} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Shorter, please' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));
    expect(screen.getByText('You were typing in the same paragraph while I made the change. I didn’t touch your text.')).toBeTruthy();
  });

  it('says so, and that the change waits as a suggestion, when they touched the same words', async () => {
    const reply = { ...done('t1', 'Made it shorter.'), typed_during: ['B1'], proposed_block_ids: ['B1'] };
    const api = { getChat: vi.fn(() => Promise.resolve([])), sendChat: vi.fn(() => Promise.resolve(reply)) };
    render(<ChatPane api={api} threadId={THREAD_ID} docId={DOC_ID} logger={mockLogger()} getEnvelope={() => envelope} onReply={vi.fn()} batchMs={10_000} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Shorter, please' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));
    expect(screen.getByText(/I didn’t touch your text\. My change is waiting beside it as a suggestion\./)).toBeTruthy();
  });
});

describe('ChatPane: one button, Send or Stop', () => {
  it('is a Send icon; while a reply streams it is Stop, and Send again once the teacher types', async () => {
    const api = {
      getChat: vi.fn(() => Promise.resolve([])),
      sendChat: vi.fn(),
      stopChat: vi.fn(() => Promise.resolve()),
      sendChatStream: vi.fn(() => new Promise<ChatReply>(() => undefined)),
    };
    render(<ChatPane api={api} threadId={THREAD_ID} docId={DOC_ID} logger={mockLogger()} getEnvelope={() => envelope} onReply={vi.fn()} batchMs={10_000} />);
    const box = screen.getByLabelText('Message');
    const send = () => screen.queryByRole('button', { name: 'Send' }) as HTMLButtonElement | null;
    const stop = () => screen.queryByRole('button', { name: 'Stop' });
    // An icon, not a word; off until there is something to send.
    expect(send()!.textContent).toBe('');
    expect(send()!.disabled).toBe(true);
    fireEvent.change(box, { target: { value: 'Write a worksheet' } });
    expect(send()!.disabled).toBe(false);
    await act(async () => fireEvent.click(send()!));
    // A reply on its way, nothing typed: Stop only.
    expect(stop()).toBeTruthy();
    expect(stop()!.textContent).toBe('');
    expect(send()).toBeNull();
    // Typing brings Send back (it queues); clearing the box brings Stop back.
    fireEvent.change(box, { target: { value: 'Add a key' } });
    expect(send()).toBeTruthy();
    expect(stop()).toBeNull();
    fireEvent.change(box, { target: { value: '' } });
    expect(stop()).toBeTruthy();
  });
});
