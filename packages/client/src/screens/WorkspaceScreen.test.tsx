import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import type { Doc } from '@edw/shared';
import type { SessionApi } from '../api/participant';
import type { AgentState, ChatReply } from '../api/types';
import type { StructuralCommand } from '../editor/types.js';
import type { EventContext } from '../events/logger';
import { createFocusPaneState } from '../events/trackers';
import { DOC_ID, THREAD_ID, installEditorPolyfills, installIntersectionObserver, makeSession, mockLogger, setWindowWidth, testBlock, testDoc, testThread } from '../test-utils';
import { WorkspaceScreen } from './WorkspaceScreen';
import { SUGGESTION_SELECT } from '../editor/extensions/trackChanges.js';
import { joinRuns } from '@edw/shared';
import { OLD_THREAD, OLD_DOC, NEW_ID, mockApi, baseSnap, baseThreads, renderScreen, readBlob, readBytes, docTitle, chatTitle, logged } from './workspaceTestKit';

beforeAll(() => {
  installIntersectionObserver();
  installEditorPolyfills();
});
beforeEach(() => localStorage.clear());
afterEach(cleanup);


describe('WorkspaceScreen', () => {
  it('lays out chats, chat and document, opening the newest chat on its first doc', async () => {
    const { context, logger } = await renderScreen();
    const panes = [...document.querySelectorAll('[data-pane]')].map((e) => e.getAttribute('data-pane'));
    expect(panes).toEqual(['threads', 'chat', 'canvas']);
    expect(docTitle()).toBe('Similes');
    expect(screen.getByText('Similes compare using like or as.')).toBeTruthy();
    expect(screen.queryByText('Second doc text')).toBeNull();
    expect(chatTitle()).toBe('Similes for P7');
    expect(context.current).toEqual({ doc_id: DOC_ID, thread_id: THREAD_ID });
    // The initial open is not a teacher action.
    expect(logged(logger, 'doc_open')).toEqual([]);
    const items = within(screen.getByRole('region', { name: 'Chats list' })).getAllByRole('button', { name: /for P/ });
    expect(items.map((b) => b.textContent)).toEqual(['Similes for P7', 'Metaphors for P6']);
  });

  it('reopens the doc open last time in this browser', async () => {
    localStorage.setItem('edw.lastDoc.S1', OLD_DOC);
    await renderScreen();
    expect(docTitle()).toBe('Metaphors');
    expect(chatTitle()).toBe('Metaphors for P6');
  });

  it('lists the open chat\'s docs under it, names other chats\' docs on hover, and opens a doc from another chat', async () => {
    const { logger, context } = await renderScreen();
    expect(screen.queryByRole('button', { name: 'Documents' })).toBeNull();
    const docs = screen.getByRole('list', { name: 'Documents in Similes for P7' });
    expect(within(docs).getAllByRole('button').map((b) => b.textContent || b.getAttribute('aria-label'))).toEqual(['Similes', 'Options for Similes', 'Short version', 'Options for Short version']);
    expect(within(docs).getByRole('button', { name: 'Similes' }).getAttribute('aria-current')).toBe('true');
    const peek = screen.getByRole('img', { name: 'Documents: Metaphors' });
    expect(peek.getAttribute('data-tip')).toBe('Metaphors');

    fireEvent.click(within(screen.getByRole('region', { name: 'Chats list' })).getByRole('button', { name: 'Metaphors for P6' }));
    expect(docTitle()).toBe('Metaphors');
    expect(screen.getByText('Old chat doc text')).toBeTruthy();
    expect(chatTitle()).toBe('Metaphors for P6');
    expect(context.current).toEqual({ doc_id: OLD_DOC, thread_id: OLD_THREAD });
    expect(logged(logger, 'thread_open')).toEqual([{ thread_id: OLD_THREAD }]);
    expect(within(screen.getByRole('list', { name: 'Documents in Metaphors for P6' })).getByRole('button', { name: 'Metaphors' }).getAttribute('aria-current')).toBe('true');
    expect(screen.queryByRole('list', { name: 'Documents in Similes for P7' })).toBeNull();
    expect(screen.getByRole('img', { name: 'Documents: Similes, Short version' }).getAttribute('data-tip')).toBe('Similes\nShort version');
  });

  it('a click on the open chat folds its docs away, and another unfolds them', async () => {
    const { api } = await renderScreen();
    const chat = () => within(screen.getByRole('region', { name: 'Chats list' })).getByRole('button', { name: 'Similes for P7' });
    expect(chat().getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(chat());
    expect(chat().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('list', { name: 'Documents in Similes for P7' })).toBeNull();
    // Folded, it names its docs on hover like the others.
    expect(screen.getByRole('img', { name: 'Documents: Similes, Short version' })).toBeTruthy();
    expect(docTitle()).toBe('Similes');
    fireEvent.click(chat());
    expect(screen.getByRole('list', { name: 'Documents in Similes for P7' })).toBeTruthy();
    expect(api.structural).not.toHaveBeenCalled();
  });

  it('opens a doc from the list under the open chat', async () => {
    const { logger } = await renderScreen();
    fireEvent.click(within(screen.getByRole('list', { name: 'Documents in Similes for P7' })).getByRole('button', { name: 'Short version' }));
    expect(docTitle()).toBe('Short version');
    expect(logged(logger, 'doc_open')).toHaveLength(1);
  });

  it('makes a blank doc in the open chat with +, and opens it', async () => {
    const { api, logger } = await renderScreen();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create new' }));
    });
    const cmd = api.structural.mock.calls[0]![0];
    expect(cmd).toMatchObject({ command: 'doc_create', thread_id: THREAD_ID, name: 'Untitled' });
    expect(docTitle()).toBe('Untitled');
    expect(logged(logger, 'doc_open')).toEqual([{ doc_id: (cmd as { id: string }).id }]);
    expect(logged(logger, 'thread_open')).toEqual([]);
  });

  it('deletes a doc from its … menu after a Yes, opening the chat\'s other doc', async () => {
    const { api } = await renderScreen();
    const docs = () => within(screen.getByRole('list', { name: 'Documents in Similes for P7' }));
    fireEvent.click(docs().getByRole('button', { name: 'Options for Similes' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    // No keeps it.
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete document' })).getByRole('button', { name: 'No' }));
    expect(api.structural).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Delete document' })).toBeNull();

    fireEvent.click(docs().getByRole('button', { name: 'Options for Similes' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete document' })).getByRole('button', { name: 'Yes' }));
    });
    expect(api.structural).toHaveBeenCalledWith({ command: 'doc_delete', doc_id: DOC_ID }, expect.anything());
    expect(docs().getAllByRole('button', { name: /^(?!Options)/ }).map((b) => b.textContent)).toEqual(['Short version']);
    expect(docTitle()).toBe('Short version');
  });

  it('deleting a chat\'s only doc leaves a blank one in its place', async () => {
    const { api } = await renderScreen();
    fireEvent.click(within(screen.getByRole('region', { name: 'Chats list' })).getByRole('button', { name: 'Metaphors for P6' }));
    const docs = () => within(screen.getByRole('list', { name: 'Documents in Metaphors for P6' }));
    fireEvent.click(docs().getByRole('button', { name: 'Options for Metaphors' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete document' })).getByRole('button', { name: 'Yes' }));
    });
    expect(api.structural.mock.calls.map((c) => c[0].command)).toEqual(['doc_delete', 'doc_create']);
    expect(docTitle()).toBe('Untitled');
    expect(docs().getByRole('button', { name: 'Untitled' }).getAttribute('aria-current')).toBe('true');
  });

  it('duplicates the open doc into the same chat and opens the copy', async () => {
    const { api, logger } = await renderScreen();
    expect(screen.getByRole('button', { name: 'Duplicate' }).getAttribute('data-tip')).toBe('Duplicate');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    });
    const cmd = api.structural.mock.calls[0]![0];
    expect(cmd).toMatchObject({ command: 'doc_duplicate', doc_id: DOC_ID, name: 'Similes (copy)' });
    expect(docTitle()).toBe('Similes (copy)');
    expect(screen.getByText('Similes compare using like or as.')).toBeTruthy();
    expect(chatTitle()).toBe('Similes for P7');
    expect(logged(logger, 'doc_open')).toEqual([{ doc_id: (cmd as { id: string }).id }]);
  });

  it('downloads the open doc as Word, markdown or JSON from the Download menu, named after the doc, and logs it', async () => {
    const { logger } = await renderScreen();
    const saved: Array<{ name: string; text: string }> = [];
    const blobs = new Map<string, Blob>();
    URL.createObjectURL = vi.fn((b: Blob) => {
      const url = `blob:${blobs.size}`;
      blobs.set(url, b);
      return url;
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ name: this.download, text: '' });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(within(screen.getByRole('menu', { name: 'Download' })).getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Word (.docx)', 'Markdown (.md)', 'JSON (.json)']);
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Markdown (.md)' }));
      await new Promise((r) => setTimeout(r, 5));
    });
    await waitFor(() => expect(saved.map((f) => f.name)).toEqual(['Similes.md']));
    expect(await readBlob(blobs.get('blob:0')!)).toBe('Similes compare using like or as.\n');
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'JSON (.json)' }));
      await new Promise((r) => setTimeout(r, 5));
    });
    await waitFor(() => expect(saved.map((f) => f.name)).toEqual(['Similes.md', 'Similes.json']));
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Word (.docx)' }));
      await new Promise((r) => setTimeout(r, 50));
    });
    await waitFor(() => expect(saved.map((f) => f.name)).toEqual(['Similes.md', 'Similes.json', 'Similes.docx']), { timeout: 5000 });
    const docx = blobs.get('blob:2')!;
    expect(docx.size).toBeGreaterThan(1000);
    expect(JSON.parse(await readBlob(blobs.get('blob:1')!))).toMatchObject({ name: 'Similes', blocks: [{ content: 'Similes compare using like or as.' }] });
    expect(logged(logger, 'doc_export')).toEqual([
      { doc_id: DOC_ID, format: 'markdown' },
      { doc_id: DOC_ID, format: 'json' },
      { doc_id: DOC_ID, format: 'docx' },
    ]);
    click.mockRestore();
  });

  it("shows the open doc's comments beside it, highlights the quoted text, and deletes a thread", async () => {
    const root = {
      id: '01JC0MMENT0000000000000001',
      session_id: 'S1',
      doc_id: DOC_ID,
      block_id: '01JB10CK000000000000000001',
      root_id: null,
      author: 'teacher' as const,
      body: 'Is this clear for P4?',
      quote: 'like or as',
      turn_id: null,
      created_at: '2026-10-29T12:10:00.000Z',
      edited_at: null,
      resolved_at: null,
      deleted_at: null,
    };
    const snap = baseSnap();
    const threads = baseThreads();
    const api = mockApi(snap, threads);
    api.listComments.mockResolvedValue([root]);
    const logger = mockLogger();
    render(<WorkspaceScreen session={makeSession()} api={api} logger={logger} focusState={createFocusPaneState()} context={{ current: { doc_id: null, thread_id: null } }} />);
    const panel = await screen.findByRole('complementary', { name: 'Comments' });
    expect(api.listComments).toHaveBeenCalledWith(DOC_ID);
    expect(within(panel).getByText('Is this clear for P4?')).toBeTruthy();
    await waitFor(() => expect(document.querySelector('.canvas-pm .comment-mark')?.textContent).toBe('like or as'));
    fireEvent.click(within(panel).getByRole('group', { name: /Comment thread/ }));
    fireEvent.click(within(panel).getByRole('button', { name: 'More actions for this thread' }));
    fireEvent.click(within(panel).getByRole('menuitem', { name: 'Delete' }));
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: 'Delete' }));
    });
    expect(api.deleteComment).toHaveBeenCalledWith(root.id, expect.objectContaining({ doc_id: DOC_ID }));
    // No threads left: the column closes and the highlight goes.
    expect(screen.queryByRole('complementary', { name: 'Comments' })).toBeNull();
    await waitFor(() => expect(document.querySelector('.canvas-pm .comment-mark')).toBeNull());
  });

  it('resolving a thread folds it away and takes its highlight; reopening brings both back', async () => {
    const root = { id: '01JC0MMENT0000000000000001', session_id: 'S1', doc_id: DOC_ID, block_id: '01JB10CK000000000000000001', root_id: null, author: 'teacher' as const, body: 'Is this clear for P4?', quote: 'like or as', turn_id: null, created_at: '2026-10-29T12:10:00.000Z', edited_at: null, resolved_at: null, deleted_at: null };
    const api = mockApi(baseSnap(), baseThreads());
    api.listComments.mockResolvedValue([root]);
    api.resolveComment.mockImplementation((_id, resolved) => Promise.resolve({ ...root, resolved_at: resolved ? '2026-10-29T12:30:00.000Z' : null }));
    render(<WorkspaceScreen session={makeSession()} api={api} logger={mockLogger()} focusState={createFocusPaneState()} context={{ current: { doc_id: null, thread_id: null } }} />);
    const panel = await screen.findByRole('complementary', { name: 'Comments' });
    await waitFor(() => expect(document.querySelector('.canvas-pm .comment-mark')).toBeTruthy());
    fireEvent.click(within(panel).getByRole('button', { name: 'More actions for this thread' }));
    await act(async () => {
      fireEvent.click(within(panel).getByRole('menuitem', { name: 'Resolve' }));
    });
    expect(api.resolveComment).toHaveBeenCalledWith(root.id, true, expect.objectContaining({ doc_id: DOC_ID }));
    expect(within(panel).getByText('No open comments.')).toBeTruthy();
    expect(within(panel).queryByText('Is this clear for P4?')).toBeNull();
    await waitFor(() => expect(document.querySelector('.canvas-pm .comment-mark')).toBeNull());
    fireEvent.click(within(panel).getByRole('button', { name: 'Resolved (1)' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'More actions for this thread' }));
    await act(async () => {
      fireEvent.click(within(panel).getByRole('menuitem', { name: 'Reopen' }));
    });
    expect(api.resolveComment).toHaveBeenLastCalledWith(root.id, false, expect.anything());
    await waitFor(() => expect(document.querySelector('.canvas-pm .comment-mark')).toBeTruthy());
  });

  it('a reply with @model asks the assistant, which answers in the thread while the card says what it is doing', async () => {
    const base = { session_id: 'S1', doc_id: DOC_ID, block_id: '01JB10CK000000000000000001', turn_id: null, edited_at: null, resolved_at: null, deleted_at: null };
    const root = { ...base, id: '01JC0MMENT0000000000000001', root_id: null, author: 'teacher' as const, body: 'Too long?', quote: 'like or as', created_at: '2026-10-29T12:10:00.000Z' };
    const ask = { ...base, id: '01JC0MMENT0000000000000002', root_id: root.id, author: 'teacher' as const, body: '@model can you shorten it?', quote: null, created_at: '2026-10-29T12:11:00.000Z' };
    const answer = { ...base, id: '01JC0MMENT0000000000000003', root_id: root.id, author: 'model' as const, body: 'I have suggested a shorter version.', quote: null, turn_id: 't9', created_at: '2026-10-29T12:11:30.000Z' };
    const api = mockApi(baseSnap(), baseThreads());
    api.listComments.mockResolvedValue([root]);
    api.createComment.mockResolvedValue(ask);
    let finish!: (r: ChatReply) => void;
    let progress!: (s: AgentState) => void;
    api.answerComment.mockImplementation((_t, _c, _e, onState) => {
      progress = onState!;
      return new Promise((r) => (finish = r));
    });
    render(<WorkspaceScreen session={makeSession()} api={api} logger={mockLogger()} focusState={createFocusPaneState()} context={{ current: { doc_id: null, thread_id: null } }} />);
    const panel = await screen.findByRole('complementary', { name: 'Comments' });
    fireEvent.click(within(panel).getByRole('group', { name: /Comment thread/ }));
    fireEvent.change(within(panel).getByLabelText('Reply'), { target: { value: ask.body } });
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: 'Reply' }));
    });
    expect(api.createComment).toHaveBeenCalledWith({ doc_id: DOC_ID, root_id: root.id, body: ask.body }, expect.anything());
    await waitFor(() => expect(api.answerComment).toHaveBeenCalledWith(THREAD_ID, ask, expect.anything(), expect.any(Function)));
    expect(within(panel).getByRole('status').textContent).toBe('Thinking…');
    act(() => progress({ text: '', operations: [], status: 'Writing in the document' }));
    expect(within(panel).getByRole('status').textContent).toBe('Writing in the document…');
    await act(async () => {
      finish({ ok: true, turn_id: 't9', message: answer.body, changes: { blocks: [], docs: [] }, proposed_block_ids: [], created_doc_ids: [], comment: answer });
    });
    expect(within(panel).getByText('I have suggested a shorter version.')).toBeTruthy();
    expect(within(panel).queryByRole('status')).toBeNull();
  });

  it('comments the assistant leaves from a chat message appear beside the doc', async () => {
    const { api } = await renderScreen();
    const note = { id: '01JC0MMENT0000000000000009', session_id: 'S1', doc_id: DOC_ID, block_id: '01JB10CK000000000000000001', root_id: null, author: 'model' as const, body: 'Add an example here.', quote: 'like or as', turn_id: 't1', created_at: '2026-10-29T12:20:00.000Z', edited_at: null, resolved_at: null, deleted_at: null };
    api.sendChat.mockResolvedValue({ ok: true, turn_id: 't1', message: 'I left a comment.', changes: { blocks: [], docs: [] }, proposed_block_ids: [], created_doc_ids: [], comments: [note] });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Review this please' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });
    const panel = await screen.findByRole('complementary', { name: 'Comments' });
    expect(within(panel).getByText('Assistant')).toBeTruthy();
    expect(within(panel).getByText('Add an example here.')).toBeTruthy();
  });

  it("shows the guest account at the foot of the sidebar, whose menu downloads the teacher's documents and chats", async () => {
    const { api } = await renderScreen();
    api.getChat.mockImplementation(async (threadId: string) =>
      threadId === THREAD_ID ? [{ turn_id: 't1', doc_id: DOC_ID, prompt: 'Make a simile worksheet', anchor: null, response_text: 'Here it is.', at: '2026-10-29T12:05:00.000Z' }] : [],
    );
    const names: string[] = [];
    let zipped: Blob | null = null;
    URL.createObjectURL = vi.fn((b: Blob) => {
      zipped = b;
      return 'blob:zip';
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    const nav = screen.getByRole('navigation', { name: 'Chats' });
    const chip = within(nav).getByRole('button', { name: 'Account: Year 7 English (guest)' });
    expect(chip.textContent).toBe('YYear 7 English (guest)');
    fireEvent.click(chip);
    const menu = screen.getByRole('menu', { name: 'Account' });
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Documents and chats (.zip)' }));
    });
    await waitFor(() => expect(names).toEqual(['Year 7 English.zip']));
    const zip = await JSZip.loadAsync(await readBytes(zipped!));
    expect(Object.keys(zip.files).filter((f) => !f.endsWith('/')).sort()).toEqual([
      `chats/${baseThreads().find((t) => t.id === THREAD_ID)!.title}.txt`,
      'documents/Metaphors.docx',
      'documents/Short version.docx',
      'documents/Similes.docx',
    ]);
    const chat = await zip.file(/^chats\//)[0]!.async('string');
    expect(chat).toContain('Make a simile worksheet');
    expect(chat).toContain('Assistant:\nHere it is.');
    expect(screen.queryByRole('menu', { name: 'Account' })).toBeNull();
    // Closed, the sidebar and its account chip are gone (there is no rail).
    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }));
    expect(screen.queryByRole('button', { name: 'Account: Year 7 English (guest)' })).toBeNull();
    click.mockRestore();
  });

  it('resizes the sidebar from its edge, within limits, and remembers the width', async () => {
    await renderScreen();
    const nav = screen.getByRole('navigation', { name: 'Chats' });
    const edge = screen.getByRole('separator', { name: 'Resize the sidebar' });
    expect(nav.style.width).toBe('260px');
    fireEvent.keyDown(edge, { key: 'ArrowRight' });
    expect(nav.style.width).toBe('284px');
    expect(localStorage.getItem('edw.sidebarWidth')).toBe('284');
    for (let i = 0; i < 20; i++) fireEvent.keyDown(edge, { key: 'ArrowLeft' });
    expect(nav.style.width).toBe('200px');
    // Closed, it and its handle are gone; opened again, it keeps its width.
    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }));
    expect(screen.queryByRole('separator', { name: 'Resize the sidebar' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Chats' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }));
    expect(screen.getByRole('navigation', { name: 'Chats' }).style.width).toBe('200px');
  });

  it('resizes the comments column from its edge: dragging towards it narrows it', async () => {
    const api = mockApi(baseSnap(), baseThreads());
    const root = { id: 'c1', session_id: 's', doc_id: DOC_ID, block_id: 'b1', root_id: null, author: 'teacher' as const, body: 'Is this clear?', quote: null, turn_id: null, created_at: '2026-10-29T12:10:00.000Z', edited_at: null, resolved_at: null, deleted_at: null };
    api.listComments.mockResolvedValue([root]);
    render(<WorkspaceScreen session={makeSession()} api={api} logger={mockLogger()} focusState={createFocusPaneState()} context={{ current: { doc_id: null, thread_id: null } }} />);
    const panel = await screen.findByRole('complementary', { name: 'Comments' });
    const edge = screen.getByRole('separator', { name: 'Resize the comments' });
    expect(panel.style.flexBasis).toBe('300px');
    fireEvent.keyDown(edge, { key: 'ArrowLeft' });
    expect(panel.style.flexBasis).toBe('324px');
    expect(localStorage.getItem('edw.commentsWidth')).toBe('324');
  });

  it('keeps edge tooltips on screen: sidebar ones hang right, document header ones hang left', async () => {
    await renderScreen();
    expect(screen.getByRole('button', { name: 'Close sidebar' }).className).toContain('tip-start');
    for (const name of ['Create new', 'Duplicate', 'Download']) expect(screen.getByRole('button', { name }).className, name).toContain('tip-end');
  });

  it('uploads a Word document as a new doc in the open chat and opens it', async () => {
    const { api } = await renderScreen();
    const bytes = readFileSync(join(__dirname, '../../../../fixtures/docx/P7 Similes and Metaphors Homework.docx'));
    const file = new File([bytes], 'P7 Similes and Metaphors Homework.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    expect(screen.getByRole('button', { name: 'Upload .docx' }).className).toContain('tip-end');
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Word document to upload'), { target: { files: [file] } });
    });
    await waitFor(() => expect(docTitle()).toBe('P7 Similes and Metaphors Homework'), { timeout: 5000 });
    const cmd = api.structural.mock.calls.at(-1)![0] as Extract<StructuralCommand, { command: 'doc_import' }>;
    expect(cmd).toMatchObject({ command: 'doc_import', thread_id: THREAD_ID, source: { kind: 'docx', filename: file.name, bytes: file.size } });
    // 19 blocks, the three lists in them a block per item (PLAN.md section 6).
    expect(cmd.blocks).toHaveLength(27);
    expect(joinRuns(cmd.blocks)).toHaveLength(19);
    expect(screen.getByText('Similes and Metaphors', { selector: 'h1' })).toBeTruthy();
    expect(document.querySelector('.doc-notice')).toBeNull();
  });

  const uploadFixture = async () => {
    const bytes = readFileSync(join(__dirname, '../../../../fixtures/docx/P7 Similes and Metaphors Homework.docx'));
    const file = new File([bytes], 'P7 Similes and Metaphors Homework.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Word document to upload'), { target: { files: [file] } });
    });
    await waitFor(() => expect(docTitle()).toBe('P7 Similes and Metaphors Homework'), { timeout: 5000 });
  };
  const commands = (api: ReturnType<typeof mockApi>) => api.structural.mock.calls.map((c) => c[0]);

  it('an upload replaces the open doc when it is a blank, untouched Untitled one', async () => {
    const snap = baseSnap();
    snap.docs[0] = { ...snap.docs[0]!, name: 'Untitled' };
    snap.blocks[0] = { ...snap.blocks[0]!, content: '' };
    const { api } = await renderScreen(snap);
    await uploadFixture();
    await waitFor(() => expect(commands(api).at(-1)).toEqual({ command: 'doc_delete', doc_id: DOC_ID }));
    expect(commands(api).map((c) => c.command)).toEqual(['doc_import', 'doc_delete']);
    const docs = within(screen.getByRole('list', { name: 'Documents in Similes for P7' }));
    await waitFor(() => expect(docs.getAllByRole('button', { name: /^(?!Options)/ }).map((b) => b.textContent)).toEqual(['Short version', 'P7 Similes and Metaphors Homework']));
    expect(docTitle()).toBe('P7 Similes and Metaphors Homework');
  });

  it('an upload is a new doc beside the open one when that one has text or a name', async () => {
    const named = baseSnap();
    named.blocks[0] = { ...named.blocks[0]!, content: '' };
    const { api } = await renderScreen(named);
    await uploadFixture();
    expect(commands(api).map((c) => c.command)).toEqual(['doc_import']);
    cleanup();

    const typed = baseSnap();
    typed.docs[0] = { ...typed.docs[0]!, name: 'Untitled' };
    const second = await renderScreen(typed);
    await uploadFixture();
    expect(commands(second.api).map((c) => c.command)).toEqual(['doc_import']);
  });

  it('says so when the chosen file is not a .docx', async () => {
    const { api } = await renderScreen();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Word document to upload'), { target: { files: [new File(['x'], 'notes.pdf')] } });
    });
    expect(screen.getByRole('alert').textContent).toBe('notes.pdf is not a Word .docx file.');
    expect(api.structural).not.toHaveBeenCalled();
  });

  it('an Untitled doc takes its first heading as its name', async () => {
    const snap = baseSnap();
    snap.docs[0] = { ...snap.docs[0]!, name: 'Untitled' };
    snap.blocks[0] = { ...snap.blocks[0]!, type: 'heading', content: '# Similes and **metaphors**' };
    const { api } = await renderScreen(snap);
    await waitFor(() => expect(api.structural).toHaveBeenCalledWith({ command: 'doc_rename', doc_id: DOC_ID, name: 'Similes and metaphors', auto: true }, expect.anything()), { timeout: 3000 });
    await waitFor(() => expect(docTitle()).toBe('Similes and metaphors'));
  });

  it('renames the doc on a double-click: Enter saves, Escape cancels', async () => {
    const { api } = await renderScreen();
    fireEvent.doubleClick(document.querySelector('.doc-title')!);
    const input = screen.getByLabelText('Document name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Similes for 7B' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(api.structural).toHaveBeenCalledWith({ command: 'doc_rename', doc_id: DOC_ID, name: 'Similes for 7B' }, expect.objectContaining({ doc_id: DOC_ID, thread_id: THREAD_ID }));
    expect(docTitle()).toBe('Similes for 7B');

    fireEvent.doubleClick(document.querySelector('.doc-title')!);
    fireEvent.change(screen.getByLabelText('Document name'), { target: { value: 'nope' } });
    fireEvent.keyDown(screen.getByLabelText('Document name'), { key: 'Escape' });
    expect(docTitle()).toBe('Similes for 7B');
    expect(api.structural).toHaveBeenCalledTimes(1);
  });

  it('the wand names the chat, and the sidebar follows', async () => {
    const { api } = await renderScreen();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Name this chat' }));
    });
    expect(api.nameThread).toHaveBeenCalledWith(THREAD_ID, expect.anything());
    expect(chatTitle()).toBe('Similes homework (P7)');
    expect(screen.getByRole('navigation', { name: 'Chats' }).textContent).toContain('Similes homework (P7)');
  });

  it('renames the chat on a double-click, and the sidebar follows', async () => {
    const { api } = await renderScreen();
    fireEvent.doubleClick(document.querySelector('.chat-title')!);
    const input = screen.getByLabelText('Chat name') as HTMLInputElement;
    expect(input.value).toBe('Similes for P7');
    fireEvent.change(input, { target: { value: 'Similes 7B' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(api.renameThread).toHaveBeenCalledWith(THREAD_ID, 'Similes 7B', expect.objectContaining({ thread_id: THREAD_ID }));
    expect(chatTitle()).toBe('Similes 7B');
    expect(within(screen.getByRole('region', { name: 'Chats list' })).getByRole('button', { name: 'Similes 7B' })).toBeTruthy();
    // Its docs list follows too.
    expect(screen.getByRole('list', { name: 'Documents in Similes 7B' })).toBeTruthy();
  });

  it('starts a new chat with its blank doc, and the sidebar collapses', async () => {
    const { api } = await renderScreen();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    });
    expect(api.createThread).toHaveBeenCalledTimes(1);
    expect(docTitle()).toBe('Untitled');
    expect(chatTitle()).toBe('Untitled');
    expect(api.getChat).toHaveBeenLastCalledWith(NEW_ID);

    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }));
    expect(screen.queryByRole('navigation', { name: 'Chats' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Similes for P7' })).toBeNull();
    expect(localStorage.getItem('edw.threadsOpen')).toBe('closed');
    // The chat's header opens it again, and can start a chat with it closed.
    const header = document.querySelector('.chat-head') as HTMLElement;
    const second = '01JNEW0000000000000000000B';
    api.createThread.mockResolvedValueOnce({
      thread: testThread({ id: second, created_at: '2026-10-29T14:05:00.000Z' }),
      doc: testDoc({ id: '01JNEWD0C0000000000000000B', thread_id: second }),
    });
    await act(async () => {
      fireEvent.click(within(header).getByRole('button', { name: 'New chat' }));
    });
    expect(api.createThread).toHaveBeenCalledTimes(2);
    fireEvent.click(within(header).getByRole('button', { name: 'Open sidebar' }));
    expect(screen.getByRole('navigation', { name: 'Chats' })).toBeTruthy();
    expect(localStorage.getItem('edw.threadsOpen')).toBe('open');
  });

  it('sends chat about the open doc, takes the thread title and opens a doc the model created', async () => {
    const { api } = await renderScreen();
    const created: Doc = testDoc({ id: '01JMODELD0C000000000000000', name: 'Simpler version', created_by: 'model', created_at: '2026-10-29T15:00:00.000Z' });
    const reply: ChatReply = {
      ok: true,
      turn_id: 't1',
      message: 'Started a new document.',
      changes: { blocks: [testBlock({ id: '01JB10CK000000000000000009', content: 'Short text', doc_id: created.id, status: 'proposed' })], docs: [created] },
      proposed_block_ids: ['01JB10CK000000000000000009'],
      created_doc_ids: [created.id],
    };
    api.sendChat.mockResolvedValue(reply);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Put a simpler one in a new document' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });
    expect(api.sendChat.mock.calls[0]!.slice(0, 3)).toEqual([THREAD_ID, DOC_ID, 'Put a simpler one in a new document']);
    await waitFor(() => expect(docTitle()).toBe('Simpler version'));
    expect(within(document.querySelector('.canvas-pm') as HTMLElement).getByText('Short text')).toBeTruthy();
    // The model never names the chat.
    expect(chatTitle()).toBe('Similes for P7');
    expect(screen.getByRole('toolbar', { name: 'Suggestions' })).toBeTruthy();
  });

  it('accept all decides only the open doc, and logs it with the doc id', async () => {
    const snap = baseSnap();
    snap.blocks[0] = { ...snap.blocks[0]!, status: 'proposed' };
    snap.blocks[1] = { ...snap.blocks[1]!, status: 'proposed' };
    const { logger } = await renderScreen(snap);
    fireEvent.click(screen.getByRole('button', { name: 'Accept all' }));
    expect(logged(logger, 'proposal_accept')).toEqual([{ block_id: null, doc_id: DOC_ID, mode: 'accept_all' }]);
    expect(screen.queryByRole('toolbar', { name: 'Suggestions' })).toBeNull();
    fireEvent.click(within(screen.getByRole('list', { name: 'Documents in Similes for P7' })).getByRole('button', { name: 'Short version' }));
    expect(screen.getByRole('toolbar', { name: 'Suggestions' })).toBeTruthy();
  });

  it('previews the streamed changes in the locked doc, then shows the real suggestions', async () => {
    const { api } = await renderScreen();
    let push!: (d: string) => void;
    let finish!: (r: ChatReply) => void;
    const stream = vi.fn((_t: string, _d: string, _p: string, _e: unknown, _a: unknown, onText: (d: string) => void) => {
      push = (d) => act(() => onText(d));
      return new Promise<ChatReply>((r) => (finish = r));
    });
    (api as SessionApi).sendChatStream = stream;
    // Remount the chat with the streaming API by switching threads away and back.
    cleanup();
    const logger = mockLogger();
    const context: { current: EventContext } = { current: { doc_id: null, thread_id: null } };
    render(<WorkspaceScreen session={makeSession()} api={api} logger={logger} focusState={createFocusPaneState()} context={context} />);
    await waitFor(() => expect(document.querySelector('.doc-title')).not.toBeNull());
    await act(async () => undefined);

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Add a part 2' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });
    const after = '01JB10CK000000000000000001';
    push('Adding it.\n\n```json\n[{"op":"insert","after":"' + after + '","type":"heading","content":"## Part');
    expect(screen.getByText('Part')).toBeTruthy();
    expect(document.querySelector('.canvas-frame.busy')).not.toBeNull();
    expect(document.querySelectorAll('.suggestion-card')).toHaveLength(0);
    push(' 2"}]\n```');
    expect(screen.getByText('Part 2')).toBeTruthy();

    const real = testBlock({ id: '01JB10CK000000000000000077', type: 'heading', content: '## Part 2', status: 'proposed', order: 1 });
    await act(async () =>
      finish({ ok: true, turn_id: 't1', message: 'Adding it.', changes: { blocks: [real], docs: [] }, proposed_block_ids: [real.id], created_doc_ids: [] }),
    );
    expect(document.querySelector('.canvas-frame.busy')).toBeNull();
    expect(document.querySelector(`[data-block-id="${real.id}"]`)?.textContent).toBe('Part 2');
    expect(document.querySelector(`[data-block-id="${real.id}"]`)?.classList.contains('st-proposed')).toBe(true);
    // The new suggestion's card shows in the comments column.
    expect(screen.getAllByRole('group', { name: /^Suggestion:/ }).map((g) => g.textContent)).toEqual([expect.stringContaining('Add heading')]);
  });

  it("shows the model's change to a block the teacher typed in before asking (Editing mode takes it in at once)", async () => {
    const { api } = await renderScreen();
    let push!: (d: string) => void;
    let finish!: (r: ChatReply) => void;
    (api as SessionApi).sendChatStream = vi.fn((_t: string, _d: string, _p: string, _e: unknown, _a: unknown, onText: (d: string) => void) => {
      push = (d) => act(() => onText(d));
      return new Promise<ChatReply>((r) => (finish = r));
    });
    cleanup();
    const context: { current: EventContext } = { current: { doc_id: null, thread_id: null } };
    render(<WorkspaceScreen session={makeSession()} api={api} logger={mockLogger()} focusState={createFocusPaneState()} context={context} />);
    await waitFor(() => expect(document.querySelector('.doc-title')).not.toBeNull());
    await act(async () => undefined);

    // The teacher adds to the first block, then asks straight away.
    const id = '01JB10CK000000000000000001';
    const editor = (document.querySelector('.canvas-pm') as HTMLElement & { editor: import('@tiptap/core').Editor }).editor;
    act(() => {
      editor.commands.focus('end');
      editor.commands.insertContent(' And metaphors.');
    });
    expect(document.querySelector(`[data-block-id="${id}"]`)?.textContent).toBe('Similes compare using like or as. And metaphors.');
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Simpler, please' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));
    push('Simpler now.\n\n```json\n[{"op":"replace","id":"' + id + '","content":"Similes use like or as."}]\n```');

    // Editing mode: the server took the change in, so the block comes back live with the model's text.
    const live = testBlock({ id, content: 'Similes use like or as.', version: 3 });
    await act(async () => finish({ ok: true, turn_id: 't1', message: 'Simpler now.', changes: { blocks: [live], docs: [] }, proposed_block_ids: [], created_doc_ids: [] }));
    expect(document.querySelector(`[data-block-id="${id}"]`)?.textContent).toBe('Similes use like or as.');
  });

  it("Editing mode, typing in the block while the assistant changes it: shows both, merged by the server", async () => {
    const { api } = await renderScreen();
    let push!: (d: string) => void;
    let finish!: (r: ChatReply) => void;
    (api as SessionApi).sendChatStream = vi.fn((_t: string, _d: string, _p: string, _e: unknown, _a: unknown, onText: (d: string) => void) => {
      push = (d) => act(() => onText(d));
      return new Promise<ChatReply>((r) => (finish = r));
    });
    cleanup();
    const context: { current: EventContext } = { current: { doc_id: null, thread_id: null } };
    render(<WorkspaceScreen session={makeSession()} api={api} logger={mockLogger()} focusState={createFocusPaneState()} context={context} />);
    await waitFor(() => expect(document.querySelector('.doc-title')).not.toBeNull());
    await act(async () => undefined);

    const id = '01JB10CK000000000000000001';
    const editor = (document.querySelector('.canvas-pm') as HTMLElement & { editor: import('@tiptap/core').Editor }).editor;
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Shorter, please' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));
    // While the assistant thinks, the teacher adds to the block.
    act(() => {
      editor.commands.focus('end');
      editor.commands.insertContent(' Try one.');
    });
    // The typing is sent in the editor's next batch (0.5 s), well before the reply's edits arrive.
    await act(async () => new Promise((r) => setTimeout(r, 700)));
    push('Shorter.\n\n```json\n[{"op":"replace","id":"' + id + '","content":"Similes use like or as."}]\n```');
    const merged = testBlock({ id, content: 'Similes use like or as. Try one.', version: 4 });
    await act(async () =>
      finish({ ok: true, turn_id: 't1', message: 'Shorter.', changes: { blocks: [merged], docs: [] }, proposed_block_ids: [], created_doc_ids: [], typed_during: [id] }),
    );
    expect(document.querySelector(`[data-block-id="${id}"]`)?.textContent).toBe('Similes use like or as. Try one.');
  });

  it("Editing mode, typing just as the assistant's edits start: the typing is sent first, and both show", async () => {
    const { api } = await renderScreen();
    let push!: (d: string) => void;
    let finish!: (r: ChatReply) => void;
    (api as SessionApi).sendChatStream = vi.fn((_t: string, _d: string, _p: string, _e: unknown, _a: unknown, onText: (d: string) => void) => {
      push = (d) => act(() => onText(d));
      return new Promise<ChatReply>((r) => (finish = r));
    });
    cleanup();
    const context: { current: EventContext } = { current: { doc_id: null, thread_id: null } };
    render(<WorkspaceScreen session={makeSession()} api={api} logger={mockLogger()} focusState={createFocusPaneState()} context={context} />);
    await waitFor(() => expect(document.querySelector('.doc-title')).not.toBeNull());
    await act(async () => undefined);

    const id = '01JB10CK000000000000000001';
    const editor = (document.querySelector('.canvas-pm') as HTMLElement & { editor: import('@tiptap/core').Editor }).editor;
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Shorter, please' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));
    // While the assistant thinks, the teacher adds to the block.
    act(() => {
      editor.commands.focus('end');
      editor.commands.insertContent(' Try one.');
    });
    // No pause: the edits start while the typing is still in the editor's batch. The doc locks for
    // the preview, which sends that typing first.
    push('Shorter.\n\n```json\n[{"op":"replace","id":"' + id + '","content":"Similes use like or as."}]\n```');
    const merged = testBlock({ id, content: 'Similes use like or as. Try one.', version: 4 });
    await act(async () =>
      finish({ ok: true, turn_id: 't1', message: 'Shorter.', changes: { blocks: [merged], docs: [] }, proposed_block_ids: [], created_doc_ids: [], typed_during: [id] }),
    );
    expect(document.querySelector(`[data-block-id="${id}"]`)?.textContent).toBe('Similes use like or as. Try one.');
  });

  it('shows each suggestion as a card in the comments column, one per change in a paragraph, and decides each on its own', async () => {
    const snap = baseSnap();
    const A = snap.blocks[0]!.id;
    const B = '01JB10CK000000000000000009';
    // "Similes compare using like or as." -> two changes: "compare" to "describe", and an example added.
    snap.blocks[0] = { ...snap.blocks[0]!, pending: { op: 'replace', turn_id: 't', content: 'Similes describe using like or as, e.g. as brave as a lion.' } };
    snap.blocks.push(testBlock({ id: B, content: 'Try writing three of your own.', status: 'proposed', order: 1 }));
    const { logger } = await renderScreen(snap);
    const cards = () => screen.queryAllByRole('group', { name: /^Suggestion:/ });
    expect(cards().map((c) => c.textContent)).toEqual([
      expect.stringContaining('Replace: “compare” with “describe”'),
      expect.stringContaining('Add: “, e.g. as brave as a lion”'),
      expect.stringContaining('Try writing three of your own.'),
    ]);
    expect(screen.getByLabelText('3 suggestions')).toBeTruthy();
    expect([...document.querySelectorAll(`[data-block-id="${A}"] .sg-ins`)].map((e) => e.textContent)).toEqual(['describe', ', e.g. as brave as a lion']);

    // A click on the second change in the text picks out its card alone, and brings it into view.
    const scrolled = vi.fn();
    cards()[1]!.scrollIntoView = scrolled;
    act(() => {
      document.querySelectorAll(`[data-block-id="${A}"] .sg-ins`)[1]!.dispatchEvent(new CustomEvent(SUGGESTION_SELECT, { bubbles: true, detail: { block_id: A, part: 1 } }));
    });
    expect(cards().map((c) => c.dataset.active === 'true')).toEqual([false, true, false]);
    await waitFor(() => expect(scrolled).toHaveBeenCalled());
    // Clicking a card picks out it alone too.
    fireEvent.click(cards()[0]!);
    expect(cards().map((c) => c.dataset.active === 'true')).toEqual([true, false, false]);

    // Accept the first change only: the block takes it in, the second still waits.
    fireEvent.click(within(cards()[0]!).getByRole('button', { name: 'Accept: edit paragraph' }));
    expect(logged(logger, 'proposal_accept')).toEqual([
      {
        block_id: A,
        doc_id: DOC_ID,
        mode: 'click',
        part: { index: 0, ins: 'describe', del: 'compare', live_after: { content: 'Similes describe using like or as.' }, suggested_after: { content: 'Similes describe using like or as, e.g. as brave as a lion.' } },
      },
    ]);
    expect(cards()).toHaveLength(2);
    expect([...document.querySelectorAll(`[data-block-id="${A}"] .sg-ins`)].map((e) => e.textContent)).toEqual([', e.g. as brave as a lion']);
    // Reject the other: nothing is left to decide on the block, and its text is the accepted one.
    fireEvent.click(within(cards()[0]!).getByRole('button', { name: 'Reject: edit paragraph' }));
    expect(logged(logger, 'proposal_reject')).toEqual([expect.objectContaining({ block_id: A, part: expect.objectContaining({ index: 0, ins: ', e.g. as brave as a lion', del: '' }) })]);
    expect(document.querySelector(`[data-block-id="${A}"]`)?.textContent).toBe('Similes describe using like or as.');
    expect(document.querySelector(`[data-block-id="${A}"] .sg-ins`)).toBeNull();
    // A new block has one card for the whole block.
    fireEvent.click(within(cards()[0]!).getByRole('button', { name: 'Reject: add paragraph' }));
    expect(logged(logger, 'proposal_reject').at(-1)).toEqual({ block_id: B, doc_id: DOC_ID, mode: 'click' });
    expect(cards()).toHaveLength(0);
  });

  describe('in a phone-sized window', () => {
    afterEach(() => setWindowWidth(null));

    it('puts the editor over the chat, with the sidebar a drawer opened from the document header', async () => {
      localStorage.setItem('edw.threadsOpen', 'open');
      setWindowWidth(400);
      await renderScreen();
      // Closed to start, whatever was remembered from a wide window: no rail, no handle.
      expect(screen.queryByRole('navigation', { name: 'Chats' })).toBeNull();
      expect(screen.queryByRole('separator', { name: 'Resize the sidebar' })).toBeNull();
      const docHead = document.querySelector('.doc-head') as HTMLElement;
      // One button for the closed sidebar, so the title keeps its room: New chat is in the drawer.
      expect(within(docHead).queryByRole('button', { name: 'New chat' })).toBeNull();
      fireEvent.click(within(docHead).getByRole('button', { name: 'Open sidebar' }));
      const drawer = screen.getByRole('dialog', { name: 'Sidebar' });
      // Picking a chat in it opens the chat and closes the drawer.
      await act(async () => {
        fireEvent.click(within(drawer).getByRole('button', { name: 'Metaphors for P6' }));
      });
      expect(chatTitle()).toBe('Metaphors for P6');
      expect(screen.queryByRole('dialog', { name: 'Sidebar' })).toBeNull();
      // Escape closes it too.
      fireEvent.click(within(docHead).getByRole('button', { name: 'Open sidebar' }));
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog', { name: 'Sidebar' })).toBeNull();
      expect(localStorage.getItem('edw.threadsOpen')).toBe('open');
    });

    it('the line between the editor and the chat moves up and down, and the chat keeps its share', async () => {
      setWindowWidth(400);
      await renderScreen();
      const line = screen.getByRole('separator', { name: 'Resize the chat' });
      expect(line.getAttribute('aria-orientation')).toBe('horizontal');
      const chat = document.querySelector('[data-pane="chat"]') as HTMLElement;
      expect(chat.style.getPropertyValue('--chat-share')).toBe('33.3%');
      // Up grows the chat (it is below the line).
      fireEvent.keyDown(line, { key: 'ArrowUp' });
      expect(Number(localStorage.getItem('edw.chatShare'))).toBeGreaterThan(1 / 3);
      expect(Number(chat.style.getPropertyValue('--chat-share').replace('%', ''))).toBeGreaterThan(33.3);
    });
  });
});
