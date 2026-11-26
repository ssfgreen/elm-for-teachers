import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/http';
import type { SessionApi } from '../api/participant';
import type { ChatReply, Envelope } from '../api/types';
import { DOC_ID, THREAD_ID, mockLogger, testBlock } from '../test-utils';
import { splitStreamingReply } from '@edw/shared';
import type { AgentState } from '../api/types';
import { ChatPane } from './ChatPane';
import { draftOf } from './chatReplies';

afterEach(cleanup);

const envelope: Envelope = { client_ts: '2026-10-28T10:00:00.000Z', focus_pane: 'chat', doc_id: DOC_ID, thread_id: THREAD_ID };
const sent = { client_ts: envelope.client_ts, focus_pane: envelope.focus_pane };
const done = (turn_id: string, message: string): Extract<ChatReply, { ok: true }> => ({ ok: true, turn_id, message, changes: { blocks: [], docs: [] }, proposed_block_ids: [], created_doc_ids: [] });

function setup(
  reply: Promise<ChatReply>,
  history: Awaited<ReturnType<SessionApi['getChat']>> = [],
  extra: Partial<Parameters<typeof ChatPane>[0]> = {},
) {
  const api = { getChat: vi.fn(() => Promise.resolve(history)), sendChat: vi.fn(() => reply) };
  const onReply = vi.fn();
  const logger = mockLogger();
  render(<ChatPane api={api} threadId={THREAD_ID} docId={DOC_ID} logger={logger} getEnvelope={() => envelope} onReply={onReply} batchMs={10_000} {...extra} />);
  return { api, onReply, logger };
}

