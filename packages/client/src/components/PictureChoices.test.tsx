import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatReply, Envelope } from '../api/types';
import { awaitsDecision } from '../screens/usePictureChoice';
import { DOC_ID, THREAD_ID, mockLogger, testBlock } from '../test-utils';
import { ChatPane } from './ChatPane';
import { arasaacThumbUrl, openOffers, PictureChoices, type TurnPictureOffer } from './PictureChoices';

afterEach(cleanup);

const offer = (over: Partial<TurnPictureOffer> = {}): TurnPictureOffer => ({
  turn_id: 't1',
  block_id: 'IMG',
  alt: 'an apple',
  chosen: 2462,
  options: [
    { id: 2462, label: 'apple' },
    { id: 3203, label: 'apple tree' },
    { id: 9057, label: 'apple pie' },
  ],
  ...over,
});

describe('openOffers', () => {
  it('keeps the latest offer per block, while the block is open and there is a choice', () => {
    const later = offer({ turn_id: 't2', chosen: 3203 });
    const single = offer({ block_id: 'ONE', options: [{ id: 1, label: 'x' }] });
    const decided = offer({ block_id: 'DONE' });
    expect(openOffers([offer(), single, decided, later], (id) => id !== 'DONE')).toEqual([later]);
  });
});

describe('awaitsDecision', () => {
  it('is true for a suggested block or a suggested change, not for a decided one', () => {
    const snap = {
      docs: [],
      blocks: [
        testBlock({ id: 'NEW', status: 'proposed' }),
        testBlock({ id: 'CHANGE', status: 'live', pending: { op: 'replace', turn_id: 't', content: 'x' } }),
        testBlock({ id: 'LIVE', status: 'live' }),
        testBlock({ id: 'NO', status: 'rejected' }),
      ],
    };
    expect(['NEW', 'CHANGE', 'LIVE', 'NO', 'GONE'].map((id) => awaitsDecision(snap, id))).toEqual([true, true, false, false, false]);
    expect(awaitsDecision(null, 'NEW')).toBe(false);
  });
});

describe('PictureChoices', () => {
  it('shows up to four pictures, marks the one in the document, and picks another', async () => {
    const onChoose = vi.fn(() => Promise.resolve());
    const five = offer({ options: [...offer().options, { id: 4, label: 'four' }, { id: 5, label: 'five' }] });
    render(<PictureChoices offers={[five]} onChoose={onChoose} />);
    const row = screen.getByRole('region', { name: 'Pictures for “an apple”' });
    const buttons = within(row).getAllByRole('button');
    expect(buttons).toHaveLength(4);
    const current = within(row).getByRole('button', { name: 'apple (in the document)' }) as HTMLButtonElement;
    expect(current.getAttribute('aria-pressed')).toBe('true');
    // The one in the document can be clicked too: it is kept (the block accepted with it).
    expect(current.disabled).toBe(false);
    const img = within(row).getByRole('button', { name: 'Use apple tree' }).querySelector('img')!;
    expect(img.getAttribute('src')).toBe(arasaacThumbUrl(3203));
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(screen.getByText(/Sergio Palao/)).toBeTruthy();

    fireEvent.click(within(row).getByRole('button', { name: 'Use apple tree' }));
    expect(onChoose).toHaveBeenCalledWith(five, 3203);
    await waitFor(() => expect((within(row).getByRole('button', { name: 'Use apple pie' }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('keeps the picture in the document when it is the one clicked', async () => {
    const onChoose = vi.fn(() => Promise.resolve());
    render(<PictureChoices offers={[offer()]} onChoose={onChoose} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'apple (in the document)' })));
    expect(onChoose).toHaveBeenCalledWith(offer(), 2462);
  });

  it('says so when a picture could not be had', async () => {
    render(<PictureChoices offers={[offer()]} onChoose={() => Promise.reject(new Error('502'))} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use apple pie' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be fetched/);
  });

  it('shows nothing with nothing to offer', () => {
    const { container } = render(<PictureChoices offers={[]} onChoose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('ChatPane with pictures', () => {
  const envelope: Envelope = { client_ts: '2026-11-06T10:00:00.000Z', focus_pane: 'chat', doc_id: DOC_ID, thread_id: THREAD_ID };
  const { turn_id: _t, ...stored } = offer();
  void _t;

  it('shows the pictures of a reply above the box while its block is open, and swaps one in', async () => {
    const reply: ChatReply = { ok: true, turn_id: 't1', message: 'Here is an apple.', changes: { blocks: [], docs: [] }, proposed_block_ids: ['IMG'], created_doc_ids: [], pictures: [stored] };
    const api = { getChat: vi.fn(() => Promise.resolve([])), sendChat: vi.fn(() => Promise.resolve(reply)) };
    let open = true;
    const choose = vi.fn(async () => {
      open = false;
    });
    const props = { api, threadId: THREAD_ID, docId: DOC_ID, logger: mockLogger(), getEnvelope: () => envelope, onReply: vi.fn(), batchMs: 10_000 };
    const view = render(<ChatPane {...props} pictures={{ isOpen: () => open, choose }} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Add an apple' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));

    const row = await screen.findByRole('region', { name: 'Pictures for “an apple”' });
    // In the docked composer, before the message box.
    const form = screen.getByLabelText('Message').closest('form')!;
    expect(form.contains(row)).toBe(true);
    await act(async () => fireEvent.click(within(row).getByRole('button', { name: 'Use apple tree' })));
    expect(choose).toHaveBeenCalledWith({ ...stored, turn_id: 't1' }, 3203);
    // The block is decided now: the parent re-renders and the row goes.
    view.rerender(<ChatPane {...props} pictures={{ isOpen: () => open, choose }} />);
    expect(screen.queryByRole('region', { name: 'Pictures for “an apple”' })).toBeNull();
  });

  it('shows the pictures of an earlier turn from the history', async () => {
    const api = {
      getChat: vi.fn(() => Promise.resolve([{ turn_id: 't0', doc_id: DOC_ID, prompt: 'Add an apple', response_text: 'Done.', pictures: [stored], at: envelope.client_ts }])),
      sendChat: vi.fn(),
    };
    render(<ChatPane api={api} threadId={THREAD_ID} docId={DOC_ID} logger={mockLogger()} getEnvelope={() => envelope} onReply={vi.fn()} pictures={{ isOpen: () => true, choose: vi.fn() }} />);
    expect(await screen.findByRole('region', { name: 'Pictures for “an apple”' })).toBeTruthy();
  });
});
