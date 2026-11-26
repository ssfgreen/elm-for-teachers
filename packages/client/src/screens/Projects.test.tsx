import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_REFERENCE_LIMITS, type Project, type ReferenceFile, type Thread } from '@edw/shared';
import type { SessionApi } from '../api/participant';
import type { CanvasSnapshot } from '../editor/types.js';
import type { EventContext } from '../events/logger';
import { createFocusPaneState } from '../events/trackers';
import { DOC_ID, THREAD_ID, installEditorPolyfills, installIntersectionObserver, makeSession, mockLogger, testBlock, testDoc, testThread } from '../test-utils';
import { WorkspaceScreen } from './WorkspaceScreen';

beforeAll(() => {
  installIntersectionObserver();
  installEditorPolyfills();
});
beforeEach(() => localStorage.clear());
afterEach(cleanup);

const P1 = '01JPR0JECT0000000000000001';
const P2 = '01JPR0JECT0000000000000002';
const PROJECT_CHAT = '01JTHREAD0000000000000000P';
const PROJECT_DOC = '01JD0C0000000000000000000P';
const NEW_CHAT = '01JNEWCHAT0000000000000000';
const NEW_DOC = '01JNEWD0C00000000000000000';

const project = (p: Partial<Project> & { id: string }): Project => ({
  session_id: 'S1',
  name: 'Year 8 poetry',
  description: 'Help my Year 8 class write their own poems.',
  instructions: null,
  created_at: '2026-10-30T09:00:00.000Z',
  archived_at: null,
  deleted_at: null,
  ...p,
});

const reference = (p: Partial<ReferenceFile> & { id: string; name: string }): ReferenceFile => ({
  session_id: 'S1',
  project_id: P1,
  thread_id: null,
  mime: 'application/pdf',
  bytes: 340 * 1024,
  pages: 12,
  chars: 40_000,
  est_tokens: 10_000,
  summary: null,
  status: 'ready',
  created_at: '2026-10-30T09:05:00.000Z',
  deleted_at: null,
  ...p,
});