describe('ChatPane', () => {
  it('loads the thread history, posts a prompt about the open doc, renders the reply and hands it up', async () => {
    const block = testBlock({ id: 'B1', status: 'proposed' });
    let resolve!: (r: ChatReply) => void;
    const { api, onReply, logger } = setup(new Promise((r) => (resolve = r)), [
      { turn_id: 't0', doc_id: DOC_ID, prompt: 'Earlier question', response_text: 'Earlier answer', at: '2026-10-28T09:59:00.000Z' },
    ]);
    expect(await screen.findByText('Earlier answer')).toBeTruthy();

    const input = screen.getByLabelText('Message');
    fireEvent.change(input, { target: { value: 'Write a simile' } });
    const send = screen.getByRole('button', { name: 'Send' });
    fireEvent.click(send);

    expect(api.getChat).toHaveBeenCalledWith(THREAD_ID);
    expect(api.sendChat).toHaveBeenCalledWith(THREAD_ID, DOC_ID, 'Write a simile', sent);
    expect(screen.getByText('Write a simile')).toBeTruthy();
    // While the reply comes, Send queues: nothing to queue yet.
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
    // The pending keystroke batch was flushed before sending.
    expect(logger.log).toHaveBeenCalledWith('keystroke_batch', expect.objectContaining({ target: { kind: 'chat' }, char_count: 14 }));

    const reply: ChatReply = { ...done('t1', 'Here is a simile.'), changes: { blocks: [block], docs: [] }, proposed_block_ids: ['B1'] };
    await act(async () => resolve(reply));
    expect(screen.getByText('Here is a simile.')).toBeTruthy();
    expect(onReply).toHaveBeenCalledWith(reply, { threadId: THREAD_ID, docId: DOC_ID });
    // No visible speaker labels: the layout shows who is speaking; screen readers still hear it.
    expect(document.querySelectorAll('.chat-who')).toHaveLength(0);
    expect([...document.querySelectorAll('.chat-message .sr-only')].map((e) => e.textContent)).toEqual(['You:', 'Assistant:', 'You:', 'Assistant:']);
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('');
  });

  it('renders an error reply styled as an error and does not hand it up', async () => {
    const { onReply } = setup(Promise.resolve({ ok: false, turn_id: 't1', message: 'The assistant is unavailable.' }));
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const msg = await screen.findByText('The assistant is unavailable.');
    expect(msg.closest('li')!.className).toContain('chat-error');
    expect(onReply).not.toHaveBeenCalled();
  });

  it('restores the text and logs a client error when the request fails', async () => {
    const { logger } = setup(Promise.reject(new Error('network down')));
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText(/could not be sent/);
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Hello');
    expect(logger.log).toHaveBeenCalledWith('error', expect.objectContaining({ source: 'client' }));
  });

  it("shows the server's wording when the workspace is over its budget", async () => {
    setup(Promise.reject(new ApiError(429, JSON.stringify({ error: 'This workspace has used all of its budget for the assistant.', code: 'budget_spent' }))));
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect((await screen.findByText(/used all of its budget/)).closest('li')!.className).toContain('chat-error');
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Hello');
  });

  it('logs a paste into the chat input', async () => {
    const { logger } = setup(Promise.resolve({ ok: false, turn_id: 't', message: '' }));
    await waitFor(() => expect(screen.getByLabelText('Message')).toBeTruthy());
    fireEvent.paste(screen.getByLabelText('Message'), { clipboardData: { getData: () => 'pasted from elsewhere' } });
    expect(logger.log).toHaveBeenCalledWith('paste', { target: { kind: 'chat' }, length: 21, source: 'external' });
  });

  it('sends the next message as an @model comment on the picked passage and shows the quote', async () => {
    const onClearAnchor = vi.fn();
    const anchor = { block_id: '01ARZ3NDEKTSV4RRFFQ69G5FA1', from: 0, to: 9, quote: 'Her voice was like silk and the night was long' };
    const { api } = setup(
      Promise.resolve(done('t2', 'Reworded.')),
      [{ turn_id: 't0', doc_id: DOC_ID, prompt: 'Earlier', anchor: { block_id: '01ARZ3NDEKTSV4RRFFQ69G5FA1', from: null, to: null, quote: 'old quote' }, response_text: 'Earlier answer', at: '2026-10-28T09:59:00.000Z' }],
      { anchor, onClearAnchor },
    );
    expect(await screen.findByText(/old quote/)).toBeTruthy();
    const note = screen.getByRole('note', { name: 'About' });
    expect(note.textContent).toContain('@model');
    expect(note.textContent).toContain('Her voice was like silk');
    expect(document.activeElement).toBe(screen.getByLabelText('Message'));
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Make it simpler' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(api.sendChat).toHaveBeenCalledWith(THREAD_ID, DOC_ID, 'Make it simpler', sent, anchor);
    expect(onClearAnchor).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Reworded.')).toBeTruthy());
    expect(screen.getAllByText(/Her voice was like silk/).length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole('button', { name: 'Remove the reference' }));
    expect(onClearAnchor).toHaveBeenCalledTimes(2);
  });

  it('sends on Enter and inserts a new line on Shift+Enter', async () => {
    const { api } = setup(Promise.resolve(done('t3', 'Done.')));
    const input = screen.getByLabelText('Message') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'line one' } });
    const shift = fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(shift).toBe(true); // not prevented: the browser inserts the newline
    expect(api.sendChat).not.toHaveBeenCalled();
    const enter = fireEvent.keyDown(input, { key: 'Enter' });
    expect(enter).toBe(false); // prevented: no newline
    expect(api.sendChat).toHaveBeenCalledWith(THREAD_ID, DOC_ID, 'line one', sent);
    await waitFor(() => expect(screen.getByText('Done.')).toBeTruthy());
    // Enter on an empty composer does nothing.
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(api.sendChat).toHaveBeenCalledTimes(1);
  });

  it('renders assistant replies as Markdown and keeps the teacher\'s text plain', async () => {
    const reply = [
      'Keep the same goal but reduce the reading load:',
      '',
      '## Support',
      '',
      '- Read the definitions **aloud**.',
      '- Give the examples as *strips* to sort.',
      '',
      '1. First',
      '2. Second',
      '',
      '| Word | Type |',
      '| --- | --- |',
      '| silk | simile |',
      '',
      '<b>raw html</b> ![x](https://example.com/x.png) [link](https://example.com)',
    ].join('\n');
    setup(Promise.resolve(done('t4', reply)));
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: '- not a list, **not bold**' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const heading = await screen.findByRole('heading', { name: 'Support' });
    const md = heading.closest('.chat-md')!;
    expect(md.querySelectorAll('ul > li')).toHaveLength(2);
    expect(md.querySelector('ul strong')?.textContent).toBe('aloud');
    expect(md.querySelector('ul em')?.textContent).toBe('strips');
    expect(md.querySelectorAll('ol > li')).toHaveLength(2);
    expect(md.querySelector('table th')?.textContent).toBe('Word');
    expect(md.querySelector('b')).toBeNull();
    expect(md.querySelector('img')).toBeNull();
    expect(md.querySelector('a')?.getAttribute('target')).toBe('_blank');
    expect(md.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
    // The teacher's own message is shown exactly as typed.
    expect(screen.getByText('- not a list, **not bold**')).toBeTruthy();
  });

  it('exposes a send function for the editor\'s inline @model prompt', async () => {
    const sendRef: { current: ((text: string, anchor?: import('@edw/shared').CommentAnchor) => void) | null } = { current: null };
    const { api } = setup(Promise.resolve(done('t5', 'Changed it.')), [], { sendRef });
    await waitFor(() => expect(sendRef.current).not.toBeNull());
    const anchor = { block_id: '01ARZ3NDEKTSV4RRFFQ69G5FA1', from: null, to: null, quote: null };
    await act(async () => sendRef.current!('Make this a metaphor', anchor));
    expect(api.sendChat).toHaveBeenCalledWith(THREAD_ID, DOC_ID, 'Make this a metaphor', sent, anchor);
    expect(screen.getByText('Make this a metaphor')).toBeTruthy();
    expect(screen.getByText(/about a block/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Changed it.')).toBeTruthy());
  });

  it('shows thinking dots, then the reply as it streams, then the final message', async () => {
    let push!: (d: string) => void;
    let finish!: (r: ChatReply) => void;
    const onDraft = vi.fn();
    const api = {
      getChat: vi.fn(() => Promise.resolve([])),
      sendChat: vi.fn(),
      sendChatStream: vi.fn((_t: string, _d: string, _p: string, _e: unknown, _a: unknown, onText: (d: string) => void) => {
        push = (d) => onText(d);
        return new Promise<ChatReply>((r) => (finish = r));
      }),
    };
    render(<ChatPane api={api} threadId={THREAD_ID} docId={DOC_ID} logger={mockLogger()} getEnvelope={() => envelope} onReply={vi.fn()} onDraft={onDraft} batchMs={10_000} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Make a worksheet' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });
    expect(api.sendChatStream.mock.calls[0]!.slice(0, 5)).toEqual([THREAD_ID, DOC_ID, 'Make a worksheet', sent, undefined]);
    expect(screen.getByRole('status').textContent).toBe('Thinking…');

    act(() => push('Here is **a draft**'));
    expect(screen.queryByText('Thinking…')).toBeNull();
    expect(document.querySelector('.chat-draft strong')?.textContent).toBe('a draft');
    act(() => push('.\n\n```json\n[{"op":'));
    expect(document.querySelector('.chat-draft')!.textContent).not.toContain('```');
    expect(screen.getByRole('status').textContent).toBe('Writing in the document…');
    expect(onDraft).toHaveBeenLastCalledWith({ raw: 'Here is **a draft**.\n\n```json\n[{"op":', threadId: THREAD_ID, docId: DOC_ID });

    await act(async () => finish(done('t9', 'Here is **a draft**.')));
    expect(document.querySelector('.chat-draft')).toBeNull();
    expect(screen.getByText('a draft').tagName).toBe('STRONG');
    expect(onDraft).toHaveBeenLastCalledWith(null);
  });

  it('shows thinking dots while a non-streamed reply is on its way', async () => {
    let finish!: (r: ChatReply) => void;
    setup(new Promise((r) => (finish = r)), []);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByRole('status').textContent).toBe('Thinking…');
    await act(async () => finish(done('t1', 'Hello.')));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it("shows what an agent-mode reply is doing, and hands its edits on as a draft the live preview reads", async () => {
    let state!: (s: AgentState) => void;
    const api = {
      getChat: vi.fn(() => Promise.resolve([])),
      sendChat: vi.fn(),
      sendChatStream: vi.fn((_t: string, _d: string, _p: string, _e: unknown, _a: unknown, _onText: unknown, onState?: (s: AgentState) => void) => {
        state = onState!;
        return new Promise<ChatReply>(() => undefined);
      }),
    };
    const onDraft = vi.fn();
    render(<ChatPane api={api} threadId={THREAD_ID} docId={DOC_ID} logger={mockLogger()} getEnvelope={() => envelope} onReply={vi.fn()} batchMs={10_000} onDraft={onDraft} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Add a title' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });
    act(() => state({ text: '', operations: [], status: 'Reading “Answers”' }));
    expect(screen.getByRole('status').textContent).toBe('Reading “Answers”…');
    const op = { op: 'insert' as const, after: 'start', type: 'heading' as const, content: '# Similes' };
    act(() => state({ text: 'I added a title.', operations: [op], status: null }));
    expect(screen.getByText('I added a title.')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(onDraft).toHaveBeenLastCalledWith({ raw: draftOf({ text: 'I added a title.', operations: [op], status: null }), threadId: THREAD_ID, docId: DOC_ID });
    expect(splitStreamingReply(onDraft.mock.lastCall![0].raw)).toMatchObject({ message: 'I added a title.', opsDone: true });
  });

  it('shows what the model thinks and does as steps, live, then folds them into one line that opens', async () => {
    let state!: (s: AgentState) => void;
    let finish!: (r: ChatReply) => void;
    const thinking = { kind: 'thinking' as const, title: 'Reading the request', detail: 'The teacher wants a word bank.' };
    const api = {
      getChat: vi.fn(() => Promise.resolve([])),
      sendChat: vi.fn(),
      sendChatStream: vi.fn((_t: string, _d: string, _p: string, _e: unknown, _a: unknown, _onText: unknown, onState?: (s: AgentState) => void) => {
        state = onState!;
        return new Promise<ChatReply>((r) => (finish = r));
      }),
    };
    render(<ChatPane api={api} threadId={THREAD_ID} docId={DOC_ID} logger={mockLogger()} getEnvelope={() => envelope} onReply={vi.fn()} batchMs={10_000} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Add a word bank' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });
    const tool = { kind: 'tool' as const, title: 'Writing in the document', request: '{"operations": []}', running: true };
    act(() => state({ text: '', operations: [], status: 'Writing in the document', steps: [thinking, tool] }));
    expect(screen.getByText('Reading the request')).toBeTruthy();
    expect(screen.getByText('Writing in the document')).toBeTruthy();
    // The running step is in the card, so it is not named a second time below it.
    expect(screen.queryByRole('status')).toBeNull();

    const finished = [thinking, { kind: 'tool' as const, title: 'Edited the document (1 change)', request: '{"operations": []}', response: '{"accepted": 1}' }];
    await act(async () => finish({ ...done('t1', 'I added a word bank.'), steps: finished, worked_ms: 3200 }));
    const fold = screen.getByRole('button', { name: /Worked for 3 s · 2 steps/ });
    expect(screen.queryByText('Edited the document (1 change)')).toBeNull();
    fireEvent.click(fold);
    fireEvent.click(screen.getByRole('button', { name: /Edited the document/ }));
    expect(screen.getByText('Request')).toBeTruthy();
    expect(screen.getByText('{"accepted": 1}')).toBeTruthy();
  });

  it('keeps the steps of earlier replies when the chat reloads', async () => {
    setup(new Promise(() => undefined), [
      { turn_id: 't0', doc_id: DOC_ID, prompt: 'Q', response_text: 'A', at: '2026-10-28T09:59:00.000Z', steps: [{ kind: 'thinking', title: 'Planning' }], worked_ms: 61_000 },
    ]);
    expect(await screen.findByRole('button', { name: /Worked for 1 min 1 s · 1 step/ })).toBeTruthy();
  });

  it('Stop cuts the reply off where it was, tells the server what was shown, and hands nothing up', async () => {
    let push!: (d: string) => void;
    const onReply = vi.fn();
    const onDraft = vi.fn();
    const api = {
      getChat: vi.fn(() => Promise.resolve([])),
      sendChat: vi.fn(),
      stopChat: vi.fn(() => Promise.resolve()),
      sendChatStream: vi.fn(
        (_t: string, _d: string, _p: string, _e: unknown, _a: unknown, onText: (d: string) => void, _s: unknown, control?: { signal?: AbortSignal; onStart?: (id: string) => void }) => {
          push = onText;
          control!.onStart!('t7');
          return new Promise<ChatReply>((_r, reject) => control!.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
        },
      ),
    };
    const logger = mockLogger();
    render(<ChatPane api={api} threadId={THREAD_ID} docId={DOC_ID} logger={logger} getEnvelope={() => envelope} onReply={onReply} onDraft={onDraft} batchMs={10_000} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Write a story' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });
    act(() => push('Once upon a time\n\n```json\n[{"op":'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    });
    expect(api.stopChat).toHaveBeenCalledWith(THREAD_ID, 't7', 'Once upon a time', envelope);
    expect(screen.getByText('Once upon a time')).toBeTruthy();
    expect(screen.getByText(/Stopped\. Nothing from this reply/)).toBeTruthy();
    expect(document.querySelector('.chat-draft')).toBeNull();
    expect(onReply).not.toHaveBeenCalled();
    expect(onDraft).toHaveBeenLastCalledWith(null);
    expect(logger.log).not.toHaveBeenCalledWith('error', expect.anything());
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
  });

  it('Escape in the composer stops the reply too', async () => {
    const api = {
      getChat: vi.fn(() => Promise.resolve([])),
      sendChat: vi.fn(),
      stopChat: vi.fn(() => Promise.resolve()),
      sendChatStream: vi.fn((_t: string, _d: string, _p: string, _e: unknown, _a: unknown, _o: unknown, _s: unknown, control?: { signal?: AbortSignal; onStart?: (id: string) => void }) => {
        control!.onStart!('t8');
        return new Promise<ChatReply>((_r, reject) => control!.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      }),
    };
    render(<ChatPane api={api} threadId={THREAD_ID} docId={DOC_ID} logger={mockLogger()} getEnvelope={() => envelope} onReply={vi.fn()} batchMs={10_000} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText('Message'), { key: 'Escape' });
    });
    expect(api.stopChat).toHaveBeenCalledWith(THREAD_ID, 't8', '', envelope);
    expect(screen.getByText(/Stopped\./)).toBeTruthy();
  });

  it('keeps the chat column scrolled to the bottom when a message is sent and while the reply streams', async () => {
    let push!: (d: string) => void;
    const api = {
      getChat: vi.fn(() => Promise.resolve([])),
      sendChat: vi.fn(),
      sendChatStream: vi.fn((_t: string, _d: string, _p: string, _e: unknown, _a: unknown, onText: (d: string) => void) => {
        push = onText;
        return new Promise<ChatReply>(() => undefined);
      }),
    };
    const column = document.createElement('div');
    column.style.overflowY = 'auto';
    document.body.appendChild(column);
    let height = 1000;
    Object.defineProperty(column, 'scrollHeight', { get: () => height });
    render(<ChatPane api={api} threadId={THREAD_ID} docId={DOC_ID} logger={mockLogger()} getEnvelope={() => envelope} onReply={vi.fn()} batchMs={10_000} />, { container: column });
    column.scrollTop = 0;
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } });
    height = 1400;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });
    expect(column.scrollTop).toBe(1400);
    column.scrollTop = 0;
    height = 1800;
    act(() => push('Here'));
    expect(column.scrollTop).toBe(1800);
    column.remove();
  });

  it('"+" adds files to the chat, shows them as chips, attaches them to the message, and removes one', async () => {
    let finish!: (r: { id: string; name: string }) => void;
    const addChatFile = vi.fn((_t: string, file: File) =>
      file.name === 'Huge.pdf'
        ? Promise.reject(new ApiError(409, JSON.stringify({ error: 'This chat already has 20 files, the most it can hold.' })))
        : file.name === 'Curriculum.pdf'
          ? new Promise((r) => (finish = r))
          : Promise.resolve({ id: 'R2', name: file.name }),
    );
    const deleteReference = vi.fn(() => Promise.resolve());
    const reply = Promise.resolve(done('t1', 'Done.'));
    const api = { getChat: vi.fn(() => Promise.resolve([])), sendChat: vi.fn(() => reply), addChatFile, deleteReference } as unknown as Parameters<typeof ChatPane>[0]['api'];
    render(<ChatPane api={api} threadId={THREAD_ID} docId={DOC_ID} logger={mockLogger()} getEnvelope={() => envelope} onReply={vi.fn()} batchMs={10_000} />);
    const files = [new File(['%PDF'], 'Curriculum.pdf'), new File(['x'], 'Worksheet.docx'), new File(['x'], 'Huge.pdf')];
    fireEvent.change(screen.getByLabelText('Files to add'), { target: { files } });
    expect(addChatFile).toHaveBeenCalledTimes(3);
    expect(addChatFile.mock.calls[0]![0]).toBe(THREAD_ID);
    const chips = screen.getByRole('list', { name: 'Files for this message' });
    expect(chips.textContent).toContain('Reading…');
    expect(await screen.findByText('This chat already has 20 files, the most it can hold.')).toBeTruthy();
    // Send waits for the files to be read.
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Adapt this worksheet to the curriculum' } });
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish({ id: 'R1', name: 'Curriculum.pdf' }));
    // The refused one goes with its cross; the ready ones go with the message.
    fireEvent.click(screen.getByRole('button', { name: 'Remove Huge.pdf' }));
    expect(deleteReference).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });
    expect(api.sendChat).toHaveBeenCalledWith(THREAD_ID, DOC_ID, 'Adapt this worksheet to the curriculum', sent, undefined, ['R1', 'R2']);
    expect(screen.queryByRole('list', { name: 'Files for this message' })).toBeNull();
    const onMessage = screen.getByRole('list', { name: 'Attached files' });
    expect(Array.from(onMessage.querySelectorAll('.file-tile-name')).map((e) => e.textContent)).toEqual(['Curriculum.pdf', 'Worksheet.docx']);
    expect(Array.from(onMessage.querySelectorAll('.file-tile-badge')).map((e) => e.textContent)).toEqual(['PDF', 'DOCX']);
    // A ready file removed before sending is deleted again.
    fireEvent.change(screen.getByLabelText('Files to add'), { target: { files: [new File(['x'], 'Notes.txt')] } });
    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Notes.txt' }));
    expect(deleteReference).toHaveBeenCalledWith('R2', envelope);
  });

  it('shows the files on a message from the history', async () => {
    setup(Promise.resolve(done('t1', 'x')), [{ turn_id: 't0', doc_id: DOC_ID, prompt: 'Use this', response_text: 'OK', attachments: [{ id: 'R1', name: 'Curriculum.pdf' }], at: '2026-10-28T09:59:00.000Z' }]);
    expect((await screen.findByRole('list', { name: 'Attached files' })).textContent).toBe('Curriculum.pdfPDF');
  });
});
