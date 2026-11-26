import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SpyglassResult } from '@edw/shared';
import type { ChatReply, Envelope } from '../api/types';
import { DOC_ID, THREAD_ID, mockLogger } from '../test-utils';
import { ChatPane } from './ChatPane';
import { Spyglass } from './Spyglass';

afterEach(cleanup);

const result: SpyglassResult = {
  flags: [
    { check: 'scope', label: 'changed', block_ids: ['B5'], title: 'Sentence 5 rewritten', why: 'Pupils now read a different sentence.', was: 'It took something like an hour to walk home.' },
    { check: 'scope', label: 'duplicated', block_ids: ['B7', 'B9'], title: '"Task 1 (continued)" appears twice', why: '' },
  ],
  others: 2,
  by: 'judge',
};

describe('the Spyglass callout', () => {
  it('lists each flag as a short heading and reason, with how many more, and no label or Dismiss', () => {
    render(<Spyglass turnId="t1" result={result} logger={mockLogger()} />);
    const callout = screen.getByRole('complementary', { name: 'Spyglass' });
    expect([...callout.querySelectorAll('strong')].map((e) => e.textContent)).toEqual(['Sentence 5 rewritten', '"Task 1 (continued)" appears twice']);
    expect(callout.textContent).toContain('Pupils now read a different sentence.');
    expect(callout.textContent).toContain('+2 more');
    // The telescope says what it is; the word is only for screen readers.
    expect(callout.textContent).not.toContain('Spyglass');
    expect(callout.textContent).not.toContain('It was');
    expect(screen.queryByRole('button', { name: /Dismiss/ })).toBeNull();
  });

  it('scrolls to the flag’s block with Show, and logs it', () => {
    const panel = document.createElement('div');
    panel.className = 'doc-panel';
    panel.innerHTML = '<p data-block-id="B9">Task 1 (continued)</p>';
    document.body.append(panel);
    const scroll = vi.fn();
    (panel.firstElementChild as HTMLElement).scrollIntoView = scroll;
    const logger = mockLogger();
    render(<Spyglass turnId="t1" result={result} logger={logger} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show: "Task 1 (continued)" appears twice' }));
    expect(scroll).toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith('spyglass_action', { turn_id: 't1', flag: 1, label: 'duplicated', block_ids: ['B7', 'B9'], action: 'show' });
    panel.remove();
  });

  it('shows nothing without flags', () => {
    render(<Spyglass turnId="t2" result={{ flags: [], others: 0, by: 'judge' }} logger={mockLogger()} />);
    expect(screen.queryByRole('complementary', { name: 'Spyglass' })).toBeNull();
  });
});

describe('the callout in the chat', () => {
  const envelope: Envelope = { client_ts: '2026-11-11T10:00:00.000Z', focus_pane: 'chat', doc_id: DOC_ID, thread_id: THREAD_ID };
  const reply: ChatReply = { ok: true, turn_id: 't9', message: 'Done.', changes: { blocks: [], docs: [] }, proposed_block_ids: [], created_doc_ids: [] };

  it('shows the flags under the reply when they arrive after it, even in the same read', async () => {
    const api = {
      getChat: vi.fn(() => Promise.resolve([])),
      sendChat: vi.fn(),
      sendChatStream: vi.fn((...args: unknown[]) => {
        const control = args[7] as { onSpyglass: (id: string, s: SpyglassResult) => void };
        // The result and the flags in one read: the flags come before the reply's message exists.
        return Promise.resolve(reply).finally(() => control.onSpyglass('t9', result));
      }),
    };
    render(<ChatPane api={api} threadId={THREAD_ID} docId={DOC_ID} logger={mockLogger()} getEnvelope={() => envelope} onReply={vi.fn()} batchMs={10_000} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Tidy' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });
    expect(await screen.findByRole('complementary', { name: 'Spyglass' })).toBeTruthy();
    expect(document.querySelector('.chat-assistant .spyglass')).not.toBeNull();
  });

  it('shows a turn’s flags again on reload', async () => {
    const api = { getChat: vi.fn(() => Promise.resolve([{ turn_id: 't1', doc_id: DOC_ID, prompt: 'Tidy', response_text: 'Done.', spyglass: result, at: '2026-11-11T09:00:00.000Z' }])), sendChat: vi.fn() };
    render(<ChatPane api={api} threadId={THREAD_ID} docId={DOC_ID} logger={mockLogger()} getEnvelope={() => envelope} onReply={vi.fn()} batchMs={10_000} />);
    expect(await screen.findByText(/Sentence 5 rewritten/)).toBeTruthy();
  });
});