function mockApi(projects: Project[]) {
  const snap: CanvasSnapshot = {
    blocks: [testBlock({ id: '01JB10CK000000000000000001', content: 'Similes compare using like or as.' })],
    docs: [testDoc({ id: DOC_ID, name: 'Similes' }), testDoc({ id: PROJECT_DOC, thread_id: PROJECT_CHAT, name: 'Poem plan', created_at: '2026-10-28T09:00:00.000Z' })],
  };
  const threads: Thread[] = [
    testThread({ id: THREAD_ID, title: 'Similes for P7', created_at: '2026-10-29T12:00:00.000Z' }),
    testThread({ id: PROJECT_CHAT, title: 'Haiku lesson', project_id: P1, created_at: '2026-10-28T09:00:00.000Z' }),
  ];
  return {
    sessionId: 'S1',
    getCanvas: vi.fn(() => Promise.resolve(snap)),
    structural: vi.fn(async () => ({ changes: { blocks: [], docs: [] }, block: null, doc: null })),
    listThreads: vi.fn(() => Promise.resolve(threads)),
    renameThread: vi.fn(async (threadId: string, title: string) => ({ ...threads.find((t) => t.id === threadId)!, title })),
    createThread: vi.fn(async (_env: unknown, projectId?: string | null) => ({
      thread: testThread({ id: NEW_CHAT, project_id: projectId ?? null, created_at: '2026-11-01T10:00:00.000Z' }),
      doc: testDoc({ id: NEW_DOC, thread_id: NEW_CHAT }),
    })),
    listProjects: vi.fn(() => Promise.resolve(projects)),
    createProject: vi.fn(async (fields: { name: string; description?: string | null }) => project({ id: P2, name: fields.name, description: fields.description ?? null, created_at: '2026-11-01T09:00:00.000Z' })),
    updateProject: vi.fn(async (id: string, fields: { description?: string | null; instructions?: string | null }) => ({ ...projects.find((p) => p.id === id)!, ...fields })),
    renameProject: vi.fn(async (id: string, name: string) => ({ ...projects.find((p) => p.id === id)!, name })),
    archiveProject: vi.fn(async (id: string) => ({ ...projects.find((p) => p.id === id)!, archived_at: '2026-11-01T11:00:00.000Z' })),
    deleteProject: vi.fn(async (id: string) => ({ project: { ...projects.find((p) => p.id === id)!, deleted_at: '2026-11-01T11:00:00.000Z' }, thread_ids: threads.filter((t) => t.project_id === id).map((t) => t.id) })),
    listReferences: vi.fn(async () => ({ references: [reference({ id: '01JREF00000000000000000001', name: 'KS3 curriculum.pdf' })], limits: DEFAULT_REFERENCE_LIMITS })),
    addReference: vi.fn(async (projectId: string, file: File) => reference({ id: '01JREF00000000000000000002', project_id: projectId, name: file.name, pages: 1, bytes: file.size })),
    deleteReference: vi.fn(() => Promise.resolve()),
    getReferencePages: vi.fn(async (id: string) => ({
      reference: reference({ id, name: 'KS3 curriculum.pdf' }),
      pages: [
        { page: 1, text: 'Pupils should be taught to read critically.' },
        { page: 2, text: 'Poetry: form, rhyme and metre.' },
      ],
      original: true,
    })),
    referenceOriginalUrl: (id: string) => `/api/sessions/S1/references/${id}/original?token=t`,
    addChatFile: vi.fn(async (threadId: string, file: File) => reference({ id: '01JREF0000000000000000CHAT', project_id: null, thread_id: threadId, name: file.name, mime: 'text/plain', pages: 1, bytes: file.size })),
    getChat: vi.fn<SessionApi['getChat']>(() => Promise.resolve([])),
    sendChat: vi.fn<SessionApi['sendChat']>(() => Promise.resolve({ ok: true, turn_id: 't1', message: 'Here is a plan.', changes: { blocks: [], docs: [] }, proposed_block_ids: [], created_doc_ids: [] })),
    uploadAsset: vi.fn(() => Promise.resolve({ asset_id: 'ast_1' })),
    listComments: vi.fn<SessionApi['listComments']>(() => Promise.resolve([])),
    createComment: vi.fn<SessionApi['createComment']>(),
    deleteComment: vi.fn<SessionApi['deleteComment']>(() => Promise.resolve()),
    editComment: vi.fn<SessionApi['editComment']>(),
    resolveComment: vi.fn<SessionApi['resolveComment']>(),
    answerComment: vi.fn<SessionApi['answerComment']>(),
    assetUrl: (src: string) => src,
  } satisfies SessionApi;
}

async function renderScreen(projects = [project({ id: P1 })]) {
  const logger = mockLogger();
  const api = mockApi(projects);
  const context: { current: EventContext } = { current: { doc_id: null, thread_id: null } };
  render(<WorkspaceScreen session={makeSession()} api={api} logger={logger} focusState={createFocusPaneState()} context={context} />);
  await waitFor(() => expect(document.querySelector('.doc-title')).not.toBeNull());
  await act(async () => undefined);
  return { logger, api };
}

const sidebar = () => within(screen.getByRole('navigation', { name: 'Chats' }));
const logged = (logger: ReturnType<typeof mockLogger>, kind: string) => logger.log.mock.calls.filter((c) => c[0] === kind).map((c) => c[1]);

