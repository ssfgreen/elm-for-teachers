/** The chat's token and cost counter: fetched on opening the chat and after each turn, and handed up to show under the chat's name. */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatReply, Envelope } from '../api/types';
import { DOC_ID, THREAD_ID, mockLogger } from '../test-utils';
import { ChatPane } from './ChatPane';

afterEach(cleanup);

const envelope: Envelope = { client_ts: '2026-10-28T10:00:00.000Z', focus_pane: 'chat', doc_id: DOC_ID, thread_id: THREAD_ID };

describe('ChatPane: usage', () => {
  it('hands up the chat’s usage, and fetches it again once a turn ends', async () => {
    let resolve!: (r: ChatReply) => void;
    const getChatUsage = vi
      .fn()
      .mockResolvedValueOnce({ input_tokens: 100, output_tokens: 10, gbp: 0.003 })
      .mockResolvedValueOnce({ input_tokens: 2500, output_tokens: 40, gbp: 0.007 });
    const api = { getChat: vi.fn(() => Promise.resolve([])), getChatUsage, sendChat: vi.fn(() => new Promise<ChatReply>((r) => (resolve = r))) };
    const onUsage = vi.fn();
    render(<ChatPane api={api} threadId={THREAD_ID} docId={DOC_ID} logger={mockLogger()} getEnvelope={() => envelope} onReply={vi.fn()} batchMs={10_000} onUsage={onUsage} />);
    await waitFor(() => expect(onUsage).toHaveBeenLastCalledWith({ input_tokens: 100, output_tokens: 10, gbp: 0.003 }));
    expect(getChatUsage).toHaveBeenCalledWith(THREAD_ID);

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    // Not while the turn runs: its calls are logged when it ends.
    expect(getChatUsage).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ ok: true, turn_id: 't1', message: 'Hi', changes: { blocks: [], docs: [] }, proposed_block_ids: [], created_doc_ids: [] }));
    expect(getChatUsage).toHaveBeenCalledTimes(2);
    expect(onUsage).toHaveBeenLastCalledWith({ input_tokens: 2500, output_tokens: 40, gbp: 0.007 });
  });

  it('hands up nothing, rather than breaking the chat, when the answer is not usage', async () => {
    const getChatUsage = vi.fn().mockResolvedValue({});
    const api = { getChat: vi.fn(() => Promise.resolve([])), getChatUsage, sendChat: vi.fn() };
    const onUsage = vi.fn();
    render(<ChatPane api={api} threadId={THREAD_ID} docId={DOC_ID} logger={mockLogger()} getEnvelope={() => envelope} onReply={vi.fn()} batchMs={10_000} onUsage={onUsage} />);
    await act(async () => undefined);
    expect(getChatUsage).toHaveBeenCalled();
    expect(onUsage.mock.calls.every(([u]) => u === null)).toBe(true);
  });
});
