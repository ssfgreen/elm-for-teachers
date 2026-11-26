import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionApi } from '../api/participant';
import type { ChatReply, Envelope } from '../api/types';
import { DOC_ID, THREAD_ID, mockLogger } from '../test-utils';
import { ChatPane, type ChatMessage } from './ChatPane';
import { choiceMessage, openCopyRequests } from './useCopyChoice';

afterEach(cleanup);

const SOURCE = '01JC0000000000000000000SRC';
const envelope: Envelope = {
  client_ts: '2026-11-11T10:00:00.000Z',
  focus_pane: 'chat',
  doc_id: DOC_ID,
  thread_id: THREAD_ID,
};
const sent = { client_ts: envelope.client_ts, focus_pane: envelope.focus_pane };
const turn = (turn_id: string, extra: object = {}) => ({
  turn_id,
  doc_id: DOC_ID,
  prompt: 'Make a copy',
  response_text: 'Choose what the copy is made from.',
  at: '2026-11-11T09:59:00.000Z',
  ...extra,
});
const done = (turn_id: string, message: string): Extract<ChatReply, { ok: true }> => ({
  ok: true,
  turn_id,
  message,
  changes: { blocks: [], docs: [] },
  proposed_block_ids: [],
  created_doc_ids: [],
});

function setup(
  history: Awaited<ReturnType<SessionApi['getChat']>>,
  reply: ChatReply = done('t9', 'Copied.'),
) {
  const api = {
    getChat: vi.fn(() => Promise.resolve(history)),
    sendChat: vi.fn(() => Promise.resolve(reply)),
  };
  const logger = mockLogger();
  const acceptAll = vi.fn();
  const order: string[] = [];
  acceptAll.mockImplementation(() => order.push('accept'));
  api.sendChat.mockImplementation(() => {
    order.push('send');
    return Promise.resolve(reply);
  });
  render(
    <ChatPane
      api={api}
      threadId={THREAD_ID}
      docId={DOC_ID}
      logger={logger}
      getEnvelope={() => envelope}
      onReply={vi.fn()}
      batchMs={10_000}
      copies={{ docName: (id) => (id === SOURCE ? 'Bannockburn sources' : undefined), acceptAll }}
    />,
  );
  return { api, logger, acceptAll, order };
}

describe('the copy choice under the reply', () => {
  it('offers the three choices for a copy waiting on the teacher, logs the one chosen and sends it with the message', async () => {
    const { api, logger } = setup([
      turn('t0', { copy_requests: [{ doc_id: SOURCE, waiting: 2 }] }),
    ]);
    expect(await screen.findByText(/2 suggestions waiting/)).toBeTruthy();
    expect(screen.getByText(/Bannockburn sources/)).toBeTruthy();
    for (const name of ['Approve all and use', 'Use only approved', 'Use all and leave'])
      expect(screen.getByRole('button', { name })).toBeTruthy();

    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Use all and leave' })),
    );
    expect(logger.log).toHaveBeenCalledWith('copy_choice', {
      doc_id: SOURCE,
      choice: 'all_and_leave',
      waiting: 2,
      turn_id: 't0',
    });
    expect(api.sendChat).toHaveBeenCalledWith(
      THREAD_ID,
      DOC_ID,
      choiceMessage('all_and_leave', 'Bannockburn sources'),
      sent,
      undefined,
      undefined,
      { doc_id: SOURCE, choice: 'all_and_leave' },
    );
    // Answered: the card goes.
    expect(screen.queryByRole('button', { name: 'Use all and leave' })).toBeNull();
  });

  it('accepts every suggestion in the source first for Approve all and use', async () => {
    const { acceptAll, order, api } = setup([
      turn('t0', { copy_requests: [{ doc_id: SOURCE, waiting: 1 }] }),
    ]);
    const approve = await screen.findByRole('button', { name: 'Approve all and use' });
    await act(async () => fireEvent.click(approve));
    expect(acceptAll).toHaveBeenCalledWith(SOURCE);
    expect(order).toEqual(['accept', 'send']);
    expect(api.sendChat).toHaveBeenCalledWith(
      THREAD_ID,
      DOC_ID,
      choiceMessage('approve_all', 'Bannockburn sources'),
      sent,
      undefined,
      undefined,
      { doc_id: SOURCE, choice: 'approve_all' },
    );
  });

  it('shows the choice only under the latest reply, and for a reply that has just come', async () => {
    setup([turn('t0', { copy_requests: [{ doc_id: SOURCE, waiting: 1 }] }), turn('t1')], {
      ...done('t2', 'No copy yet.'),
      copy_requests: [{ doc_id: SOURCE, waiting: 3 }],
    });
    await screen.findAllByText('Choose what the copy is made from.');
    expect(screen.queryByRole('button', { name: 'Use only approved' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Copy it' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));
    expect(await screen.findByText(/3 suggestions waiting/)).toBeTruthy();
  });
});

describe('openCopyRequests', () => {
  it('is the latest reply’s requests not yet answered', () => {
    const r = { doc_id: SOURCE, waiting: 1 };
    const messages: ChatMessage[] = [
      { key: 'a', role: 'assistant', text: '', turnId: 't0', copyRequests: [r] },
      { key: 'b', role: 'teacher', text: 'Use it' },
    ];
    expect(openCopyRequests(messages, new Set())).toEqual({ turnId: 't0', requests: [r] });
    expect(openCopyRequests(messages, new Set([`t0:${SOURCE}`]))).toBeNull();
    expect(
      openCopyRequests(
        [...messages, { key: 'c', role: 'assistant', text: 'Done', turnId: 't1' }],
        new Set(),
      ),
    ).toBeNull();
  });
});