describe('projects', () => {
  it('lists projects above the chats; a project’s chats are on its page, not in the chats list', async () => {
    await renderScreen();
    const projects = within(screen.getByRole('region', { name: 'Projects' }));
    expect(projects.getByRole('button', { name: 'New project' })).toBeTruthy();
    expect(projects.getByRole('button', { name: 'Year 8 poetry' })).toBeTruthy();
    const chats = within(screen.getByRole('region', { name: 'Chats list' }));
    expect(chats.getByRole('button', { name: 'Similes for P7' })).toBeTruthy();
    expect(chats.queryByRole('button', { name: 'Haiku lesson' })).toBeNull();
  });

  it('puts an archived project’s chats back in the chats list', async () => {
    await renderScreen([project({ id: P1, archived_at: '2026-10-31T09:00:00.000Z' })]);
    expect(sidebar().queryByRole('button', { name: 'Year 8 poetry' })).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Chats list' })).getByRole('button', { name: 'Haiku lesson' })).toBeTruthy();
  });

  it('makes a project from the two questions and its files, then opens its page', async () => {
    const { api, logger } = await renderScreen();
    fireEvent.click(sidebar().getByRole('button', { name: 'New project' }));
    expect(logged(logger, 'project_open')).toEqual([{ project_id: null }]);
    const form = within(screen.getByRole('form', { name: 'New project' }));
    expect(form.getByRole('button', { name: 'Create project' })).toHaveProperty('disabled', true);
    fireEvent.change(form.getByPlaceholderText('Name your project'), { target: { value: 'Year 9 Macbeth' } });
    fireEvent.change(form.getByPlaceholderText('Describe your project, goals, subject, etc...'), { target: { value: 'Revision for the mock.' } });
    const file = new File(['Act 1 notes'], 'Act 1.txt', { type: 'text/plain' });
    fireEvent.change(form.getByLabelText('Files to add'), { target: { files: [file] } });
    expect(form.getByText('Act 1.txt')).toBeTruthy();
    await act(async () => {
      fireEvent.click(form.getByRole('button', { name: 'Create project' }));
    });
    expect(api.createProject).toHaveBeenCalledWith({ name: 'Year 9 Macbeth', description: 'Revision for the mock.' }, expect.anything());
    expect(api.addReference).toHaveBeenCalledWith(P2, file, expect.anything());
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Year 9 Macbeth' })).toBeTruthy());
    expect(sidebar().getByRole('button', { name: 'Year 9 Macbeth' }).getAttribute('aria-current')).toBe('true');
    expect(logged(logger, 'project_open')).toContainEqual({ project_id: P2 });
  });

  it('a file that fails when the project is made is reported on its page', async () => {
    const { api } = await renderScreen();
    api.addReference.mockRejectedValueOnce(new Error('boom'));
    fireEvent.click(sidebar().getByRole('button', { name: 'New project' }));
    const form = within(screen.getByRole('form', { name: 'New project' }));
    fireEvent.change(form.getByPlaceholderText('Name your project'), { target: { value: 'Year 9 Macbeth' } });
    fireEvent.change(form.getByLabelText('Files to add'), { target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] } });
    await act(async () => {
      fireEvent.click(form.getByRole('button', { name: 'Create project' }));
    });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('“notes.txt” could not be added'));
  });

  it('shows the project page: description, instructions saved on blur, its files and chats', async () => {
    const { api } = await renderScreen();
    fireEvent.click(sidebar().getByRole('button', { name: 'Year 8 poetry' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Year 8 poetry' })).toBeTruthy();
    expect((screen.getByLabelText('What are you trying to achieve?') as HTMLTextAreaElement).value).toBe('Help my Year 8 class write their own poems.');
    // The chat and doc are behind the page.
    expect(screen.queryByRole('region', { name: 'Document' })).toBeNull();

    const instructions = screen.getByRole('textbox', { name: 'Instructions' });
    fireEvent.change(instructions, { target: { value: 'Keep it to one side of A4.' } });
    await act(async () => {
      fireEvent.blur(instructions);
    });
    expect(api.updateProject).toHaveBeenCalledWith(P1, { instructions: 'Keep it to one side of A4.' }, expect.anything());
    expect(screen.getByText('Saved')).toBeTruthy();

    const context = within(screen.getByRole('region', { name: 'Context' }));
    await waitFor(() => expect(context.getByText('KS3 curriculum.pdf')).toBeTruthy());
    expect(context.getByText('PDF · 12 pages · 340 KB')).toBeTruthy();
    expect(context.getByText('1 of 20 files · 1% of the space for text')).toBeTruthy();

    const chats = within(screen.getByRole('region', { name: 'Chats in this project' }));
    expect(chats.getByRole('button', { name: /Haiku lesson/ })).toBeTruthy();
  });

  it('opens a context file to show its text as the model reads it, with Download for the original', async () => {
    const { api, logger } = await renderScreen();
    fireEvent.click(sidebar().getByRole('button', { name: 'Year 8 poetry' }));
    const context = within(screen.getByRole('region', { name: 'Context' }));
    await waitFor(() => expect(context.getByText('KS3 curriculum.pdf')).toBeTruthy());
    fireEvent.click(context.getByRole('button', { name: 'KS3 curriculum.pdf' }));
    const dialog = within(screen.getByRole('dialog', { name: 'KS3 curriculum.pdf' }));
    await waitFor(() => expect(dialog.getByText('Poetry: form, rhyme and metre.')).toBeTruthy());
    expect(api.getReferencePages).toHaveBeenCalledWith('01JREF00000000000000000001');
    expect(dialog.getByRole('region', { name: 'Page 1' })).toBeTruthy();
    expect(dialog.getByRole('link', { name: 'Download' }).getAttribute('href')).toBe('/api/sessions/S1/references/01JREF00000000000000000001/original?token=t');
    expect(logged(logger, 'reference_open')).toEqual([{ reference_id: '01JREF00000000000000000001' }]);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('adds and removes context files on the page', async () => {
    const { api } = await renderScreen();
    fireEvent.click(sidebar().getByRole('button', { name: 'Year 8 poetry' }));
    const context = within(screen.getByRole('region', { name: 'Context' }));
    await waitFor(() => expect(context.getByText('KS3 curriculum.pdf')).toBeTruthy());
    const file = new File(['A poem'], 'Model poem.txt', { type: 'text/plain' });
    await act(async () => {
      fireEvent.change(context.getByLabelText('Files to add'), { target: { files: [file] } });
    });
    expect(api.addReference).toHaveBeenCalledWith(P1, file, expect.anything());
    await waitFor(() => expect(context.getByText('Model poem.txt')).toBeTruthy());

    fireEvent.click(context.getByRole('button', { name: 'Remove KS3 curriculum.pdf' }));
    await act(async () => {
      fireEvent.click(context.getByRole('button', { name: 'Remove' }));
    });
    expect(api.deleteReference).toHaveBeenCalledWith('01JREF00000000000000000001', expect.anything());
    expect(context.queryByText('KS3 curriculum.pdf')).toBeNull();
  });

  it('starts a chat in the project with its first message, and the chat links back to the project', async () => {
    const { api } = await renderScreen();
    fireEvent.click(sidebar().getByRole('button', { name: 'Year 8 poetry' }));
    // The same box as in a chat: "+" and Send.
    expect(screen.getByRole('button', { name: 'Add files' })).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Start a chat in this project' }), { target: { value: 'Plan a haiku lesson' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });
    expect(api.createThread).toHaveBeenCalledWith(expect.anything(), P1);
    await waitFor(() => expect(api.sendChat).toHaveBeenCalled());
    expect(api.sendChat.mock.calls[0]!.slice(0, 3)).toEqual([NEW_CHAT, NEW_DOC, 'Plan a haiku lesson']);
    expect(screen.getByRole('region', { name: 'Document' })).toBeTruthy();
    // The sidebar nests the new chat under its project.
    // (The chat, then its doc: both are still called Untitled.)
    expect(within(sidebar().getByRole('list', { name: 'Chats in Year 8 poetry' })).getAllByRole('button', { name: 'Untitled' }).map((b) => b.getAttribute('aria-current'))).toEqual(['true', 'true']);

    fireEvent.click(sidebar().getByRole('button', { name: 'Year 8 poetry' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Year 8 poetry' })).toBeTruthy();
  });

  it('a file added on the project page makes the chat, and goes with the first message', async () => {
    const { api } = await renderScreen();
    fireEvent.click(sidebar().getByRole('button', { name: 'Year 8 poetry' }));
    const file = new File(['Haiku are 5-7-5'], 'Haiku rules.txt', { type: 'text/plain' });
    const start = within(screen.getByRole('textbox', { name: 'Start a chat in this project' }).closest('form')!);
    await act(async () => {
      fireEvent.change(start.getByLabelText('Files to add'), { target: { files: [file] } });
    });
    expect(api.createThread).toHaveBeenCalledWith(expect.anything(), P1);
    await waitFor(() => expect(api.addChatFile).toHaveBeenCalledWith(NEW_CHAT, file, expect.anything()));
    // Not listed until the message is sent.
    expect(within(screen.getByRole('region', { name: 'Chats in this project' })).queryByRole('button', { name: /Untitled/ })).toBeNull();
    await waitFor(() => expect(start.getByText('TXT')).toBeTruthy());
    fireEvent.change(start.getByRole('textbox', { name: 'Start a chat in this project' }), { target: { value: 'Use these rules' } });
    await act(async () => {
      fireEvent.click(start.getByRole('button', { name: 'Send' }));
    });
    expect(api.createThread).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(api.sendChat).toHaveBeenCalled());
    expect(api.sendChat.mock.calls[0]).toEqual([NEW_CHAT, NEW_DOC, 'Use these rules', expect.anything(), undefined, ['01JREF0000000000000000CHAT']]);
  });

  it('in a project chat the sidebar nests the chat under its project, and its docs under the chat', async () => {
    await renderScreen();
    fireEvent.click(sidebar().getByRole('button', { name: 'Year 8 poetry' }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Chats in this project' })).getByRole('button', { name: /Haiku lesson/ }));
    expect(screen.queryByRole('navigation', { name: 'Breadcrumbs' })).toBeNull();
    expect(sidebar().queryByRole('textbox', { name: 'Instructions' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Projects' })).toBeTruthy();
    const chats = within(sidebar().getByRole('list', { name: 'Chats in Year 8 poetry' }));
    expect(chats.getByRole('button', { name: 'Haiku lesson' }).getAttribute('aria-current')).toBe('true');
    // Only the chat is highlighted, not its project.
    expect(sidebar().getByRole('button', { name: 'Year 8 poetry' }).getAttribute('aria-current')).toBeNull();
    expect(within(sidebar().getByRole('list', { name: 'Documents in Haiku lesson' })).getByRole('button', { name: 'Poem plan' }).getAttribute('aria-current')).toBe('true');
    // On the project's page a click on the project folds its chats.
    fireEvent.click(sidebar().getByRole('button', { name: 'Year 8 poetry' }));
    expect(sidebar().getByRole('button', { name: 'Year 8 poetry' }).getAttribute('aria-current')).toBe('true');
    fireEvent.click(sidebar().getByRole('button', { name: 'Year 8 poetry' }));
    expect(sidebar().queryByRole('list', { name: 'Chats in Year 8 poetry' })).toBeNull();
    fireEvent.click(sidebar().getByRole('button', { name: 'Year 8 poetry' }));
    expect(sidebar().getByRole('list', { name: 'Chats in Year 8 poetry' })).toBeTruthy();
    // The chat isn't also in the main chats list.
    expect(within(screen.getByRole('region', { name: 'Chats list' })).queryByRole('button', { name: 'Haiku lesson' })).toBeNull();
  });

  it('opens a project chat from its page, and archives the project after a confirm', async () => {
    const { api } = await renderScreen();
    fireEvent.click(sidebar().getByRole('button', { name: 'Year 8 poetry' }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Chats in this project' })).getByRole('button', { name: /Haiku lesson/ }));
    expect(document.querySelector('.doc-title')?.textContent).toBe('Poem plan');

    fireEvent.click(sidebar().getByRole('button', { name: 'Year 8 poetry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Project options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive project' }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Archive project' })).getByRole('button', { name: 'Archive' }));
    });
    expect(api.archiveProject).toHaveBeenCalledWith(P1, expect.anything());
    expect(screen.getByRole('region', { name: 'Document' })).toBeTruthy();
    expect(sidebar().queryByRole('button', { name: 'Year 8 poetry' })).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Chats list' })).getByRole('button', { name: 'Haiku lesson' })).toBeTruthy();
  });

  it('deletes a project and its chats only once DELETE is typed, leaving its open chat', async () => {
    const { api } = await renderScreen();
    fireEvent.click(sidebar().getByRole('button', { name: 'Year 8 poetry' }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Chats in this project' })).getByRole('button', { name: /Haiku lesson/ }));
    fireEvent.click(sidebar().getByRole('button', { name: 'Year 8 poetry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Project options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete project' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Delete project' }));
    const box = dialog.getByRole('textbox', { name: 'Type DELETE to confirm' });
    const button = dialog.getByRole('button', { name: 'Delete' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(box, { target: { value: 'delete' } });
    expect(button.disabled).toBe(true);
    fireEvent.change(box, { target: { value: 'DELETE' } });
    expect(button.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(button);
    });
    expect(api.deleteProject).toHaveBeenCalledWith(P1, expect.anything());
    expect(sidebar().queryByRole('button', { name: 'Year 8 poetry' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Haiku lesson/ })).toBeNull();
    // Its chat was open: a new one opens in its place.
    expect(api.createThread).toHaveBeenCalled();
  });
});
